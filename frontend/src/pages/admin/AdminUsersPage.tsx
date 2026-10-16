import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../../api';
import { errorMessage } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { formatDate } from '../../lib/format';
import { useFetch } from '../../lib/useFetch';
import type { AdminUser, Role } from '../../types';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { Pagination } from '../../components/common/Pagination';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState, Notice } from '../../components/common/States';
import { AdminToolbar, FilterSelect } from './AdminToolbar';

type PendingAction = { user: AdminUser; kind: 'role'; role: Role } | { user: AdminUser; kind: 'status'; isActive: boolean };

export const AdminUsersPage = () => {
  const { user: me } = useAuth();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<Role | ''>('');
  const [status, setStatus] = useState<'active' | 'inactive' | ''>('');
  const { data, error, loading, reload, setData } = useFetch(
    () => adminApi.users({ page, search: search || undefined, role: role || undefined, status: status || undefined }),
    [page, search, role, status]
  );
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);

  useEffect(() => {
    document.title = 'Users — Margin admin';
  }, []);

  const apply = async () => {
    if (!pending) return;
    try {
      const updated =
        pending.kind === 'role'
          ? await adminApi.setRole(pending.user._id, pending.role)
          : await adminApi.setStatus(pending.user._id, pending.isActive);
      setData((current) => current && { ...current, data: current.data.map((u) => (u._id === updated._id ? { ...u, ...updated } : u)) });
      setNotice({
        tone: 'ok',
        text:
          pending.kind === 'role'
            ? `${updated.name} is now ${updated.role === 'admin' ? 'an administrator' : updated.role === 'staff' ? 'a staff member (no permissions until you grant them)' : 'a regular user'}.`
            : `${updated.name}’s account is ${updated.isActive ? 'active' : 'deactivated'}.`,
      });
    } catch (err) {
      setNotice({ tone: 'danger', text: errorMessage(err) });
    } finally {
      setPending(null);
    }
  };

  const resetPage = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold">Users</h1>

      <AdminToolbar placeholder="Search name or email" onSearch={resetPage(setSearch)}>
        <FilterSelect
          label="Role"
          value={role}
          onChange={resetPage(setRole)}
          options={[
            { value: '', label: 'Any' },
            { value: 'user', label: 'User' },
            { value: 'staff', label: 'Staff' },
            { value: 'admin', label: 'Admin' },
          ]}
        />
        <FilterSelect
          label="Status"
          value={status}
          onChange={resetPage(setStatus)}
          options={[{ value: '', label: 'Any' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]}
        />
      </AdminToolbar>

      {notice && <div className="mt-4"><Notice tone={notice.tone}>{notice.text}</Notice></div>}

      {loading ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data!.data.length === 0 ? (
        <EmptyState title="No users found" />
      ) : (
        <>
          <div className="mt-6 overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col">Joined</th>
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data!.data.map((u) => {
                  const isMe = u._id === me?._id;
                  return (
                    <tr key={u._id}>
                      <td className="font-medium">
                        {u.name}
                        {isMe && <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>}
                      </td>
                      <td className="text-ink-soft">{u.email}</td>
                      <td>
                        <StatusBadge kind={u.role} />
                      </td>
                      <td>
                        <StatusBadge kind={u.isActive ? 'active' : 'inactive'} />
                      </td>
                      <td className="whitespace-nowrap text-muted">{formatDate(u.createdAt, 'short')}</td>
                      <td>
                        <div className="flex justify-end gap-1.5">
                          <label className="sr-only" htmlFor={`role-${u._id}`}>
                            Role for {u.name}
                          </label>
                          <select
                            id={`role-${u._id}`}
                            className="field w-auto py-1 text-xs"
                            value={u.role}
                            onChange={(e) => setPending({ user: u, kind: 'role', role: e.target.value as Role })}
                          >
                            <option value="user">User</option>
                            <option value="staff">Staff</option>
                            <option value="admin">Admin</option>
                          </select>
                          {u.role === 'staff' && (
                            <Link to={`/admin/staff/${u._id}`} className="btn btn-outline btn-sm">
                              Permissions
                            </Link>
                          )}
                          {!isMe && (
                            <button
                              type="button"
                              className={`btn btn-sm ${u.isActive ? 'btn-ghost text-danger' : 'btn-ghost'}`}
                              onClick={() => setPending({ user: u, kind: 'status', isActive: !u.isActive })}
                            >
                              {u.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination meta={data!.meta} onPageChange={setPage} className="mt-6" />
        </>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        title={
          !pending
            ? ''
            : pending.kind === 'role'
              ? `Change ${pending.user.name}’s role to ${pending.role}?`
              : `${pending.isActive ? 'Reactivate' : 'Deactivate'} ${pending.user.name}?`
        }
        confirmLabel="Confirm"
        tone={pending && ((pending.kind === 'status' && !pending.isActive) || (pending.kind === 'role' && pending.role === 'admin')) ? 'danger' : 'default'}
        onConfirm={apply}
        onClose={() => setPending(null)}
      >
        {pending?.kind === 'role' &&
          (pending.role === 'admin'
            ? 'Administrators have full authority: users, staff, permissions, moderation and audit logs.'
            : pending.role === 'staff'
              ? 'Staff start with no permissions. Grant only the tools they need on the permissions page.'
              : pending.user._id === me?._id
                ? 'You will lose access to this administration area immediately.'
                : 'Any staff permissions are removed and access to the workspace ends immediately.')}
        {pending?.kind === 'status' &&
          (pending.isActive
            ? 'They will be able to sign in again.'
            : 'They will be signed out on every device and won’t be able to sign in. Their published articles stay online.')}
      </ConfirmDialog>
    </div>
  );
};
