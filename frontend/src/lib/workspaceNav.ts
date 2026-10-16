import { can } from './permissions';
import type { Permission, User } from '../types';

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
  adminOnly?: boolean;
  permission?: Permission;
}

/** Staff see only the sections their permissions unlock. */
export const WORKSPACE_NAV: NavItem[] = [
  { to: '/admin', label: 'Overview', end: true, adminOnly: true },
  { to: '/admin/moderation', label: 'Review queue', permission: 'posts.review' },
  { to: '/admin/posts', label: 'All posts', adminOnly: true },
  { to: '/admin/comments', label: 'Comments', permission: 'comments.moderate' },
  { to: '/admin/taxonomy', label: 'Categories & tags', permission: 'categories.manage' },
  { to: '/admin/users', label: 'Users', adminOnly: true },
  { to: '/admin/staff', label: 'Staff & permissions', adminOnly: true },
  { to: '/admin/audit', label: 'Audit log', permission: 'audit_logs.view' },
];

export const visibleNav = (user: User | null) =>
  WORKSPACE_NAV.filter((item) => (item.adminOnly ? user?.role === 'admin' : item.permission ? can(user, item.permission) : true));
