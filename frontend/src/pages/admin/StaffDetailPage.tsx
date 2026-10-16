import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminApi } from '../../api';
import { errorMessage } from '../../api/client';
import { actionLabel, describeChange } from '../../lib/audit';
import { formatDate, formatDateTime } from '../../lib/format';
import { useFetch } from '../../lib/useFetch';
import type { Permission } from '../../types';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState, Notice } from '../../components/common/States';
import { PermissionChecklist } from './PermissionChecklist';

export const StaffDetailPage = () => {
  const { id = '' } = useParams();
  const { data, error, status, loading, reload, setData } = useFetch(() => adminApi.user(id), [id]);
  const [draft, setDraft] = useState<Permission[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    if (data) document.title = `${data.user.name} — Margin admin`;
  }, [data]);

  if (loading && !data) return <LoadingState />;
  if (status === 404) return <EmptyState title="User not found" action={<Link to="/admin/staff" className="btn btn-outline">Back to staff</Link>} />;
  if (error || !data) return <ErrorState message={error ?? ''} onRetry={reload} />;

  const { user, recentActions, moderationCounts } = data;
  const permissions = draft ?? user.permissions;
  const changed = draft !== null && [...draft].sort().join() !== [...user.permissions].sort().join();

  const savePermissions = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const updated = await adminApi.setPermissions(user._id, permissions);
      setData((d) => d && { ...d, user: { ...d.user, ...updated } });
      setDraft(null);
      setNotice({ tone: 'ok', text: 'Permissions saved. They apply to the staff member’s very next action, and they have been notified.' });
      reload();
    } catch (err) {
      setNotice({ tone: 'danger', text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    try {
      const updated = await adminApi.setStatus(user._id, !user.isActive);
      setData((d) => d && { ...d, user: { ...d.user, ...updated } });
      setNotice({ tone: 'ok', text: updated.isActive ? 'Account reactivated.' : 'Account deactivated and signed out everywhere.' });
    } catch (err) {
      setNotice({ tone: 'danger', text: errorMessage(err) });
    } finally {
      setConfirmStatus(false);
    }
  };

  return (
    <div>
      <Link to="/admin/staff" className="text-sm text-muted hover:text-ink">
        ← Staff &amp; permissions
      </Link>
      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold">{user.name}</h1>
          <p className="mt-1 text-sm text-muted">
            {user.email} · joined {formatDate(user.createdAt, 'short')}
          </p>
          <div className="mt-2 flex gap-2">
            <StatusBadge kind={user.role} />
            <StatusBadge kind={user.isActive ? 'active' : 'inactive'} />
          </div>
        </div>
        <button type="button" className={`btn ${user.isActive ? 'btn-outline text-danger' : 'btn-outline'}`} onClick={() => setConfirmStatus(true)}>
          {user.isActive ? 'Deactivate account' : 'Reactivate account'}
        </button>
      </div>

      {notice && <div className="mt-4"><Notice tone={notice.tone}>{notice.text}</Notice></div>}

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.3fr_1fr]">
        <section aria-labelledby="perm-heading">
          <h2 id="perm-heading" className="font-serif text-xl font-semibold">
            Permissions
          </h2>
          {user.role !== 'staff' ? (
            <p className="mt-3 text-sm text-muted">
              Permissions apply to staff accounts only. This account is a {user.role}; change the role on the{' '}
              <Link to="/admin/users" className="link">
                Users page
              </Link>
              .
            </p>
          ) : (
            <>
              <div className="mt-4">
                <PermissionChecklist value={permissions} onChange={setDraft} disabled={saving} />
              </div>
              <div className="mt-4 flex gap-2">
                <button type="button" className="btn btn-primary" disabled={!changed || saving} onClick={savePermissions}>
                  {saving ? 'Saving…' : 'Save permissions'}
                </button>
                {changed && (
                  <button type="button" className="btn btn-ghost" onClick={() => setDraft(null)}>
                    Reset
                  </button>
                )}
              </div>
            </>
          )}
        </section>

        <section aria-labelledby="activity-heading">
          <h2 id="activity-heading" className="font-serif text-xl font-semibold">
            Activity
          </h2>
          <dl className="mt-4 grid grid-cols-3 gap-4 text-center">
            {[
              ['post.approved', 'Approved'],
              ['post.rejected', 'Rejected'],
              ['comment.moderated', 'Comments removed'],
            ].map(([key, label]) => (
              <div key={key} className="card px-2 py-3">
                <dt className="text-xs text-muted">{label}</dt>
                <dd className="font-serif text-2xl font-semibold">{moderationCounts[key] ?? 0}</dd>
              </div>
            ))}
          </dl>
          {recentActions.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No recorded actions yet.</p>
          ) : (
            <ul className="mt-4 text-sm">
              {recentActions.map((a) => (
                <li key={a._id} className="border-b border-rule-soft py-2.5">
                  <p>
                    {actionLabel(a.action)}
                    {describeChange(a) && <span className="text-muted"> · {describeChange(a)}</span>}
                  </p>
                  <p className="text-xs text-muted">{formatDateTime(a.createdAt)}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmStatus}
        title={user.isActive ? `Deactivate ${user.name}?` : `Reactivate ${user.name}?`}
        confirmLabel={user.isActive ? 'Deactivate' : 'Reactivate'}
        tone={user.isActive ? 'danger' : 'default'}
        onConfirm={toggleStatus}
        onClose={() => setConfirmStatus(false)}
      >
        {user.isActive
          ? 'They are signed out on every device immediately and cannot sign in until reactivated.'
          : 'They will be able to sign in again with their existing permissions.'}
      </ConfirmDialog>
    </div>
  );
};
