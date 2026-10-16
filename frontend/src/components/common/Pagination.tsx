import type { PaginationMeta } from '../../types';

export const Pagination = ({
  meta,
  onPageChange,
  className = '',
}: {
  meta: PaginationMeta | undefined;
  onPageChange: (page: number) => void;
  className?: string;
}) => {
  if (!meta || meta.totalPages <= 1) return null;
  return (
    <nav aria-label="Pagination" className={`flex items-center justify-between gap-4 border-t border-rule pt-5 ${className}`}>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={!meta.hasPrevPage}
        onClick={() => onPageChange(meta.page - 1)}
      >
        ← Newer
      </button>
      <span className="text-sm text-muted">
        Page {meta.page} of {meta.totalPages}
      </span>
      <button
        type="button"
        className="btn btn-outline btn-sm"
        disabled={!meta.hasNextPage}
        onClick={() => onPageChange(meta.page + 1)}
      >
        Older →
      </button>
    </nav>
  );
};
