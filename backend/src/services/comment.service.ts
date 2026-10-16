import { Comment, IComment } from '../models/comment.model.js';
import { AppError } from '../utils/apiError.js';
import { hasPermission } from '../config/permissions.js';
import type { AuthUser } from '../middlewares/auth.middleware.js';
import { PostService, PUBLIC_AUTHOR_FIELDS, paginationMeta } from './post.service.js';
import { NotificationService } from './notification.service.js';
import { AuditService, AuditContext } from './audit.service.js';
import { realtime } from '../socket/realtime.js';
import { escapeRegex } from '../utils/content.js';

export class CommentService {
  /** Comments of a published, non-deleted post. Unpublished and deleted posts expose nothing. */
  static async listForPost(postId: string, { page, limit }: { page: number; limit: number }) {
    await PostService.findPublicPost(postId);
    const filter = { post: postId };
    const [comments, total] = await Promise.all([
      Comment.find(filter)
        .sort({ createdAt: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('author', PUBLIC_AUTHOR_FIELDS)
        .lean(),
      Comment.countDocuments(filter),
    ]);
    return { comments, meta: paginationMeta({ page, limit }, total) };
  }

  static async create(postId: string, authorId: string, content: string): Promise<IComment> {
    const post = await PostService.findPublicPost(postId);
    const comment = await Comment.create({ post: postId, author: authorId, content });
    await comment.populate('author', PUBLIC_AUTHOR_FIELDS);

    realtime.toPostReaders(postId, 'comment:created', { postId, comment: comment.toJSON() });
    const actor = comment.author as unknown as { name: string };
    await NotificationService.notify({
      recipients: [post.author],
      actorId: authorId,
      type: 'post_commented',
      message: `${actor.name} responded to “${post.title}”`,
      resourceType: 'post',
      resourceId: post._id,
      link: `/post/${post.slug}#responses`,
    });
    return comment;
  }

  /** Only the author may edit their words, and only while the post is still public. */
  static async update(commentId: string, content: string, actor: AuthUser): Promise<IComment> {
    const comment = await Comment.findById(commentId);
    if (!comment) throw new AppError('Comment not found', 404);
    if (String(comment.author) !== actor.userId) throw new AppError('You can only edit your own comments', 403);
    await PostService.findPublicPost(String(comment.post));

    comment.content = content;
    await comment.save();
    await comment.populate('author', PUBLIC_AUTHOR_FIELDS);
    realtime.toPostReaders(String(comment.post), 'comment:updated', { postId: String(comment.post), comment: comment.toJSON() });
    return comment;
  }

  /**
   * Authors can delete their own comments. Admins and staff with comments.moderate can
   * remove anyone's; those moderation removals are audited with the removed text's author.
   */
  static async remove(commentId: string, actor: AuthUser, ctx: AuditContext, reason = ''): Promise<void> {
    const comment = await Comment.findById(commentId);
    if (!comment) throw new AppError('Comment not found', 404);
    const isAuthor = String(comment.author) === actor.userId;
    if (!isAuthor && !hasPermission(actor, 'comments.moderate')) {
      throw new AppError('You can only delete your own comments', 403);
    }
    await comment.deleteOne();

    if (!isAuthor) {
      await AuditService.log(ctx, {
        action: 'comment.moderated',
        resourceType: 'comment',
        resourceId: comment.id,
        previousState: { post: String(comment.post), author: String(comment.author) },
        newState: { deleted: true },
        reason,
      });
    }
    realtime.toPostReaders(String(comment.post), 'comment:deleted', { postId: String(comment.post), commentId: comment.id });
  }

  /** Moderation listing across all posts. */
  static async listForModeration({ page, limit, search }: { page: number; limit: number; search?: string }) {
    const filter: Record<string, unknown> = {};
    if (search) filter.content = { $regex: escapeRegex(search), $options: 'i' };
    const [comments, total] = await Promise.all([
      Comment.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('author', 'name')
        .populate('post', 'title slug status isDeleted')
        .lean(),
      Comment.countDocuments(filter),
    ]);
    return { comments, meta: paginationMeta({ page, limit }, total) };
  }
}
