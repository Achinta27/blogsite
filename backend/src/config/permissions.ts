/**
 * Granular capabilities an admin can grant to staff accounts. Admins implicitly hold all of
 * them; regular users hold none. Ownership of a user's own content is checked separately.
 */
export const PERMISSIONS = [
  'posts.review', // open the moderation queue, read pending submissions and their history
  'posts.approve',
  'posts.reject',
  'comments.moderate',
  'categories.manage', // categories and tags
  'audit_logs.view',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Approving or rejecting is meaningless without being able to see the queue. */
export const PERMISSION_DEPENDENCIES: Partial<Record<Permission, Permission[]>> = {
  'posts.approve': ['posts.review'],
  'posts.reject': ['posts.review'],
};

export const ROLES = ['admin', 'staff', 'user'] as const;
export type UserRole = (typeof ROLES)[number];

export interface PermissionHolder {
  role: UserRole;
  permissions?: readonly string[];
}

export const hasPermission = (user: PermissionHolder | undefined, permission: Permission): boolean =>
  Boolean(user) &&
  (user!.role === 'admin' || (user!.role === 'staff' && (user!.permissions ?? []).includes(permission)));
