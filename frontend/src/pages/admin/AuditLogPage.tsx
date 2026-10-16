import { Fragment, useEffect, useState } from 'react';
import { adminApi } from '../../api';
import { actionLabel, describeChange } from '../../lib/audit';
import { formatDateTime } from '../../lib/format';
import { useFetch } from '../../lib/useFetch';
import { Pagination } from '../../components/common/Pagination';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/States';
import { FilterSelect } from './AdminToolbar';

const RESOURCE_TYPES = ['post', 'user', 'comment', 'category', 'tag', 'session'] as const;

/** Append-only history. There is no edit or delete control because the API offers none. */
export const AuditLogPage = () => {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [resourceType, setResourceType] = useState('');
  const [resourceId, setResourceId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data, error, loading, reload } = useFetch(
    () =>
      adminApi.auditLogs({
        page,
        action: action || undefined,
        resourceType: resourceType || undefined,
        resourceId: resourceId.trim() || undefined,
        from: from || undefined,
        to: to ? `${to}T23:59:59.999Z` : undefined,
      }),
    [page, action, resourceType, resourceId, from, to]
  );

  useEffect(() => {
    document.title = 'Audit log — Margin';
  }, []);

  const reset = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setPage(1);
  };

  return (
    <div>
      <h1 className="font-serif text-3xl font-semibold">Audit log</h1>
      <p className="mt-1 text-sm text-muted">Every moderation decision, permission change and administrative action, newest first. Entries cannot be edited or deleted.</p>

      <div className="mt-6 flex flex-wrap items-end gap-3">
        <FilterSelect
          label="Action"
          value={action}
          onChange={reset(setAction)}
          options={[{ value: '', label: 'All actions' }, ...(data?.meta.actions ?? []).map((a) => ({ value: a, label: actionLabel(a) }))]}
        />
        <FilterSelect
          label="Resource"
          value={resourceType}
          onChange={reset(setResourceType)}
          options={[{ value: '', label: 'Any' }, ...RESOURCE_TYPES.map((r) => ({ value: r, label: r }))]}
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          ID
          <input className="field w-40 py-1.5 text-sm" value={resourceId} placeholder="resource id" onChange={(e) => reset(setResourceId)(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          From
          <input type="date" className="field w-auto py-1.5 text-sm" value={from} onChange={(e) => reset(setFrom)(e.target.value)} />
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          To
          <input type="date" className="field w-auto py-1.5 text-sm" value={to} onChange={(e) => reset(setTo)(e.target.value)} />
        </label>
      </div>

      {loading && !data ? (
        <LoadingState />
      ) : error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : data!.data.length === 0 ? (
        <EmptyState title="No matching entries" />
      ) : (
        <>
          <div className="mt-6 overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Actor</th>
                  <th scope="col">Action</th>
                  <th scope="col">Change</th>
                  <th scope="col">
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {data!.data.map((entry) => (
                  <Fragment key={entry._id}>
                    <tr>
                      <td className="whitespace-nowrap text-muted">{formatDateTime(entry.createdAt)}</td>
                      <td>
                        {entry.actor ? (
                          <>
                            {entry.actor.name} <span className="text-xs text-muted">{entry.actorRole}</span>
                          </>
                        ) : (
                          <span className="text-muted">System</span>
                        )}
                      </td>
                      <td>
                        {actionLabel(entry.action)}
                        <span className="block text-xs text-muted">
                          {entry.resourceType} {entry.resourceId}
                        </span>
                      </td>
                      <td className="text-ink-soft">
                        {describeChange(entry)}
                        {entry.reason && <span className="block text-xs">“{entry.reason}”</span>}
                      </td>
                      <td className="text-right">
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          aria-expanded={expanded === entry._id}
                          onClick={() => setExpanded((e) => (e === entry._id ? null : entry._id))}
                        >
                          {expanded === entry._id ? 'Hide' : 'Details'}
                        </button>
                      </td>
                    </tr>
                    {expanded === entry._id && (
                      <tr>
                        <td colSpan={5} className="bg-paper">
                          <dl className="grid gap-3 text-xs sm:grid-cols-3">
                            <div>
                              <dt className="font-semibold uppercase tracking-wide text-muted">Before</dt>
                              <dd><pre className="mt-1 whitespace-pre-wrap break-all font-mono">{JSON.stringify(entry.previousState ?? null, null, 2)}</pre></dd>
                            </div>
                            <div>
                              <dt className="font-semibold uppercase tracking-wide text-muted">After</dt>
                              <dd><pre className="mt-1 whitespace-pre-wrap break-all font-mono">{JSON.stringify(entry.newState ?? null, null, 2)}</pre></dd>
                            </div>
                            <div>
                              <dt className="font-semibold uppercase tracking-wide text-muted">Request</dt>
                              <dd className="mt-1 break-all font-mono">{entry.requestId || '—'}</dd>
                            </div>
                          </dl>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination meta={data!.meta} onPageChange={setPage} className="mt-6" />
        </>
      )}
    </div>
  );
};
