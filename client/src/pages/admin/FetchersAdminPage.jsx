import { useState } from 'react';
import { apiRequest } from '../../lib/apiClient.js';
import { useApiData } from '../../lib/useApiData.js';
import { OFFLINE_MESSAGE } from '../../lib/format.js';
import Panel, { ErrorMessage } from '../../components/Panel.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { EmptyState, InlineConfirm, LoadingState, buttonClass, inputClass, LABEL } from '../../components/ui/index.js';
import { FetcherIcon } from '../../components/ui/icons.jsx';

function FetcherRow({ fetcher, onChanged }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function deactivate() {
    if (!navigator.onLine) return setError(OFFLINE_MESSAGE);
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/admin/fetchers/${encodeURIComponent(fetcher.fetcherId)}/deactivate`, { method: 'POST' });
      onChanged();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col rounded-2xl border border-brand-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-grape-50 text-grape-700">
            <FetcherIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-brand-900">{fetcher.fullName}</p>
            <p className="text-sm text-brand-500">{fetcher.relationship} · Registered by {fetcher.parentName ?? 'unknown parent'}</p>
          </div>
        </div>
        <StatusBadge active={fetcher.active} />
      </div>

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">May collect</p>
        <ul className="mt-1.5 flex flex-wrap gap-2">
          {fetcher.students.map((s) => {
            const invalid = !s.active || !s.parentLinked;
            return (
              <li key={s.studentId} className={`rounded-xl px-3 py-1.5 text-sm ring-1 ring-inset ${invalid ? 'bg-amber-50 text-amber-900 ring-amber-200' : 'bg-canvas text-brand-900 ring-brand-100'}`}>
                {s.name ?? s.studentId} <span className="font-mono text-xs text-brand-500">({s.studentId})</span>
                {invalid && <span className="block text-xs font-medium"> – not valid ({!s.active ? 'student inactive' : 'parent no longer linked'})</span>}
              </li>
            );
          })}
        </ul>
      </div>

      {fetcher.active && (
        <div className="mt-4">
          {confirming ? (
            <InlineConfirm
              message={<>Deactivate <strong>{fetcher.fullName}</strong>? They can no longer collect any child, and any code already sent for them stops working. The record is kept.</>}
              confirmLabel="Deactivate"
              busyLabel="Deactivating…"
              busy={busy}
              onConfirm={deactivate}
              onCancel={() => setConfirming(false)}
            />
          ) : (
            <button type="button" onClick={() => setConfirming(true)} className={buttonClass({ variant: 'danger' })}>Deactivate</button>
          )}
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{error}</p>}
    </li>
  );
}

/** Admin view of every Fetcher registered by parents (read-only except deactivation). */
export default function FetchersAdminPage() {
  const [status, setStatus] = useState('active');
  const [search, setSearch] = useState('');
  const { loading, data, error, reload } = useApiData(`/admin/fetchers?${new URLSearchParams({ status })}`);

  const term = search.trim().toLowerCase();
  const fetchers = (data?.fetchers ?? []).filter((f) => !term
    || [f.fullName, f.relationship, f.parentName, ...f.students.flatMap((s) => [s.name, s.studentId])]
      .join(' ').toLowerCase().includes(term));

  return (
    <Panel
      title="Registered Fetchers"
      titleId="admin-fetchers-title"
      subtitle="People parents have authorized to pick up their children. Fetchers have no account."
      actions={(
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label htmlFor="fetcher-search" className={LABEL}>Search</label>
            <input id="fetcher-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, parent or student" className={inputClass()} />
          </div>
          <div>
            <label htmlFor="fetcher-status" className={LABEL}>Status</label>
            <select id="fetcher-status" value={status} onChange={(e) => setStatus(e.target.value)} className={inputClass({ className: 'w-auto' })}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="all">All</option>
            </select>
          </div>
        </div>
      )}
    >
      {error && <ErrorMessage message={error} onRetry={reload} />}
      {loading && <LoadingState className="mt-4">Loading Fetchers…</LoadingState>}
      {data && fetchers.length === 0 && (
        <EmptyState className="mt-4" icon={<FetcherIcon className="h-6 w-6" />} title="No Fetchers found." />
      )}
      {fetchers.length > 0 && (
        <ul className="mt-5 grid gap-4 md:grid-cols-2">
          {fetchers.map((f) => <FetcherRow key={f.fetcherId} fetcher={f} onChanged={reload} />)}
        </ul>
      )}
    </Panel>
  );
}
