import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { moderationApi } from '../../api';
import { useSocketEvent } from '../../context/RealtimeContext';
import { formatDateTime } from '../../lib/format';
import { useFetch } from '../../lib/useFetch';
import { Pagination } from '../../components/common/Pagination';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';

type Tab = 'pending_review' | 'rejected';

export const ModerationQueuePage = () => {
  const [tab, setTab] = useState<Tab>('pending_review');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useFetch(() => moderationApi.queue({ page, status: tab }), [page, tab]);

  useEffect(() => {
    document.title = 'Review queue — Margin';
  }, []);

  // Any moderator's decision or a new submission updates everyone's queue
  useSocketEvent('post:submitted', reload);
  useSocketEvent('post:approved', reload);
  useSocketEvent('post:rejected', reload);

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold">Review queue</h1>
      <p className="mt-1 text-sm text-muted">New submissions and edits to published posts, oldest first. Updates live.</p>

      <div role="group" aria-label="Queue" className="mt-6 flex gap-1">
        {(
          [
            ['pending_review', 'Awaiting review'],
            ['rejected', 'Changes requested'],
          ] as [Tab, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={tab === value}
            className={`btn btn-sm ${tab === value ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => {
              setTab(value);
              setPage(1);
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data!.data.length === 0 ? (
        <EmptyState title={tab === 'pending_review' ? 'Nothing waiting' : 'No rejected submissions'}>
          {tab === 'pending_review' && 'New submissions appear here as soon as authors send them.'}
        </EmptyState>
      ) : (
        <>
          <ul className="mt-6">
            {data!.data.map((item) => {
              const isEdit = item.revision?.status === tab;
              const title = isEdit ? item.revision!.title : item.title;
              const when = isEdit ? item.revision!.submittedAt ?? item.revision!.reviewedAt : tab === 'pending_review' ? item.submittedAt : item.reviewedAt;
              const reason = isEdit ? item.revision!.rejectionReason : item.rejectionReason;
              return (
                <li key={item._id} className="flex flex-wrap items-start justify-between gap-3 border-b border-rule-soft py-5">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge kind={isEdit ? 'published' : tab} label={isEdit ? 'edit to live post' : 'new post'} />
                      {(isEdit ? item.revision!.category : item.category) && (
                        <span className="text-xs text-muted">{(isEdit ? item.revision!.category : item.category)!.name}</span>
                      )}
                    </div>
                    <h2 className="mt-1.5 font-serif text-xl font-semibold">
                      <Link to={`/admin/moderation/${item._id}`} className="hover:text-accent-deep">
                        {title}
                      </Link>
                    </h2>
                    <p className="mt-0.5 text-xs text-muted">
                      by {item.author.name}
                      {when && ` · ${tab === 'pending_review' ? 'submitted' : 'rejected'} ${formatDateTime(when)}`}
                      {tab === 'rejected' && item.reviewedBy && ` by ${item.reviewedBy.name}`}
                    </p>
                    {tab === 'rejected' && reason && <p className="mt-1.5 text-sm text-ink-soft">“{reason}”</p>}
                  </div>
                  <Link to={`/admin/moderation/${item._id}`} className="btn btn-outline btn-sm">
                    {tab === 'pending_review' ? 'Review' : 'Open'}
                  </Link>
                </li>
              );
            })}
          </ul>
          <Pagination meta={data!.meta} onPageChange={setPage} className="mt-6" />
        </>
      )}
    </div>
  );
};
