import { api, API_BASE_URL, SessionPayload } from './client';
import type {
  AdminComment,
  AdminPost,
  AdminUser,
  ApiResponse,
  AuditEntry,
  Author,
  Category,
  Comment,
  DashboardData,
  Notification,
  Paginated,
  Permission,
  Post,
  PostStatus,
  ReviewItem,
  Role,
  SearchSuggestions,
  StaffDetail,
  User,
} from '../types';

const unwrap = <T>(res: { data: ApiResponse<T> }) => res.data.data;
const paginated = <T>(res: { data: ApiResponse<T[]> }): Paginated<T> => ({
  data: res.data.data,
  meta: res.data.meta!,
});

export interface PostInput {
  title?: string;
  subtitle?: string;
  excerpt?: string;
  content?: string;
  category?: string | null;
  tags?: string[];
  coverImageAlt?: string;
}

export const authApi = {
  register: (body: { name: string; email: string; password: string }) =>
    api.post<ApiResponse<SessionPayload>>('/auth/register', body).then(unwrap),
  login: (body: { email: string; password: string }) =>
    api.post<ApiResponse<SessionPayload>>('/auth/login', body).then(unwrap),
  logout: () => api.post('/auth/logout'),
  me: () => api.get<ApiResponse<User>>('/auth/me').then(unwrap),
  updateMe: (body: { name?: string; bio?: string }) => api.patch<ApiResponse<User>>('/auth/me', body).then(unwrap),
  /** Full-page navigation: the OAuth dance happens on the API origin. */
  oauthUrl: (provider: 'google' | 'facebook') => `${API_BASE_URL}/auth/${provider}`,
};

export const postApi = {
  list: (params: { page?: number; limit?: number; search?: string; category?: string; tag?: string; author?: string }) =>
    api.get<ApiResponse<Post[]>>('/posts', { params }).then(paginated),
  suggest: (q: string, signal?: AbortSignal) =>
    api.get<ApiResponse<SearchSuggestions>>('/posts/suggest', { params: { q }, signal }).then(unwrap),
  mine: (params: { page?: number; limit?: number; status?: PostStatus }) =>
    api.get<ApiResponse<Post[]>>('/posts/mine', { params }).then(paginated),
  saved: (page = 1) => api.get<ApiResponse<Post[]>>('/posts/saved', { params: { page, limit: 10 } }).then(paginated),
  bySlug: (slug: string) => api.get<ApiResponse<Post>>(`/posts/${encodeURIComponent(slug)}`).then(unwrap),
  create: (body: PostInput) => api.post<ApiResponse<Post>>('/posts', body).then(unwrap),
  update: (id: string, body: PostInput) => api.patch<ApiResponse<Post>>(`/posts/${id}`, body).then(unwrap),
  submit: (id: string) => api.post<ApiResponse<Post>>(`/posts/${id}/submit`).then(unwrap),
  archive: (id: string) => api.post<ApiResponse<Post>>(`/posts/${id}/archive`).then(unwrap),
  unarchive: (id: string) => api.post<ApiResponse<Post>>(`/posts/${id}/unarchive`).then(unwrap),
  discardRevision: (id: string) => api.delete<ApiResponse<Post>>(`/posts/${id}/revision`).then(unwrap),
  remove: (id: string) => api.delete(`/posts/${id}`),
  uploadCover: (id: string, file: File, alt: string, onProgress?: (percent: number) => void) => {
    const form = new FormData();
    form.append('image', file);
    form.append('alt', alt);
    return api
      .put<ApiResponse<Post>>(`/posts/${id}/cover`, form, {
        onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
      })
      .then(unwrap);
  },
  removeCover: (id: string) => api.delete<ApiResponse<Post>>(`/posts/${id}/cover`).then(unwrap),
  like: (id: string) => api.put<ApiResponse<{ liked: boolean; likeCount: number }>>(`/posts/${id}/like`).then(unwrap),
  unlike: (id: string) => api.delete<ApiResponse<{ liked: boolean; likeCount: number }>>(`/posts/${id}/like`).then(unwrap),
  bookmark: (id: string) => api.put<ApiResponse<{ bookmarked: boolean }>>(`/posts/${id}/bookmark`).then(unwrap),
  unbookmark: (id: string) => api.delete<ApiResponse<{ bookmarked: boolean }>>(`/posts/${id}/bookmark`).then(unwrap),
};

export const taxonomyApi = {
  categories: () => api.get<ApiResponse<Category[]>>('/categories').then(unwrap),
  createCategory: (body: { name: string; description?: string }) => api.post<ApiResponse<Category>>('/categories', body).then(unwrap),
  updateCategory: (id: string, body: { name?: string; description?: string }) =>
    api.patch<ApiResponse<Category>>(`/categories/${id}`, body).then(unwrap),
  deleteCategory: (id: string) => api.delete(`/categories/${id}`),
  tags: () => api.get<ApiResponse<{ tag: string; count: number }[]>>('/tags').then(unwrap),
  renameTag: (tag: string, name: string) => api.patch(`/tags/${encodeURIComponent(tag)}`, { name }),
  deleteTag: (tag: string) => api.delete(`/tags/${encodeURIComponent(tag)}`),
};

export const commentApi = {
  list: (postId: string, page = 1) =>
    api.get<ApiResponse<Comment[]>>(`/posts/${postId}/comments`, { params: { page, limit: 50 } }).then(paginated),
  create: (postId: string, content: string) =>
    api.post<ApiResponse<Comment>>(`/posts/${postId}/comments`, { content }).then(unwrap),
  update: (id: string, content: string) => api.patch<ApiResponse<Comment>>(`/comments/${id}`, { content }).then(unwrap),
  remove: (id: string, reason?: string) => api.delete(`/comments/${id}`, { data: reason ? { reason } : undefined }),
};

export const authorApi = {
  get: (id: string) => api.get<ApiResponse<Author>>(`/authors/${id}`).then(unwrap),
};

export const notificationApi = {
  list: (params: { page?: number; unread?: boolean } = {}) =>
    api
      .get<ApiResponse<Notification[]>>('/notifications', { params: { page: params.page, unread: params.unread ? 'true' : undefined } })
      .then(paginated),
  unreadCount: () => api.get<ApiResponse<{ unread: number }>>('/notifications/unread-count').then(unwrap),
  markRead: (id: string) => api.patch(`/notifications/${id}/read`),
  markAllRead: () => api.patch('/notifications/read-all'),
};

export const moderationApi = {
  queue: (params: { page?: number; status?: 'pending_review' | 'rejected' }) =>
    api.get<ApiResponse<ReviewItem[]>>('/moderation/posts', { params: { limit: 20, ...params } }).then(paginated),
  review: (id: string) =>
    api.get<ApiResponse<{ post: ReviewItem; history: AuditEntry[] }>>(`/moderation/posts/${id}`).then(unwrap),
  approve: (id: string) => api.post<ApiResponse<Post>>(`/moderation/posts/${id}/approve`).then(unwrap),
  reject: (id: string, reason: string) => api.post<ApiResponse<Post>>(`/moderation/posts/${id}/reject`, { reason }).then(unwrap),
  comments: (params: { page?: number; search?: string }) =>
    api.get<ApiResponse<AdminComment[]>>('/moderation/comments', { params: { limit: 20, ...params } }).then(paginated),
};

export const adminApi = {
  dashboard: () => api.get<ApiResponse<DashboardData>>('/admin/dashboard').then(unwrap),
  users: (params: { page?: number; search?: string; role?: Role; status?: 'active' | 'inactive' }) =>
    api.get<ApiResponse<AdminUser[]>>('/admin/users', { params: { limit: 20, ...params } }).then(paginated),
  user: (id: string) => api.get<ApiResponse<StaffDetail>>(`/admin/users/${id}`).then(unwrap),
  createStaff: (body: { name: string; email: string; password: string; permissions: Permission[] }) =>
    api.post<ApiResponse<AdminUser>>('/admin/staff', body).then(unwrap),
  setRole: (id: string, role: Role) => api.patch<ApiResponse<AdminUser>>(`/admin/users/${id}/role`, { role }).then(unwrap),
  setPermissions: (id: string, permissions: Permission[]) =>
    api.put<ApiResponse<AdminUser>>(`/admin/users/${id}/permissions`, { permissions }).then(unwrap),
  setStatus: (id: string, isActive: boolean) =>
    api.patch<ApiResponse<AdminUser>>(`/admin/users/${id}/status`, { isActive }).then(unwrap),
  posts: (params: { page?: number; search?: string; status?: PostStatus | 'deleted' }) =>
    api.get<ApiResponse<AdminPost[]>>('/admin/posts', { params: { limit: 20, ...params } }).then(paginated),
  restorePost: (id: string) => api.patch<ApiResponse<Post>>(`/admin/posts/${id}/restore`).then(unwrap),
  auditLogs: (params: { page?: number; action?: string; resourceType?: string; resourceId?: string; actor?: string; from?: string; to?: string }) =>
    api.get<ApiResponse<AuditEntry[]>>('/admin/audit-logs', { params }).then(paginated),
};
