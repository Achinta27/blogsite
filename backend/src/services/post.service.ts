import type { UploadedFile } from 'express-fileupload';
import type { ClientSession } from 'mongoose';
import { Post, IPost, IPostContent, IRevision, PostStatus, PRIVATE_POST_FIELDS } from '../models/post.model.js';
import { AppError } from '../utils/apiError.js';
import { generateUniqueSlug } from '../utils/slug.js';
import { sanitizeArticleHtml, htmlToText, readingTimeMinutes, buildExcerpt, escapeRegex } from '../utils/content.js';
import { detectImageType } from '../utils/imageType.js';
import { isCloudinaryConfigured, uploadImage, deleteImage } from '../utils/cloudinary.js';
import { withTransaction } from '../utils/transaction.js';
import type { AuthUser } from '../middlewares/auth.middleware.js';
import { AuditService, AuditContext, AuditEntry } from './audit.service.js';
import { TaxonomyService } from './taxonomy.service.js';
import { Category } from '../models/category.model.js';
import { NotificationService } from './notification.service.js';
import { realtime } from '../socket/realtime.js';
import type { IAuditLog } from '../models/auditLog.model.js';

/** Author fields that are safe to show publicly. Email is deliberately excluded. */
export const PUBLIC_AUTHOR_FIELDS = 'name avatar bio';
export const CATEGORY_FIELDS = 'name slug';

const PUBLISHED = { status: 'published', isDeleted: false };

const searchWords = (search: string) => search.trim().split(/\s+/).filter(Boolean).slice(0, 6);
const contains = (word: string) => ({ $regex: escapeRegex(word), $options: 'i' });

/** Every typed word must appear (partially is fine) in the title, subtitle, excerpt or a tag. */
const searchFilter = (search: string) => ({
  $and: searchWords(search).map((word) => ({
    $or: ['title', 'subtitle', 'excerpt', 'tags'].map((field) => ({ [field]: contains(word) })),
  })),
});

/**
 * Lower is better: title starts with the query, then a title word starts with it (earlier words
 * first), then the title merely contains it, then matches in other fields only.
 */
const suggestionRank = (title: string, query: string) => {
  const t = title.toLowerCase();
  const q = query.toLowerCase();
  if (t.startsWith(q)) return 0;
  const word = t.split(/\s+/).findIndex((w) => w.replace(/^\W+/, '').startsWith(q));
  if (word >= 0) return 1 + Math.min(word, 99) / 100;
  if (t.includes(q)) return 2;
  return 3;
};

const MIN_PUBLISH_TEXT_LENGTH = 20;

interface PostInput {
  title?: string;
  subtitle?: string;
  excerpt?: string;
  content?: string;
  category?: string | null;
  tags?: string[];
  coverImageAlt?: string;
}

interface Pagination {
  page: number;
  limit: number;
}

export const paginationMeta = ({ page, limit }: Pagination, total: number) => {
  const totalPages = Math.ceil(total / limit);
  return { page, limit, total, totalPages, hasNextPage: page < totalPages, hasPrevPage: page > 1 };
};

const isDuplicateSlugError = (error: any) => error?.code === 11000 && 'slug' in (error.keyPattern || {});

const slugTaken = (excludeId?: unknown) => async (slug: string) =>
  Boolean(await Post.exists(excludeId ? { slug, _id: { $ne: excludeId } } : { slug }));

/** Saves a post, regenerating its slug if a concurrent insert claimed it first. */
const saveWithUniqueSlug = async (post: IPost, regenerateSlug: boolean): Promise<void> => {
  for (let attempt = 0; ; attempt++) {
    if (regenerateSlug) post.slug = await generateUniqueSlug(post.title, slugTaken(post._id));
    try {
      await post.save();
      return;
    } catch (error) {
      if (!isDuplicateSlugError(error) || attempt >= 3) throw error;
      regenerateSlug = true;
    }
  }
};

/** Writes editable fields onto the live post or its revision, sanitising and deriving metadata. */
const applyContent = (target: IPostContent, input: PostInput) => {
  if (input.title !== undefined) target.title = input.title;
  if (input.subtitle !== undefined) target.subtitle = input.subtitle;
  if (input.category !== undefined) target.category = (input.category as any) || null;
  if (input.tags !== undefined) target.tags = input.tags;
  if (input.content !== undefined) target.content = sanitizeArticleHtml(input.content);
  if (input.excerpt !== undefined) target.excerpt = input.excerpt;
  if (input.coverImageAlt !== undefined && target.coverImage) target.coverImage.alt = input.coverImageAlt;

  const text = htmlToText(target.content);
  target.readingTime = readingTimeMinutes(text);
  // Auto-generate an excerpt only when the author has not written one
  if (!target.excerpt) target.excerpt = buildExcerpt(text);
};

/** Conditions a submission must meet before it can be reviewed or published. */
export const assertPublishable = async (content: IPostContent) => {
  const details: { field: string; message: string }[] = [];
  if (htmlToText(content.content).length < MIN_PUBLISH_TEXT_LENGTH) {
    details.push({ field: 'content', message: `Articles need at least ${MIN_PUBLISH_TEXT_LENGTH} characters of text` });
  }
  if (!content.category) details.push({ field: 'category', message: 'Choose a category' });
  if (details.length) throw new AppError('This article is not ready for review yet', 400, 'VALIDATION_ERROR', details);
  await TaxonomyService.assertCategoryExists(String(content.category));
};

const snapshotContent = (post: IPost): IRevision => ({
  title: post.title,
  subtitle: post.subtitle,
  excerpt: post.excerpt,
  content: post.content,
  category: post.category,
  tags: [...post.tags],
  coverImage: post.coverImage ? { ...((post.coverImage as any).toObject?.() ?? post.coverImage) } : null,
  readingTime: post.readingTime,
  status: 'draft',
  submittedAt: null,
  rejectionReason: '',
  reviewedAt: null,
  reviewedBy: null,
});

/** Deletes a Cloudinary asset unless a post or revision still references it. Never throws. */
export const releaseImage = async (publicId: string | undefined | null) => {
  if (!publicId) return;
  try {
    const referenced = await Post.exists({
      $or: [{ 'coverImage.publicId': publicId }, { 'revision.coverImage.publicId': publicId }],
    });
    if (referenced) return;
    await deleteImage(publicId);
  } catch (error: any) {
    console.error(`[Cloudinary] Could not delete ${publicId}:`, error?.message);
  }
};

/**
 * Saves a status change and its audit record together. With a replica set both writes share
 * a transaction. On a standalone server the post is saved first (optimistic concurrency
 * rejects stale writes) and restored from its snapshot if the audit write fails, so a
 * transition is never left without its audit record.
 */
export const auditedSave = async (
  post: IPost,
  ctx: AuditContext,
  entry: AuditEntry
): Promise<IAuditLog> => {
  const snapshot = post.toObject({ depopulate: true });
  return withTransaction(async (session?: ClientSession) => {
    await post.save({ session });
    try {
      return await AuditService.record(ctx, entry, session);
    } catch (error) {
      if (!session) await Post.replaceOne({ _id: post._id }, snapshot);
      throw error;
    }
  });
};

const isOwner = (post: IPost, actor: AuthUser) => String(post.author) === actor.userId;

const populateForAuthor = (post: IPost) =>
  post.populate([
    { path: 'author', select: PUBLIC_AUTHOR_FIELDS },
    { path: 'category', select: CATEGORY_FIELDS },
    { path: 'revision.category', select: CATEGORY_FIELDS },
  ]);

export class PostService {
  static async createPost(input: PostInput, authorId: string): Promise<IPost> {
    if (input.category) await TaxonomyService.assertCategoryExists(input.category);
    const post = new Post({ author: authorId, title: input.title, status: 'draft' });
    applyContent(post, input);
    await saveWithUniqueSlug(post, true);
    return populateForAuthor(post);
  }

  /** Public listing: only published, non-deleted posts, never private review fields. */
  static async listPublished(query: Pagination & { search?: string; category?: string; tag?: string; author?: string }) {
    const filter: Record<string, unknown> = { status: 'published', isDeleted: false };
    if (query.category) filter.category = (await TaxonomyService.findCategoryBySlug(query.category))._id;
    if (query.tag) filter.tags = query.tag;
    if (query.author) filter.author = query.author;
    if (query.search && searchWords(query.search).length) Object.assign(filter, searchFilter(query.search));

    const [posts, total] = await Promise.all([
      Post.find(filter)
        .select(`${PRIVATE_POST_FIELDS} -content`)
        .sort({ publishedAt: -1, _id: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .populate('author', PUBLIC_AUTHOR_FIELDS)
        .populate('category', CATEGORY_FIELDS)
        .lean(),
      Post.countDocuments(filter),
    ]);
    return { posts, meta: paginationMeta(query, total) };
  }

  /** Type-ahead results for the header search: best matching articles, sections and topics. */
  static async suggest(q: string) {
    if (!searchWords(q).length) return { posts: [], categories: [], tags: [] };
    const match = contains(q.trim());

    const [candidates, categories, tags] = await Promise.all([
      Post.find({ ...PUBLISHED, ...searchFilter(q) })
        .select('title slug subtitle tags likeCount publishedAt readingTime coverImage.url author category')
        .sort({ publishedAt: -1, _id: -1 })
        .limit(30)
        .populate('author', 'name avatar')
        .populate('category', CATEGORY_FIELDS)
        .lean(),
      Category.find({ name: match }).select('name slug').sort({ name: 1 }).limit(3).lean(),
      Post.aggregate<{ tag: string; count: number }>([
        { $match: { ...PUBLISHED, tags: match } },
        { $unwind: '$tags' },
        { $match: { tags: match } },
        { $group: { _id: '$tags', count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 4 },
        { $project: { _id: 0, tag: '$_id', count: 1 } },
      ]),
    ]);

    const posts = candidates
      .map((post) => ({ post, rank: suggestionRank(post.title, q.trim()) }))
      .sort((a, b) => a.rank - b.rank || b.post.likeCount - a.post.likeCount)
      .slice(0, 6)
      .map(({ post }) => post);
    return { posts, categories, tags };
  }

  /** The author's own posts in any state (deleted excluded), with review feedback. */
  static async listMine(userId: string, query: Pagination & { status?: PostStatus }) {
    const filter: Record<string, unknown> = { author: userId, isDeleted: false };
    if (query.status) filter.status = query.status;

    const [posts, total] = await Promise.all([
      Post.find(filter)
        .select('-content -revision.content')
        .sort({ updatedAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .populate('category', CATEGORY_FIELDS)
        .lean(),
      Post.countDocuments(filter),
    ]);
    return { posts, meta: paginationMeta(query, total) };
  }

  /**
   * Published posts are public (live version only). The author and admins also get drafts,
   * submissions, rejection feedback and any pending revision. Everything else is a 404 so
   * the existence of a private post is not revealed. Deleted posts are never served here.
   */
  static async getBySlug(slug: string, viewer?: AuthUser) {
    const post = await Post.findOne({ slug, isDeleted: false })
      .populate('author', PUBLIC_AUTHOR_FIELDS)
      .populate('category', CATEGORY_FIELDS)
      .populate('revision.category', CATEGORY_FIELDS)
      .lean();
    if (!post) throw new AppError('Post not found', 404);

    const authorId = String((post.author as any)?._id ?? post.author);
    const privileged = Boolean(viewer && (viewer.role === 'admin' || viewer.userId === authorId));
    if (privileged) return post;
    if (post.status !== 'published') throw new AppError('Post not found', 404);

    const { revision: _r, rejectionReason: _rr, reviewedBy: _rb, reviewedAt: _ra, submittedAt: _sa, ...publicPost } = post;
    return publicPost;
  }

  /** The author may manage their post; admins may too. Staff only act through moderation. */
  private static async findManageable(postId: string, actor: AuthUser): Promise<IPost> {
    const post = await Post.findOne({ _id: postId, isDeleted: false });
    if (!post) throw new AppError('Post not found', 404);
    if (!isOwner(post, actor) && actor.role !== 'admin') {
      throw new AppError('You are not authorized to modify this post', 403);
    }
    return post;
  }

  /**
   * Edit policy:
   * - draft / pending_review / rejected: the post itself is edited; a pending or rejected
   *   post returns to draft and must be resubmitted.
   * - published: changes go into a revision; the live article is untouched until a
   *   moderator approves the revision, so edits never bypass review.
   * - archived: must be returned to draft first.
   */
  static async updatePost(postId: string, input: PostInput, actor: AuthUser): Promise<IPost> {
    const post = await this.findManageable(postId, actor);
    if (post.status === 'archived') throw new AppError('Restore this article to drafts before editing it', 409);
    if (input.category) await TaxonomyService.assertCategoryExists(input.category);

    if (post.status === 'published') {
      if (!post.revision) post.revision = snapshotContent(post);
      applyContent(post.revision, input);
      post.revision.status = 'draft';
      post.markModified('revision');
      await post.save();
      return populateForAuthor(post);
    }

    // The slug follows the title until the post is first published, then stays fixed
    const regenerateSlug = input.title !== undefined && input.title !== post.title && !post.publishedAt;
    applyContent(post, input);
    if (post.status === 'pending_review' || post.status === 'rejected') post.status = 'draft';
    await saveWithUniqueSlug(post, regenerateSlug);
    return populateForAuthor(post);
  }

  /** Sends a draft (or a published post's revision) to the moderation queue. */
  static async submitForReview(postId: string, actor: AuthUser, ctx: AuditContext) {
    const post = await this.findManageable(postId, actor);
    const previous = { status: post.status, revisionStatus: post.revision?.status ?? null };
    let kind: 'post' | 'revision';

    if (post.status === 'published') {
      if (!post.revision || post.revision.status === 'pending_review') {
        throw new AppError(post.revision ? 'This revision is already awaiting review' : 'There are no changes to submit', 409);
      }
      await assertPublishable(post.revision);
      post.revision.status = 'pending_review';
      post.revision.submittedAt = new Date();
      post.markModified('revision');
      kind = 'revision';
    } else if (post.status === 'draft' || post.status === 'rejected') {
      await assertPublishable(post);
      post.status = 'pending_review';
      post.submittedAt = new Date();
      kind = 'post';
    } else {
      throw new AppError(`A ${post.status.replace('_', ' ')} article cannot be submitted`, 409);
    }

    const log = await auditedSave(post, ctx, {
      action: kind === 'revision' ? 'post.revision_submitted' : 'post.submitted',
      resourceType: 'post',
      resourceId: post.id,
      previousState: previous,
      newState: { status: post.status, revisionStatus: post.revision?.status ?? null },
    });
    AuditService.announce(log);

    const title = kind === 'revision' ? post.revision!.title : post.title;
    realtime.toModerators('post:submitted', { postId: post.id, title, kind });
    await NotificationService.notify({
      recipients: await NotificationService.moderatorIds(),
      actorId: actor.userId,
      type: 'post_submitted',
      message: kind === 'revision' ? `An edit to “${title}” is awaiting review` : `“${title}” was submitted for review`,
      resourceType: 'post',
      resourceId: post._id,
      link: `/admin/moderation/${post.id}`,
    });
    return populateForAuthor(post);
  }

  /** Withdraws a published article from public view. Comments and likes are kept. */
  static async archive(postId: string, actor: AuthUser, ctx: AuditContext) {
    const post = await this.findManageable(postId, actor);
    if (post.status !== 'published') throw new AppError('Only published articles can be archived', 409);
    post.status = 'archived';
    const log = await auditedSave(post, ctx, {
      action: 'post.archived',
      resourceType: 'post',
      resourceId: post.id,
      previousState: { status: 'published' },
      newState: { status: 'archived' },
    });
    AuditService.announce(log);
    realtime.closePostRoom(post.id);
    return populateForAuthor(post);
  }

  /** Brings an archived article back as a draft; it must be reviewed again to go live. */
  static async unarchive(postId: string, actor: AuthUser, ctx: AuditContext) {
    const post = await this.findManageable(postId, actor);
    if (post.status !== 'archived') throw new AppError('This article is not archived', 409);
    post.status = 'draft';
    const log = await auditedSave(post, ctx, {
      action: 'post.unarchived',
      resourceType: 'post',
      resourceId: post.id,
      previousState: { status: 'archived' },
      newState: { status: 'draft' },
    });
    AuditService.announce(log);
    return populateForAuthor(post);
  }

  /** Throws away a published post's pending edit, keeping the live version. */
  static async discardRevision(postId: string, actor: AuthUser) {
    const post = await this.findManageable(postId, actor);
    if (!post.revision) throw new AppError('There is no revision to discard', 404);
    const revisionCover = post.revision.coverImage?.publicId;
    post.revision = null;
    await post.save();
    if (revisionCover !== post.coverImage?.publicId) await releaseImage(revisionCover);
    return populateForAuthor(post);
  }

  /** Soft delete. The cover image is kept so the post can be restored intact. */
  static async softDeletePost(postId: string, actor: AuthUser, ctx: AuditContext): Promise<void> {
    const post = await this.findManageable(postId, actor);
    const previousStatus = post.status;
    post.isDeleted = true;
    post.deletedAt = new Date();
    const log = await auditedSave(post, ctx, {
      action: 'post.deleted',
      resourceType: 'post',
      resourceId: post.id,
      previousState: { status: previousStatus, isDeleted: false },
      newState: { status: previousStatus, isDeleted: true },
    });
    AuditService.announce(log);
    realtime.closePostRoom(post.id);
  }

  /** Restores visibility only: the post returns with the status it had (drafts stay private). */
  static async restorePost(postId: string, ctx: AuditContext): Promise<IPost> {
    const post = await Post.findById(postId);
    if (!post) throw new AppError('Post not found', 404);
    if (!post.isDeleted) throw new AppError('Post is not deleted', 409);
    post.isDeleted = false;
    post.deletedAt = null;
    const log = await auditedSave(post, ctx, {
      action: 'post.restored',
      resourceType: 'post',
      resourceId: post.id,
      previousState: { isDeleted: true },
      newState: { isDeleted: false, status: post.status },
    });
    AuditService.announce(log);
    return post;
  }

  /**
   * Validates the file, uploads it, and only then points the post (or, for a published
   * post, its revision) at the new image. A failed upload leaves the post untouched; the
   * previous image is released only after the post has been saved.
   */
  static async setCoverImage(
    postId: string,
    file: UploadedFile | UploadedFile[] | undefined,
    alt: string | undefined,
    actor: AuthUser
  ): Promise<IPost> {
    const post = await this.findManageable(postId, actor);
    if (post.status === 'archived') throw new AppError('Restore this article to drafts before editing it', 409);

    if (!file || Array.isArray(file)) throw new AppError('Attach exactly one image file named "image"', 400);
    if (file.truncated) throw new AppError('Cover images must be 5 MB or smaller', 413);
    if (!detectImageType(file.data)) throw new AppError('Cover images must be JPEG, PNG or WebP files', 415);
    if (!isCloudinaryConfigured()) throw new AppError('Image uploads are not configured', 503);

    let uploaded: { url: string; publicId: string };
    try {
      uploaded = await uploadImage(file.data);
    } catch (error: any) {
      console.error('[Cloudinary] Upload failed:', error?.message);
      throw new AppError('The image could not be uploaded. Please try again.', 502, 'UPLOAD_FAILED');
    }

    const target = this.editTarget(post);
    const previousPublicId = target.coverImage?.publicId;
    target.coverImage = { url: uploaded.url, publicId: uploaded.publicId, alt: alt ?? target.coverImage?.alt ?? '' };
    post.markModified('revision');
    try {
      await post.save();
    } catch (error) {
      await releaseImage(uploaded.publicId);
      throw error;
    }

    if (previousPublicId && previousPublicId !== uploaded.publicId) await releaseImage(previousPublicId);
    return populateForAuthor(post);
  }

  static async removeCoverImage(postId: string, actor: AuthUser): Promise<IPost> {
    const post = await this.findManageable(postId, actor);
    if (post.status === 'archived') throw new AppError('Restore this article to drafts before editing it', 409);
    const target = this.editTarget(post);
    const previousPublicId = target.coverImage?.publicId;
    target.coverImage = null;
    post.markModified('revision');
    await post.save();
    await releaseImage(previousPublicId);
    return populateForAuthor(post);
  }

  /** Published posts are edited through a revision; everything else in place. */
  private static editTarget(post: IPost): IPostContent {
    if (post.status !== 'published') {
      if (post.status === 'pending_review' || post.status === 'rejected') post.status = 'draft';
      return post;
    }
    if (!post.revision) post.revision = snapshotContent(post);
    post.revision.status = 'draft';
    return post.revision;
  }

  /** Comments, likes and bookmarks only exist on live published posts. */
  static async findPublicPost(postId: string): Promise<IPost> {
    const post = await Post.findOne({ _id: postId, status: 'published', isDeleted: false });
    if (!post) throw new AppError('Post not found', 404);
    return post;
  }
}
