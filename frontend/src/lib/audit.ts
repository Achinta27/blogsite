import type { AuditEntry } from '../types';
import { permissionLabel } from './permissions';

const LABELS: Record<string, string> = {
  'auth.registered': 'Registered',
  'auth.login': 'Signed in',
  'auth.oauth_login.google': 'Signed in with Google',
  'auth.oauth_login.facebook': 'Signed in with Facebook',
  'post.submitted': 'Submitted a post for review',
  'post.revision_submitted': 'Submitted edits for review',
  'post.approved': 'Approved a post',
  'post.rejected': 'Rejected a post',
  'post.archived': 'Archived a post',
  'post.unarchived': 'Returned a post to drafts',
  'post.deleted': 'Deleted a post',
  'post.restored': 'Restored a post',
  'comment.created': 'Commented',
  'comment.moderated': 'Removed a comment',
  'category.created': 'Created a category',
  'category.updated': 'Edited a category',
  'category.deleted': 'Deleted a category',
  'tag.renamed': 'Renamed a tag',
  'tag.deleted': 'Removed a tag',
  'staff.created': 'Created a staff account',
  'staff.permissions_changed': 'Changed staff permissions',
  'user.role_changed': 'Changed a role',
  'user.activated': 'Activated an account',
  'user.deactivated': 'Deactivated an account',
};

export const actionLabel = (action: string) => LABELS[action] ?? action;

const list = (value: unknown) => (Array.isArray(value) ? value.map(String) : []);

/** One-line, human-readable summary of what changed. */
export const describeChange = (entry: AuditEntry): string => {
  const prev = entry.previousState ?? {};
  const next = entry.newState ?? {};
  if (entry.action === 'staff.permissions_changed') {
    const granted = list(next.granted).map(permissionLabel);
    const revoked = list(next.revoked).map(permissionLabel);
    return [granted.length && `granted ${granted.join(', ')}`, revoked.length && `revoked ${revoked.join(', ')}`].filter(Boolean).join('; ');
  }
  if ('role' in next && prev.role !== next.role) return `${prev.role ?? '—'} → ${next.role}`;
  if ('status' in next && prev.status !== next.status) {
    const kind = next.kind === 'revision' || prev.kind === 'revision' ? ' (edit)' : '';
    return `${String(prev.status ?? '—').replace('_', ' ')} → ${String(next.status).replace('_', ' ')}${kind}`;
  }
  if ('revisionStatus' in next && prev.revisionStatus !== next.revisionStatus) {
    return `edit: ${String(prev.revisionStatus ?? 'none').replace('_', ' ')} → ${String(next.revisionStatus ?? 'applied').replace('_', ' ')}`;
  }
  if ('isActive' in next) return next.isActive ? 'activated' : 'deactivated';
  if ('isDeleted' in next) return next.isDeleted ? 'deleted' : 'restored';
  if ('name' in next && 'name' in prev && prev.name !== next.name) return `${prev.name} → ${next.name}`;
  if ('tag' in next && 'tag' in prev) return `#${prev.tag} → #${next.tag}`;
  return '';
};
