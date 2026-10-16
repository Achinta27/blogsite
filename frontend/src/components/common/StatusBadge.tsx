const STYLES = {
  published: 'bg-ok-wash text-ok',
  draft: 'bg-paper-deep text-ink-soft',
  pending_review: 'bg-warn-wash text-warn',
  rejected: 'bg-danger-wash text-danger',
  archived: 'bg-paper-deep text-muted',
  deleted: 'bg-danger-wash text-danger',
  active: 'bg-ok-wash text-ok',
  inactive: 'bg-danger-wash text-danger',
  admin: 'bg-ink text-paper',
  staff: 'bg-accent-wash text-accent-deep',
  user: 'bg-paper-deep text-ink-soft',
} as const;

const LABELS: Partial<Record<keyof typeof STYLES, string>> = {
  pending_review: 'in review',
  rejected: 'changes requested',
};

export type BadgeKind = keyof typeof STYLES;

export const StatusBadge = ({ kind, label }: { kind: BadgeKind; label?: string }) => (
  <span
    className={`inline-flex items-center whitespace-nowrap rounded-[2px] px-1.5 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-[0.06em] ${STYLES[kind]}`}
  >
    {label ?? LABELS[kind] ?? kind}
  </span>
);
