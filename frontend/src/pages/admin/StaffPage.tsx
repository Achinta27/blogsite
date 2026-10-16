import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, Minus } from 'lucide-react';
import { adminApi } from '../../api';
import { errorMessage, fieldErrors } from '../../api/client';
import { PERMISSIONS } from '../../lib/permissions';
import { useFetch } from '../../lib/useFetch';
import type { Permission } from '../../types';
import { StatusBadge } from '../../components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState, Notice } from '../../components/common/States';
import { PermissionChecklist } from './PermissionChecklist';

const CreateStaffForm = ({ onCreated }: { onCreated: () => void }) => {
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [permissions, setPermissions] = useState<Permission[]>(['posts.review']);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<{ tone: 'ok' | 'danger'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      const created = await adminApi.createStaff({ ...values, permissions });
      setNotice({ tone: 'ok', text: `${created.name} can now sign in with the password you set. Share it privately.` });
      setValues({ name: '', email: '', password: '' });
      setErrors({});
      onCreated();
    } catch (err) {
      setErrors(fieldErrors(err));
      setNotice({ tone: 'danger', text: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const input = (field: keyof typeof values, label: string, type = 'text', hint?: string) => (
    <div>
      <label htmlFor={`staff-${field}`} className="field-label">
        {label}
      </label>
      <input
        id={`staff-${field}`}
        type={type}
        className="field text-sm"
        value={values[field]}
        autoComplete="off"
        aria-invalid={Boolean(errors[field])}
        onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
      />
      {errors[field] ? <p className="field-error">{errors[field]}</p> : hint && <p className="field-hint">{hint}</p>}
    </div>
  );

  return (
    <form onSubmit={submit} className="card space-y-4 p-6" noValidate>
      <h2 className="font-serif text-xl font-semibold">Create a staff account</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {input('name', 'Name')}
        {input('email', 'Email', 'email')}
        {input('password', 'Initial password', 'password', 'At least 12 characters.')}
      </div>
      <fieldset>
        <legend className="field-label">Permissions</legend>
        <PermissionChecklist value={permissions} onChange={setPermissions} />
      </fieldset>
      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}
      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'Creating…' : 'Create staff account'}
      </button>
      <p className="text-xs text-muted">To give an existing reader staff access, change their role on the Users page instead.</p>
    </form>
  );
};

export const StaffPage = () => {
  const { data, error, loading, reload } = useFetch(() => adminApi.users({ role: 'staff', page: 1 }), []);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    document.title = 'Staff & permissions — Margin admin';
  }, []);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold">Staff &amp; permissions</h1>
          <p className="mt-1 text-sm text-muted">Staff only get the tools you grant. Administrators always have everything.</p>
        </div>
        <button type="button" className="btn btn-primary" aria-expanded={showCreate} onClick={() => setShowCreate((v) => !v)}>
          {showCreate ? 'Close' : 'New staff account'}
        </button>
      </div>

      {showCreate && (
        <div className="mt-6">
          <CreateStaffForm onCreated={reload} />
        </div>
      )}

      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data!.data.length === 0 ? (
        <EmptyState title="No staff yet">Create a staff account, or promote a reader from the Users page.</EmptyState>
      ) : (
        <div className="mt-8 overflow-x-auto">
          <table className="data-table">
            <caption className="sr-only">Permission matrix</caption>
            <thead>
              <tr>
                <th scope="col">Staff member</th>
                {PERMISSIONS.map((p) => (
                  <th key={p.value} scope="col" className="text-center" title={p.description}>
                    {p.label}
                  </th>
                ))}
                <th scope="col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data!.data.map((member) => (
                <tr key={member._id}>
                  <td>
                    <p className="font-medium">{member.name}</p>
                    <p className="text-xs text-muted">{member.email}</p>
                    {!member.isActive && <StatusBadge kind="inactive" />}
                  </td>
                  {PERMISSIONS.map((p) => (
                    <td key={p.value} className="text-center">
                      {member.permissions.includes(p.value) ? (
                        <Check className="mx-auto h-4 w-4 text-ok" aria-label="granted" />
                      ) : (
                        <Minus className="mx-auto h-4 w-4 text-rule" aria-label="not granted" />
                      )}
                    </td>
                  ))}
                  <td className="text-right">
                    <Link to={`/admin/staff/${member._id}`} className="btn btn-outline btn-sm">
                      Manage
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
