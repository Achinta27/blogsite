import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api';
import { useSocketEvent } from '../../context/RealtimeContext';
import { actionLabel, describeChange } from '../../lib/audit';
import { formatDateTime } from '../../lib/format';
import { useFetch } from '../../lib/useFetch';
import type { AuditEntry } from '../../types';
import { ErrorState, LoadingState } from '../../components/common/States';

const Stat = ({ label, value, note, to }: { label: string; value: number; note?: string; to?: string }) => (
  <div className="border-t border-ink pt-3">
    <dt className="text-xs font-medium uppercase tracking-[0.08em] text-muted">{label}</dt>
    <dd className="mt-1 font-serif text-4xl font-semibold tabular-nums">
      {to ? (
        <Link to={to} className="hover:text-accent-deep">
          {value.toLocaleString()}
        </Link>
      ) : (
        value.toLocaleString()
      )}
    </dd>
    {note && <dd className="mt-0.5 text-xs text-muted">{note}</dd>}
  </div>
);

export const AdminOverviewPage = () => {
  const { data, error, loading, reload, setData } = useFetch(() => adminApi.dashboard(), []);

  useEffect(() => {
    document.title = 'Overview — Margin admin';
  }, []);

  // Live: new audit entries stream in; counts refresh when the queue changes
  useSocketEvent<AuditEntry>('activity:new', (entry) => {
    setData((current) =>
      current && !current.recentActivity.some((e) => e._id === entry._id)
        ? { ...current, recentActivity: [entry, ...current.recentActivity].slice(0, 10) }
        : current
    );
  });
  useSocketEvent('post:submitted', reload);
  useSocketEvent('post:approved', reload);
  useSocketEvent('post:rejected', reload);

  if (loading && !data) return <LoadingState />;
  if (error || !data) return <ErrorState message={error ?? ''} onRetry={reload} />;

  const { stats, recentActivity } = data;

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold">Overview</h1>

      <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-8 md:grid-cols-4">
        <Stat label="Awaiting review" value={stats.pendingReview} note="New posts and edits" to="/admin/moderation" />
        <Stat label="Published" value={stats.publishedPosts} note={`${stats.totalPosts} posts in total`} />
        <Stat label="Drafts" value={stats.draftPosts} note={`${stats.rejectedPosts} with changes requested`} />
        <Stat label="Archived / deleted" value={stats.archivedPosts + stats.deletedPosts} note={`${stats.deletedPosts} restorable deletions`} />
        <Stat label="Users" value={stats.totalUsers} note={`${stats.activeUsers} active`} to="/admin/users" />
        <Stat label="Staff" value={stats.staff} note={`${stats.admins} administrators`} to="/admin/staff" />
        <Stat label="Comments" value={stats.totalComments} />
        <Stat label="Likes" value={stats.totalLikes} />
      </dl>

      <section aria-labelledby="activity-heading" className="mt-14">
        <div className="flex items-baseline justify-between">
          <h2 id="activity-heading" className="font-serif text-xl font-semibold">
            Recent activity
          </h2>
          <Link to="/admin/audit" className="text-sm text-muted hover:text-ink">
            Full audit log →
          </Link>
        </div>
        {recentActivity.length === 0 ? (
          <p className="mt-4 text-sm text-muted">No activity recorded yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">What</th>
                  <th scope="col">Change</th>
                </tr>
              </thead>
              <tbody aria-live="polite">
                {recentActivity.map((entry) => (
                  <tr key={entry._id}>
                    <td className="whitespace-nowrap text-muted">{formatDateTime(entry.createdAt)}</td>
                    <td>{entry.actor?.name ?? <span className="text-muted">System</span>}</td>
                    <td>{actionLabel(entry.action)}</td>
                    <td className="text-ink-soft">{describeChange(entry)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
