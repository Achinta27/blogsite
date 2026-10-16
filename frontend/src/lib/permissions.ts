import type { Permission, User } from '../types';

/** Mirrors backend/src/config/permissions.ts. The API is the authority; this only shapes the UI. */
export const PERMISSIONS: { value: Permission; label: string; description: string; requires?: Permission[] }[] = [
  { value: 'posts.review', label: 'Review queue', description: 'Open the moderation queue and read submissions with their history.' },
  { value: 'posts.approve', label: 'Approve posts', description: 'Publish submissions and approve edits to live posts.', requires: ['posts.review'] },
  { value: 'posts.reject', label: 'Reject posts', description: 'Send submissions back to their author with a reason.', requires: ['posts.review'] },
  { value: 'comments.moderate', label: 'Moderate comments', description: 'Remove any comment.' },
  { value: 'categories.manage', label: 'Categories & tags', description: 'Create, rename and remove categories and tags.' },
  { value: 'audit_logs.view', label: 'Audit log', description: 'Read the full audit log. Sensitive: grant sparingly.' },
];

export const permissionLabel = (p: string) => PERMISSIONS.find((x) => x.value === p)?.label ?? p;

export const can = (user: Pick<User, 'role' | 'permissions'> | null | undefined, permission: Permission) =>
  Boolean(user) && (user!.role === 'admin' || (user!.role === 'staff' && user!.permissions.includes(permission)));

/** Admins and staff have a workspace; staff see only the sections they may use. */
export const hasWorkspace = (user: Pick<User, 'role'> | null | undefined) => user?.role === 'admin' || user?.role === 'staff';
