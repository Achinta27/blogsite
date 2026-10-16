import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi, postApi } from '../../api';
import { errorMessage } from '../../api/client';
import { formatDate } from '../../lib/format';
import { useFetch } from '../../lib/useFetch';
import type { AdminPost } from '../../types';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Pagination } from '../../components/common/Pagination';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState, Notice } from '../../components/common/States';
import { AdminToolbar, FilterSelect } from './AdminToolbar';

type Filter = 'published' | 'draft' | 'pending_review' | 'rejected' | 'archived' | 'deleted';

export const AdminPostsPage = () => {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Filter | ''>('');
  const { data, error, loading, reload } = useFetch(
    () => adminApi.posts({ page, search: search || undefined, status: status || undefined }),
    [page, search, status]
  );
  const [pending, setPending] = useState<{ post: AdminPost; action: 'delete' | 'restore' } | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    document.title = 'Posts — Margin admin';
  }, []);

  const apply = async () => {
    if (!pending) return;
    try {
      if (pending.action === 'restore') await adminApi.restorePost(pending.post._id);
      else await postApi.remove(pending.post._id);
      setNotice({ tone: 'ok', text: `“${pending.post.title}” was ${pending.action === 'restore' ? 'restored' : 'deleted'}.` });
      reload();
    } catch (err) {
      setNotice({ tone: 'danger', text: errorMessage(err) });
    } finally {
      setPending(null);
    }
  };

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold">Posts</h1>

      <AdminToolbar
        placeholder="Search titles"
        onSearch={(v) => {
          setSearch(v);
          setPage(1);
        }}
      >
        <FilterSelect<Filter>
          label="Show"
          value={status}
          onChange={(v) => {
            setStatus(v);
            setPage(1);
          }}
          options={[
            { value: '', label: 'All posts' },
            { value: 'published', label: 'Published' },
            { value: 'pending_review', label: 'In review' },
            { value: 'rejected', label: 'Changes requested' },
            { value: 'draft', label: 'Drafts' },
            { value: 'archived', label: 'Archived' },
            { value: 'deleted', label: 'Deleted' },
          ]}
        />
      </AdminToolbar>

      {notice && <div className="mt-4"><Notice tone={notice.tone}>{notice.text}</Notice></div>}

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data!.data.length === 0 ? (
        <EmptyState title="No posts found" />
      ) : (
        <>
          <div className="mt-6 overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Author</th>
                  <th scope="col">Category</th>
                  <th scope="col">Status</th>
                  <th scope="col">Updated</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data!.data.map((post) => (
                  <tr key={post._id}>
                    <td className="max-w-xs">
                      {post.isDeleted ? (
                        <span className="text-ink-soft">{post.title}</span>
                      ) : (
                        <Link to={`/post/${post.slug}`} className="font-medium hover:underline">
                          {post.title}
                        </Link>
                      )}
                    </td>
                    <td className="text-ink-soft">{post.author?.name ?? '—'}</td>
                    <td className="text-muted">{post.category?.name ?? '—'}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        <StatusBadge kind={post.status} />
                        {post.revision?.status === 'pending_review' && <StatusBadge kind="pending_review" label="edit in review" />}
                        {post.isDeleted && <StatusBadge kind="deleted" />}
                      </div>
                      {post.reviewedBy && <p className="mt-1 text-xs text-muted">reviewed by {post.reviewedBy.name}</p>}
                    </td>
                    <td className="whitespace-nowrap text-muted">
                      {post.isDeleted ? `Deleted ${formatDate(post.deletedAt, 'short')}` : formatDate(post.updatedAt, 'short')}
                    </td>
                    <td className="text-right">
                      {post.isDeleted ? (
                        <button type="button" className="btn btn-outline btn-sm" onClick={() => setPending({ post, action: 'restore' })}>
                          Restore
                        </button>
                      ) : (
                        <button type="button" className="btn btn-ghost btn-sm text-danger" onClick={() => setPending({ post, action: 'delete' })}>
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={data!.meta} onPageChange={setPage} className="mt-6" />
        </>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        title={pending?.action === 'restore' ? 'Restore this post?' : 'Delete this post?'}
        confirmLabel={pending?.action === 'restore' ? 'Restore' : 'Delete'}
        tone={pending?.action === 'delete' ? 'danger' : 'default'}
        onConfirm={apply}
        onClose={() => setPending(null)}
      >
        {pending?.action === 'restore'
          ? `“${pending.post.title}” will return with its previous status (${pending.post.status}). Drafts stay private.`
          : `“${pending?.post.title}” will be hidden from readers. You can restore it later.`}
      </ConfirmDialog>
    </div>
  );
};
