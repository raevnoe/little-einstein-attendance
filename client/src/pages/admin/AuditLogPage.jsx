import { useEffect, useState } from 'react';
import {
  AUDIT_CATEGORY_LABELS,
  AUDIT_EVENTS,
  AUDIT_OUTCOMES,
  auditEventLabel,
} from '@led/shared';
import { apiRequest } from '../../lib/apiClient.js';
import { rangeError } from '../../lib/dateRange.js';
import { formatDateRange } from '../../lib/format.js';
import Panel, { ErrorMessage, QuietButton } from '../../components/Panel.jsx';
import { Alert, Badge, EmptyState, LoadingState, buttonClass, inputClass, LABEL } from '../../components/ui/index.js';
import { AuditIcon, SearchIcon } from '../../components/ui/icons.jsx';

const INPUT = inputClass();
const EMPTY = { from: '', to: '', category: '', eventType: '', outcome: '', actorUid: '', targetId: '' };
const OFFLINE = 'You’re offline — the audit log needs an internet connection.';

const OUTCOME_TONES = {
  [AUDIT_OUTCOMES.SUCCESS]: 'success',
  [AUDIT_OUTCOMES.FAILURE]: 'warning',
  [AUDIT_OUTCOMES.DENIED]: 'danger',
};
const OUTCOME_LABELS = { success: 'Success', failure: 'Failed', denied: 'Denied' };
const TARGET_LABELS = {
  user: 'User', student: 'Student', rfidCard: 'RFID card', attendance: 'Attendance', performance: 'Evaluation',
  fetcher: 'Fetcher', dismissal: 'Dismissal', route: 'API',
};

/** API path for the applied filters (empty ones left out) and an optional page cursor. */
function auditPath(filters, cursor) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value.trim()) params.set(key, value.trim());
  if (cursor) params.set('cursor', cursor);
  return `/admin/audit-logs?${params}`;
}

const failure = (error) => (!navigator.onLine ? OFFLINE : error.message);

/** "changedFields" -> "Changed fields". */
const humanize = (key) => key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).replace(/ ([A-Z])/g, (m) => m.toLowerCase());
const showValue = (v) => (Array.isArray(v) ? v.join(', ') || '—' : v === null ? '—' : String(v));

function formatWhen(iso, timeZone) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-PH', { timeZone, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

function actorText(actor) {
  if (actor?.type === 'system') return 'System';
  if (actor?.type === 'cli') return 'Server command line';
  const who = actor?.name ?? actor?.uid ?? 'Unknown user';
  return actor?.role ? `${who} (${actor.role})` : who;
}

function OutcomeBadge({ outcome }) {
  return (
    <Badge tone={OUTCOME_TONES[outcome] ?? 'neutral'} dot>
      {OUTCOME_LABELS[outcome] ?? outcome}
    </Badge>
  );
}

function Details({ entry }) {
  const rows = Object.entries(entry.details ?? {});
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 self-start rounded-xl bg-canvas px-3 py-2 text-xs text-brand-700">
      {entry.reason && (<><dt className="font-semibold">Result</dt><dd className="font-mono break-all">{entry.reason}</dd></>)}
      {rows.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="font-semibold">{humanize(key)}</dt>
          <dd className="break-all">{showValue(value)}</dd>
        </div>
      ))}
      {entry.route && (<><dt className="font-semibold">Route</dt><dd className="font-mono break-all">{entry.route}</dd></>)}
    </dl>
  );
}

function Filters({ draft, setDraft, onApply, onReset, today, busy }) {
  const set = (key) => (e) => setDraft({ ...draft, [key]: e.target.value });
  const events = Object.entries(AUDIT_EVENTS).filter(([, e]) => !draft.category || e.category === draft.category);
  return (
    <form
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
      onSubmit={(e) => {
        e.preventDefault();
        onApply();
      }}
    >
      <div>
        <label htmlFor="audit-from" className={LABEL}>From</label>
        <input id="audit-from" type="date" value={draft.from} max={today} onChange={set('from')} className={`${INPUT} mt-1`} />
      </div>
      <div>
        <label htmlFor="audit-to" className={LABEL}>To</label>
        <input id="audit-to" type="date" value={draft.to} max={today} onChange={set('to')} className={`${INPUT} mt-1`} />
      </div>
      <div>
        <label htmlFor="audit-category" className={LABEL}>Category</label>
        <select id="audit-category" value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value, eventType: '' })} className={`${INPUT} mt-1`}>
          <option value="">All categories</option>
          {Object.entries(AUDIT_CATEGORY_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="audit-event" className={LABEL}>Event</label>
        <select id="audit-event" value={draft.eventType} onChange={set('eventType')} className={`${INPUT} mt-1`}>
          <option value="">All events</option>
          {events.map(([key, e]) => <option key={key} value={key}>{e.label}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="audit-outcome" className={LABEL}>Outcome</label>
        <select id="audit-outcome" value={draft.outcome} onChange={set('outcome')} className={`${INPUT} mt-1`}>
          <option value="">All outcomes</option>
          {Object.values(AUDIT_OUTCOMES).map((o) => <option key={o} value={o}>{OUTCOME_LABELS[o]}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="audit-target" className={LABEL}>Record ID</label>
        <input id="audit-target" value={draft.targetId} onChange={set('targetId')} placeholder="e.g. K2026-001 or a card UID" className={`${INPUT} mt-1`} />
      </div>
      <div>
        <label htmlFor="audit-actor" className={LABEL}>Done by (account ID)</label>
        <input id="audit-actor" value={draft.actorUid} onChange={set('actorUid')} placeholder="Firebase account ID" className={`${INPUT} mt-1`} />
      </div>
      <div className="flex items-end gap-2">
        <button type="submit" disabled={busy} className={buttonClass()}>
          <SearchIcon className="h-4 w-4" />
          Search
        </button>
        <QuietButton onClick={onReset} disabled={busy}>Reset</QuietButton>
      </div>
    </form>
  );
}

/**
 * Admin-only, read-only Audit Log (GET /api/admin/audit-logs). The server checks the admin role
 * on every request; nothing on this page can change or delete an entry.
 */
export default function AuditLogPage() {
  const [draft, setDraft] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [result, setResult] = useState({ loading: true, error: null, data: null, entries: [] });
  const [moreBusy, setMoreBusy] = useState(false);
  const today = result.data?.today;
  const invalid = (draft.from || draft.to) && today ? rangeError(draft.from, draft.to, today) : null;

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setResult((r) => ({ ...r, loading: true, error: null }));
      apiRequest(auditPath(applied))
        .then((data) => {
          if (cancelled) return;
          setResult({ loading: false, error: null, data, entries: data.entries });
          // Show the dates the server actually used (default: last 7 days).
          setDraft((d) => ({ ...d, from: d.from || data.from, to: d.to || data.to }));
        })
        .catch((error) => !cancelled && setResult({ loading: false, error: failure(error), data: null, entries: [] }));
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [applied]);

  async function loadMore() {
    setMoreBusy(true);
    try {
      const data = await apiRequest(auditPath(applied, result.data.nextCursor));
      setResult((r) => ({ ...r, error: null, data, entries: [...r.entries, ...data.entries] }));
    } catch (error) {
      setResult((r) => ({ ...r, error: failure(error) }));
    } finally {
      setMoreBusy(false);
    }
  }

  const { data, entries } = result;
  return (
    <div className="space-y-4">
      <Panel
        title="Audit Log"
        titleId="audit-log-title"
        subtitle="Security and record changes recorded by the server. Read-only. Times are school time."
      >
        <div className="mt-4">
          <Filters
            draft={draft}
            setDraft={setDraft}
            today={today}
            busy={result.loading}
            onApply={() => !invalid && setApplied({ ...draft })}
            onReset={() => {
              setDraft(EMPTY);
              setApplied({ ...EMPTY });
            }}
          />
        </div>
        {invalid && <Alert tone="warning" role="alert" className="mt-4">{invalid}</Alert>}
      </Panel>

      {result.error && <ErrorMessage message={result.error} onRetry={() => setApplied({ ...applied })} />}
      {result.loading && !data && <LoadingState className="justify-center py-6">Loading audit log…</LoadingState>}

      {data && (
        <Panel className={result.loading ? 'opacity-60' : ''}>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-brand-700">
            <strong className="text-brand-900">{formatDateRange(data.from, data.to)}</strong>
            <span aria-hidden="true">·</span>
            <span>{entries.length} {entries.length === 1 ? 'entry' : 'entries'} shown</span>
            <span aria-hidden="true">·</span>
            <span>{data.timeZone}</span>
          </p>
          {data.scanLimitReached && (
            <Alert tone="warning" className="mt-3">
              The server checked its limit of {data.maxScan} entries for this request before finding enough matches, so the
              results may be incomplete. Use “Load more” to keep searching, or narrow the dates.
            </Alert>
          )}

          {entries.length === 0 ? (
            <EmptyState
              className="mt-4"
              icon={<AuditIcon className="h-6 w-6" />}
              title={`No audit entries match these filters${data.nextCursor ? ' yet — load more to keep searching' : ''}.`}
            />
          ) : (
            <ul className="mt-4 space-y-2">
              {entries.map((entry) => (
                <li key={entry.id} className="grid gap-3 rounded-xl border border-brand-100 px-4 py-3 sm:grid-cols-[11rem_1fr_1fr]">
                  <div className="space-y-1 text-sm">
                    <p className="font-medium tabular-nums text-brand-900">{formatWhen(entry.occurredAt, data.timeZone)}</p>
                    <OutcomeBadge outcome={entry.outcome} />
                  </div>
                  <div className="min-w-0 text-sm">
                    <p className="font-semibold text-brand-900">{auditEventLabel(entry.eventType)}</p>
                    <p className="text-brand-700">{actorText(entry.actor)}</p>
                    {entry.target && (
                      <p className="break-all text-xs text-brand-600 dark:text-brand-300">
                        {TARGET_LABELS[entry.target.type] ?? entry.target.type}: <span className="font-mono">{entry.target.id ?? '—'}</span>
                      </p>
                    )}
                  </div>
                  <Details entry={entry} />
                </li>
              ))}
            </ul>
          )}

          {data.nextCursor && (
            <div className="mt-4 flex justify-center">
              <QuietButton onClick={loadMore} disabled={moreBusy}>{moreBusy ? 'Loading…' : 'Load more'}</QuietButton>
            </div>
          )}
          <p className="mt-4 text-xs text-brand-500">
            Entries are kept until the school decides a retention period. They cannot be edited or deleted in this
            system, but people with Firebase console access could still change them, so they are not tamper-proof.
          </p>
        </Panel>
      )}
    </div>
  );
}
