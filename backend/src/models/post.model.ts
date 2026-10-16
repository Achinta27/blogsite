import { Schema, model, Document, Types } from 'mongoose';

export const POST_STATUSES = ['draft', 'pending_review', 'published', 'rejected', 'archived'] as const;
export type PostStatus = (typeof POST_STATUSES)[number];

/** Review state of a pending edit to an already-published post. */
export const REVISION_STATUSES = ['draft', 'pending_review', 'rejected'] as const;
export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export interface ICoverImage {
  url: string;
  publicId: string;
  alt: string;
}

/** The editable fields of an article. Both the live version and a revision carry them. */
export interface IPostContent {
  title: string;
  subtitle: string;
  excerpt: string;
  content: string;
  category?: Types.ObjectId | null;
  tags: string[];
  coverImage?: ICoverImage | null;
  readingTime: number;
}

/**
 * A proposed edit to a published post. The live fields stay public and unchanged until a
 * moderator approves the revision, so edits can never bypass review.
 */
export interface IRevision extends IPostContent {
  status: RevisionStatus;
  submittedAt?: Date | null;
  rejectionReason?: string;
  reviewedAt?: Date | null;
  reviewedBy?: Types.ObjectId | null;
}

export interface IPost extends Document, IPostContent {
  slug: string;
  author: Types.ObjectId;
  status: PostStatus;
  submittedAt?: Date | null;
  reviewedAt?: Date | null;
  reviewedBy?: Types.ObjectId | null;
  rejectionReason?: string;
  publishedAt?: Date | null;
  revision?: IRevision | null;
  likeCount: number;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const coverImageSchema = new Schema<ICoverImage>(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true },
    alt: { type: String, trim: true, maxlength: 200, default: '' },
  },
  { _id: false }
);

const contentFields = {
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 200 },
  subtitle: { type: String, trim: true, maxlength: 300, default: '' },
  excerpt: { type: String, trim: true, maxlength: 400, default: '' },
  // Sanitised HTML (see utils/content.ts)
  content: { type: String, default: '' },
  category: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
  tags: { type: [String], default: [] },
  coverImage: { type: coverImageSchema, default: null },
  readingTime: { type: Number, default: 1 },
};

const revisionSchema = new Schema<IRevision>(
  {
    ...contentFields,
    status: { type: String, enum: REVISION_STATUSES, default: 'draft' },
    submittedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { _id: false }
);

const postSchema = new Schema<IPost>(
  {
    ...contentFields,
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, enum: POST_STATUSES, default: 'draft' },
    submittedAt: { type: Date, default: null },
    reviewedAt: { type: Date, default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    rejectionReason: { type: String, default: '' },
    // Set on first approval and never reset by later edits
    publishedAt: { type: Date, default: null },
    revision: { type: revisionSchema, default: null },
    likeCount: { type: Number, default: 0, min: 0 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null },
  },
  // A save fails if the document changed since it was read (e.g. two moderators deciding at once)
  { timestamps: true, optimisticConcurrency: true }
);

// Public listing: published, not deleted, newest first (optionally by category or tag)
postSchema.index({ status: 1, isDeleted: 1, publishedAt: -1 });
postSchema.index({ category: 1, status: 1, isDeleted: 1, publishedAt: -1 });
postSchema.index({ tags: 1, status: 1, isDeleted: 1 });
// Author workspace and author pages
postSchema.index({ author: 1, isDeleted: 1, updatedAt: -1 });
// Moderation queue: new submissions and pending revisions, oldest first
postSchema.index({ status: 1, submittedAt: 1 });
postSchema.index({ 'revision.status': 1, 'revision.submittedAt': 1 }, { sparse: true });
// Full-text search over the fields readers actually search
postSchema.index(
  { title: 'text', subtitle: 'text', excerpt: 'text', tags: 'text' },
  { weights: { title: 10, tags: 5, subtitle: 3, excerpt: 1 }, name: 'post_text_search' }
);

export const Post = model<IPost>('Post', postSchema);

/** Fields that must never be sent to anonymous readers. */
export const PRIVATE_POST_FIELDS = '-revision -rejectionReason -reviewedBy -reviewedAt -submittedAt';
