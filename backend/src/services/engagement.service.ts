import { Types } from 'mongoose';
import { Like, Bookmark } from '../models/engagement.model.js';
import { Post, PRIVATE_POST_FIELDS } from '../models/post.model.js';
import { User } from '../models/user.model.js';
import { AppError } from '../utils/apiError.js';
import { PostService, PUBLIC_AUTHOR_FIELDS, CATEGORY_FIELDS, paginationMeta } from './post.service.js';
import { NotificationService } from './notification.service.js';

const isDuplicate = (error: any) => error?.code === 11000;

export class EngagementService {
  /**
   * Likes are unique per user and post (database index). Liking twice is a no-op, and
   * likeCount only moves when a like is actually inserted or removed. Authors cannot like
   * their own articles.
   */
  static async like(postId: string, userId: string) {
    const post = await PostService.findPublicPost(postId);
    if (String(post.author) === userId) throw new AppError('You cannot like your own article', 400);

    try {
      await Like.create({ user: userId, post: postId });
    } catch (error) {
      if (!isDuplicate(error)) throw error;
      return { liked: true, likeCount: post.likeCount };
    }
    const [updated, actor] = await Promise.all([
      Post.findByIdAndUpdate(postId, { $inc: { likeCount: 1 } }, { new: true }).select('likeCount'),
      User.findById(userId).select('name').lean(),
    ]);

    // dedupeKey: like → unlike → like never notifies the author twice
    await NotificationService.notify({
      recipients: [post.author],
      actorId: userId,
      type: 'post_liked',
      message: `${actor?.name ?? 'Someone'} liked “${post.title}”`,
      resourceType: 'post',
      resourceId: post._id,
      link: `/post/${post.slug}`,
      dedupeKey: `like:${userId}:${postId}`,
    });
    return { liked: true, likeCount: updated?.likeCount ?? post.likeCount + 1 };
  }

  static async unlike(postId: string, userId: string) {
    const { deletedCount } = await Like.deleteOne({ user: userId, post: postId });
    const post = deletedCount
      ? await Post.findByIdAndUpdate(postId, { $inc: { likeCount: -1 } }, { new: true }).select('likeCount')
      : await Post.findById(postId).select('likeCount');
    if (!post) throw new AppError('Post not found', 404);
    return { liked: false, likeCount: Math.max(0, post.likeCount) };
  }

  static async bookmark(postId: string, userId: string) {
    await PostService.findPublicPost(postId);
    try {
      await Bookmark.create({ user: userId, post: postId });
    } catch (error) {
      if (!isDuplicate(error)) throw error;
    }
    return { bookmarked: true };
  }

  static async unbookmark(postId: string, userId: string) {
    await Bookmark.deleteOne({ user: userId, post: postId });
    return { bookmarked: false };
  }

  /** Saved posts that are still public; bookmarks of unpublished or deleted posts are hidden. */
  static async listBookmarks(userId: string, { page, limit }: { page: number; limit: number }) {
    const publicIds = await Bookmark.aggregate<{ post: Types.ObjectId; createdAt: Date }>([
      { $match: { user: new Types.ObjectId(userId) } },
      { $lookup: { from: 'posts', localField: 'post', foreignField: '_id', as: 'p', pipeline: [{ $project: { status: 1, isDeleted: 1 } }] } },
      { $match: { 'p.status': 'published', 'p.isDeleted': false } },
      { $sort: { createdAt: -1 } },
      { $facet: { rows: [{ $skip: (page - 1) * limit }, { $limit: limit }], total: [{ $count: 'n' }] } },
    ]);
    const facet = publicIds[0] as unknown as { rows: { post: Types.ObjectId }[]; total: { n: number }[] };
    const ids = facet.rows.map((r) => r.post);
    const posts = await Post.find({ _id: { $in: ids } })
      .select(`${PRIVATE_POST_FIELDS} -content`)
      .populate('author', PUBLIC_AUTHOR_FIELDS)
      .populate('category', CATEGORY_FIELDS)
      .lean();
    const order = new Map(ids.map((id, i) => [String(id), i]));
    posts.sort((a, b) => order.get(String(a._id))! - order.get(String(b._id))!);
    return { posts, meta: paginationMeta({ page, limit }, facet.total[0]?.n ?? 0) };
  }

  /** Whether the viewer has liked / bookmarked a post. */
  static async viewerState(postId: string, userId?: string) {
    if (!userId) return { liked: false, bookmarked: false };
    const [liked, bookmarked] = await Promise.all([
      Like.exists({ user: userId, post: postId }),
      Bookmark.exists({ user: userId, post: postId }),
    ]);
    return { liked: Boolean(liked), bookmarked: Boolean(bookmarked) };
  }
}
