export type Role = 'admin' | 'staff' | 'user';
export type Permission =
  | 'posts.review'
  | 'posts.approve'
  | 'posts.reject'
  | 'comments.moderate'
  | 'categories.manage'
  | 'audit_logs.view';
export type PostStatus = 'draft' | 'pending_review' | 'published' | 'rejected' | 'archived';
export type RevisionStatus = 'draft' | 'pending_review' | 'rejected';

export interface User {
  _id: string;
  name: string;
  email: string;
  role: Role;
  permissions: Permission[];
  isActive: boolean;
  avatar?: string;
  bio?: string;
  createdAt: string;
  updatedAt: string;
}

/** Public author fields as returned by post, comment and author endpoints. */
export interface Author {
  _id: string;
  name: string;
  avatar?: string;
  bio?: string;
  createdAt?: string;
}

export interface Category {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  publishedCount?: number;
}

export interface CoverImage {
  url: string;
  publicId: string;
  alt: string;
}

export interface Revision {
  title: string;
  subtitle: string;
  excerpt: string;
  content?: string;
  category: Category | null;
  tags: string[];
  coverImage: CoverImage | null;
  readingTime: number;
  status: RevisionStatus;
  submittedAt: string | null;
  rejectionReason?: string;
  reviewedAt: string | null;
}

export interface Post {
  _id: string;
  title: string;
  subtitle: string;
  slug: string;
  excerpt: string;
  /** Sanitised HTML. Omitted from list endpoints. */
  content?: string;
  author: Author;
  coverImage: CoverImage | null;
  category: Category | null;
  tags: string[];
  status: PostStatus;
  publishedAt: string | null;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  rejectionReason?: string;
  revision?: Revision | null;
  readingTime: number;
  likeCount: number;
  isDeleted: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Present on the single-post endpoint. */
  viewer?: { liked: boolean; bookmarked: boolean };
}

/** Header type-ahead results. */
export interface SearchSuggestions {
  posts: Array<Pick<Post, '_id' | 'title' | 'slug' | 'subtitle' | 'publishedAt' | 'readingTime'> & {
    author: Author | null;
    category: Pick<Category, '_id' | 'name' | 'slug'> | null;
    coverImage: { url: string } | null;
  }>;
  categories: Array<Pick<Category, '_id' | 'name' | 'slug'>>;
  tags: Array<{ tag: string; count: number }>;
}

export interface Comment {
  _id: string;
  post: string;
  author: Author;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface Notification {
  _id: string;
  recipient: string;
  actor?: { _id: string; name: string; avatar?: string } | string | null;
  type: string;
  message: string;
  resourceType: 'post' | 'comment' | 'user';
  resourceId: string;
  link: string;
  isRead: boolean;
  createdAt: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  unread?: number;
  actions?: string[];
}

export interface ApiResponse<T> {
  success: boolean;
  message: string;
  data: T;
  meta?: PaginationMeta;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface AdminUser {
  _id: string;
  name: string;
  email: string;
  role: Role;
  permissions: Permission[];
  isActive: boolean;
  avatar?: string;
  createdAt: string;
}

export interface AuditEntry {
  _id: string;
  actor?: { _id: string; name: string; email?: string; role?: Role } | null;
  actorRole?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  previousState?: Record<string, unknown> | null;
  newState?: Record<string, unknown> | null;
  reason?: string;
  requestId?: string;
  createdAt: string;
}

export interface StaffDetail {
  user: AdminUser;
  recentActions: AuditEntry[];
  moderationCounts: Record<string, number>;
}

export interface AdminPost extends Omit<Post, 'author'> {
  author: { _id: string; name: string; email: string } | null;
  reviewedBy?: { _id: string; name: string } | null;
}

export interface ReviewItem extends Omit<Post, 'author'> {
  author: { _id: string; name: string; email?: string; avatar?: string };
  reviewedBy?: { _id: string; name: string } | null;
}

export interface AdminComment extends Omit<Comment, 'post' | 'author'> {
  author: { _id: string; name: string } | null;
  post: { _id: string; title: string; slug: string; status: PostStatus; isDeleted: boolean } | null;
}

export interface DashboardData {
  stats: {
    totalUsers: number;
    activeUsers: number;
    admins: number;
    staff: number;
    totalPosts: number;
    publishedPosts: number;
    draftPosts: number;
    pendingReview: number;
    rejectedPosts: number;
    archivedPosts: number;
    deletedPosts: number;
    totalComments: number;
    totalLikes: number;
  };
  recentActivity: AuditEntry[];
}
