import type { PostStatus } from '../types';

export const formatDate = (iso: string | null | undefined, style: 'long' | 'short' = 'long') => {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', {
    month: style === 'long' ? 'long' : 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

export const timeAgo = (iso: string) => {
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const units: [number, string][] = [
    [60, 'minute'],
    [3600, 'hour'],
    [86400, 'day'],
  ];
  for (let i = units.length - 1; i >= 0; i--) {
    const [size, name] = units[i];
    if (seconds >= size) {
      const n = Math.floor(seconds / size);
      return n > 6 && name === 'day' ? formatDate(iso, 'short') : `${n} ${name}${n === 1 ? '' : 's'} ago`;
    }
  }
  return formatDate(iso, 'short');
};

export const STATUS_LABELS: Record<PostStatus, string> = {
  draft: 'Draft',
  pending_review: 'In review',
  published: 'Published',
  rejected: 'Changes requested',
  archived: 'Archived',
};

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('') || '?';
