import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { commentApi, moderationApi } from '../../api';
import { errorMessage } from '../../api/client';
import { formatDateTime } from '../../lib/format';
import { useFetch } from '../../lib/useFetch';
import type { AdminComment } from '../../types';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Pagination } from '../../components/common/Pagination';
import { EmptyState, ErrorState, LoadingState, Notice } from '../../components/common/States';
import { AdminToolbar } from './AdminToolbar';

export const AdminCommentsPage = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const { data, error, loading, reload } = useFetch(() => moderationApi.comments({ page, search: search || undefined }), [page, search]);
  const [pending, setPending] = useState<AdminComment | null>(null);
  const [reason, setReason] = useState('');
  const [notice, setNotice] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    document.title = 'Comments — Margin admin';
  }, []);

  const remove = async () => {
    if (!pending) return;
    try {
      await commentApi.remove(pending._id, reason.trim() || undefined);
      setReason('');
      setNotice({ tone: 'ok', text: 'Comment removed.' });
      reload();
    } catch (err) {
      setNotice({ tone: 'danger', text: errorMessage(err) });
    } finally {
      setPending(null);
    }
  };

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold">Comments</h1>

      <AdminToolbar
        placeholder="Search comment text"
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
      />

      {notice && <div className="mt-4"><Notice tone={notice.tone}>{notice.text}</Notice></div>}

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data!.data.length === 0 ? (
        <EmptyState title="No comments found" />
      ) : (
        <>
          <ul className="mt-6">
            {data!.data.map((comment) => (
              <li key={comment._id} className="grid gap-3 border-b border-rule-soft py-5 sm:grid-cols-[1fr_auto] sm:items-start">
                <div className="min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{comment.author?.name ?? 'Deleted user'}</span>
                    <span className="text-muted"> on </span>
                    {comment.post && !comment.post.isDeleted && comment.post.status === 'published' ? (
                      <Link to={`/post/${comment.post.slug}`} className="link">
                        {comment.post.title}
                      </Link>
                    ) : (
                      <span className="text-ink-soft">
                        {comment.post?.title ?? 'a removed post'}
                        {comment.post && <span className="text-muted"> ({comment.post.isDeleted ? 'deleted' : comment.post.status})</span>}
                      </span>
                    )}
                    <span className="text-muted"> · {formatDateTime(comment.createdAt)}</span>
                  </p>
                  <p className="mt-1.5 whitespace-pre-line break-words text-[0.9375rem] text-ink-soft">{comment.content}</p>
                </div>
                <button type="button" className="btn btn-ghost btn-sm justify-self-start text-danger" onClick={() => setPending(comment)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <Pagination meta={data!.meta} onPageChange={setPage} className="mt-6" />
        </>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        title="Remove this comment?"
        confirmLabel="Remove"
        tone="danger"
        onConfirm={remove}
        onClose={() => setPending(null)}
      >
        <p>The comment will be permanently deleted. This is recorded in the audit log.</p>
        <label htmlFor="moderation-reason" className="field-label mt-3">
          Reason <span className="font-normal text-muted">(optional, kept in the audit log)</span>
        </label>
        <input id="moderation-reason" className="field text-sm" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmDialog>
    </div>
  );
};
