import { Types } from 'mongoose';
import { Post, IPost } from '../models/post.model.js';
import { AuditLog } from '../models/auditLog.model.js';
import { AppError } from '../utils/apiError.js';
import type { AuthUser } from '../middlewares/auth.middleware.js';
import { AuditService, AuditContext } from './audit.service.js';
import { NotificationService } from './notification.service.js';
import {
  assertPublishable,
  auditedSave,
  releaseImage,
  paginationMeta,
  PUBLIC_AUTHOR_FIELDS,
  CATEGORY_FIELDS,
} from './post.service.js';
import { realtime } from '../socket/realtime.js';

export const MODERATION_ACTIONS = [
  'post.submitted',
  'post.revision_submitted',
  'post.approved',
  'post.rejected',
  'post.archived',
  'post.unarchived',
  'post.deleted',
  'post.restored',
];

type QueueStatus = 'pending_review' | 'rejected';

/** Which part of a post is awaiting a decision: a new submission or an edit to a live post. */
const pendingKind = (post: IPost): 'post' | 'revision' | null => {
  if (post.revision?.status === 'pending_review') return 'revision';
  if (post.status === 'pending_review') return 'post';
  return null;
};

/**
 * Staff may not decide on their own articles: that would let them bypass review. Admins
 * hold full editorial authority and may.
 */
const assertNotSelfReview = (post: IPost, actor: AuthUser) => {
  if (String(post.author) === actor.userId && actor.role !== 'admin') {
    throw new AppError('You cannot review your own article', 403);
  }
};

export class ModerationService {
  /** New submissions and pending edits (oldest first), or recently rejected work. */
  static async queue(query: { page: number; limit: number; status: QueueStatus }) {
    const field = query.status;
    const match = {
      isDeleted: false,
      $or: [{ status: field }, { 'revision.status': field }],
    };
    const queuedAt =
      field === 'pending_review'
        ? { $ifNull: ['$revision.submittedAt', '$submittedAt'] }
        : { $ifNull: ['$revision.reviewedAt', '$reviewedAt'] };

    const [rows, total] = await Promise.all([
      Post.aggregate([
        { $match: match },
        { $addFields: { queuedAt } },
        { $sort: { queuedAt: field === 'pending_review' ? 1 : -1, _id: 1 } },
        { $skip: (query.page - 1) * query.limit },
        { $limit: query.limit },
        { $project: { content: 0, 'revision.content': 0 } },
      ]),
      Post.countDocuments(match),
    ]);
    const posts = await Post.populate(rows, [
      { path: 'author', select: 'name avatar' },
      { path: 'category', select: CATEGORY_FIELDS },
      { path: 'revision.category', select: CATEGORY_FIELDS },
      { path: 'reviewedBy', select: 'name' },
    ]);
    return { posts, meta: paginationMeta(query, total) };
  }

  /** Full post (live version and any revision) plus its moderation history. */
  static async getForReview(postId: string) {
    const post = await Post.findOne({ _id: postId, isDeleted: false })
      .populate('author', `${PUBLIC_AUTHOR_FIELDS} email`)
      .populate('category', CATEGORY_FIELDS)
      .populate('revision.category', CATEGORY_FIELDS)
      .populate('reviewedBy', 'name')
      .lean();
    if (!post) throw new AppError('Post not found', 404);
    return { post, history: await this.history(postId) };
  }

  /** Moderation-related audit entries for one post: who submitted, reviewed and decided. */
  static async history(postId: string) {
    if (!Types.ObjectId.isValid(postId)) return [];
    return AuditLog.find({ resourceType: 'post', resourceId: postId, action: { $in: MODERATION_ACTIONS } })
      .sort({ createdAt: -1 })
      .limit(100)
      .select('action actor actorRole previousState newState reason createdAt')
      .populate('actor', 'name role')
      .lean();
  }

  /**
   * Publishes a new submission, or applies a pending revision to the live post. The status
   * change and the audit record are written together (see auditedSave). Optimistic
   * concurrency makes a second, simultaneous decision fail with 409.
   */
  static async approve(postId: string, actor: AuthUser, ctx: AuditContext) {
    const post = await Post.findOne({ _id: postId, isDeleted: false });
    if (!post) throw new AppError('Post not found', 404);
    const kind = pendingKind(post);
    if (!kind) throw new AppError('This article is not awaiting review', 409);
    assertNotSelfReview(post, actor);

    const now = new Date();
    const previousState = { status: post.status, revisionStatus: post.revision?.status ?? null, kind };
    let replacedCover: string | undefined;

    if (kind === 'revision') {
      const revision = post.revision!;
      await assertPublishable(revision);
      if (post.coverImage?.publicId !== revision.coverImage?.publicId) replacedCover = post.coverImage?.publicId;
      post.title = revision.title;
      post.subtitle = revision.subtitle;
      post.excerpt = revision.excerpt;
      post.content = revision.content;
      post.category = revision.category;
      post.tags = revision.tags;
      post.coverImage = revision.coverImage ?? null;
      post.readingTime = revision.readingTime;
      post.revision = null;
    } else {
      await assertPublishable(post);
      post.status = 'published';
      // First approval sets the publication date; it is never reset afterwards
      if (!post.publishedAt) post.publishedAt = now;
    }
    post.reviewedAt = now;
    post.reviewedBy = new Types.ObjectId(actor.userId);
    post.rejectionReason = '';

    const log = await auditedSave(post, ctx, {
      action: 'post.approved',
      resourceType: 'post',
      resourceId: post.id,
      previousState,
      newState: { status: 'published', revisionStatus: null, kind },
    });

    // Side effects only after the decision is durably recorded
    AuditService.announce(log);
    await releaseImage(replacedCover);
    const payload = { postId: post.id, slug: post.slug, title: post.title, kind };
    realtime.toModerators('post:approved', payload);
    realtime.toUser(String(post.author), 'post:approved', payload);
    await NotificationService.notify({
      recipients: [post.author],
      actorId: actor.userId,
      type: 'post_approved',
      message: kind === 'revision' ? `Your changes to “${post.title}” are now live` : `“${post.title}” was approved and published`,
      resourceType: 'post',
      resourceId: post._id,
      link: `/post/${post.slug}`,
    });
    return post;
  }

  /** Rejects a submission or revision. A reason is required and sent to the author. */
  static async reject(postId: string, reason: string, actor: AuthUser, ctx: AuditContext) {
    const post = await Post.findOne({ _id: postId, isDeleted: false });
    if (!post) throw new AppError('Post not found', 404);
    const kind = pendingKind(post);
    if (!kind) throw new AppError('This article is not awaiting review', 409);
    assertNotSelfReview(post, actor);

    const now = new Date();
    const previousState = { status: post.status, revisionStatus: post.revision?.status ?? null, kind };
    if (kind === 'revision') {
      post.revision!.status = 'rejected';
      post.revision!.rejectionReason = reason;
      post.revision!.reviewedAt = now;
      post.revision!.reviewedBy = new Types.ObjectId(actor.userId);
      post.markModified('revision');
    } else {
      post.status = 'rejected';
      post.rejectionReason = reason;
      post.reviewedAt = now;
      post.reviewedBy = new Types.ObjectId(actor.userId);
    }

    const log = await auditedSave(post, ctx, {
      action: 'post.rejected',
      resourceType: 'post',
      resourceId: post.id,
      previousState,
      newState: { status: post.status, revisionStatus: post.revision?.status ?? null, kind },
      reason,
    });

    AuditService.announce(log);
    const title = kind === 'revision' ? post.revision!.title : post.title;
    const payload = { postId: post.id, slug: post.slug, title, kind, reason };
    realtime.toModerators('post:rejected', payload);
    realtime.toUser(String(post.author), 'post:rejected', payload);
    await NotificationService.notify({
      recipients: [post.author],
      actorId: actor.userId,
      type: 'post_rejected',
      message: kind === 'revision' ? `Your changes to “${title}” were not approved: ${reason}` : `“${title}” was not approved: ${reason}`,
      resourceType: 'post',
      resourceId: post._id,
      link: `/write/${post.slug}`,
    });
    return post;
  }
}
