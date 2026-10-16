import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationApi } from '../api';
import { useRealtime, useSocketEvent } from '../context/RealtimeContext';
import { formatDateTime } from '../lib/format';
import { useFetch } from '../lib/useFetch';
import type { Notification } from '../types';
import { Pagination } from '../components/common/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../components/common/States';

/** Full, persistent history. Live events only add to it; this list is the source of truth. */
export const NotificationsPage = () => {
  const navigate = useNavigate();
  const { markRead, markAllRead, unread } = useRealtime();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, error, loading, reload, setData } = useFetch(() => notificationApi.list({ page, unread: unreadOnly }), [page, unreadOnly]);

  useEffect(() => {
    document.title = 'Notifications — Margin';
  }, []);

  useSocketEvent<Notification>('notification:new', (n) => {
    if (page !== 1) return;
    setData((current) => (current && !current.data.some((x) => x._id === n._id) ? { ...current, data: [n, ...current.data] } : current));
  });
  useSocketEvent<{ ids?: string[]; all?: boolean }>('notification:read', ({ ids, all }) => {
    setData((current) => current && { ...current, data: current.data.map((n) => (all || ids?.includes(n._id) ? { ...n, isRead: true } : n)) });
  });

  const open = async (n: Notification) => {
    if (!n.isRead) {
      await markRead(n._id).catch(() => undefined);
      setData((current) => current && { ...current, data: current.data.map((x) => (x._id === n._id ? { ...x, isRead: true } : x)) });
    }
    if (n.link) navigate(n.link);
  };

  return (
    <div className="wrap py-12">
      <div className="mx-auto max-w-[760px]">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-6">
          <div>
            <p className="kicker text-muted">Account</p>
            <h1 className="mt-2 font-serif text-4xl font-semibold tracking-[-0.015em]">Notifications</h1>
          </div>
          <div className="flex gap-2">
            <button type="button" className={`btn btn-sm ${unreadOnly ? 'btn-primary' : 'btn-ghost'}`} aria-pressed={unreadOnly} onClick={() => { setUnreadOnly((v) => !v); setPage(1); }}>
              Unread only
            </button>
            <button type="button" className="btn btn-outline btn-sm" disabled={unread === 0} onClick={() => markAllRead().then(reload)}>
              Mark all read
            </button>
          </div>
        </div>

        {loading && !data ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : data!.data.length === 0 ? (
          <EmptyState title={unreadOnly ? 'No unread notifications' : 'No notifications yet'}>
            Likes, responses and editorial decisions about your articles show up here.
          </EmptyState>
        ) : (
          <>
            <ul>
              {data!.data.map((n) => (
                <li key={n._id}>
                  <button type="button" onClick={() => open(n)} className="flex w-full gap-3 border-b border-rule-soft py-4 text-left hover:bg-paper-deep/50">
                    <span aria-hidden className={`mt-2 h-2 w-2 shrink-0 rounded-full ${n.isRead ? 'bg-transparent' : 'bg-accent'}`} />
                    <span className="min-w-0">
                      <span className={`block ${n.isRead ? 'text-ink-soft' : 'font-medium text-ink'}`}>{n.message}</span>
                      <span className="mt-0.5 block text-xs text-muted">
                        {formatDateTime(n.createdAt)}
                        {!n.isRead && <span className="sr-only"> (unread)</span>}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <Pagination meta={data!.meta} onPageChange={setPage} className="mt-6" />
          </>
        )}
      </div>
    </div>
  );
};
