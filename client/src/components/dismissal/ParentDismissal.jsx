import { useState } from 'react';
import { DISMISSAL_STATUS } from '@led/shared';
import { apiRequest } from '../../lib/apiClient.js';
import { useApiData } from '../../lib/useApiData.js';
import { OFFLINE_MESSAGE, formatTime, studentFullName } from '../../lib/format.js';
import Panel, { ErrorMessage, QuietButton } from '../Panel.jsx';
import DismissalStatusBadge from './DismissalStatusBadge.jsx';
import FetcherForm from './FetcherForm.jsx';
import DevOtpPeek from './DevOtpPeek.jsx';
import { Badge, EmptyState, InitialsAvatar, InlineConfirm, LoadingState, buttonClass, inputClass } from '../ui/index.js';
import { FetcherIcon, InfoIcon, LockIcon, PencilIcon, PhoneIcon, PlusIcon, RefreshIcon } from '../ui/icons.jsx';

const STATUS_HINT = {
  [DISMISSAL_STATUS.AWAITING_VERIFICATION]: 'The code was sent to your phone by SMS. Give it only to the Fetcher; the teacher will ask for it.',
  [DISMISSAL_STATUS.VERIFIED]: 'The teacher has checked the code. Your child is being handed over.',
  [DISMISSAL_STATUS.RELEASED]: 'Your child has been released to the Fetcher.',
  [DISMISSAL_STATUS.EXPIRED]: 'The code has expired. You can request a new one.',
  [DISMISSAL_STATUS.LOCKED]: 'Too many incorrect codes were entered. You can request a new code.',
  [DISMISSAL_STATUS.SMS_FAILED]: 'The SMS could not be sent, so no code is active. Please try again.',
  [DISMISSAL_STATUS.CANCELLED]: 'This request was cancelled because the Fetcher is no longer authorized.',
  [DISMISSAL_STATUS.SENDING]: 'Sending the code…',
};

const STEPS = [
  { title: 'Send a code', text: 'It goes by SMS to your registered mobile number.', tone: 'bg-sky-500' },
  { title: 'Give it to your Fetcher', text: 'Share it only with the person picking up your child.', tone: 'bg-grape-500' },
  { title: 'Teacher checks it', text: 'Your child is released after the code is verified.', tone: 'bg-leaf-400' },
];

/** The three steps of the existing Dismissal Verification flow (information only). */
function HowItWorks() {
  return (
    <ol className="mt-5 grid gap-3 sm:grid-cols-3">
      {STEPS.map((step, index) => (
        <li key={step.title} className="flex gap-3 rounded-2xl bg-canvas p-3 sm:flex-col sm:gap-2">
          <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${step.tone}`}>
            {index + 1}
          </span>
          <div>
            <p className="text-sm font-semibold text-brand-900">{step.title}</p>
            <p className="text-xs text-brand-600">{step.text}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

const childInitials = (child) => `${child.firstName?.[0] ?? ''}${child.lastName?.[0] ?? ''}`.toUpperCase();

/** One child: today's dismissal status and the "send a code" action. */
function ChildDismissal({ child, fetchers, dismissal, timeZone, onChanged }) {
  const eligible = fetchers.filter((f) => f.active && f.studentIds.includes(child.studentId));
  const [fetcherId, setFetcherId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const done = dismissal && [DISMISSAL_STATUS.VERIFIED, DISMISSAL_STATUS.RELEASED].includes(dismissal.status);
  const selected = eligible.some((f) => f.fetcherId === fetcherId) ? fetcherId : eligible[0]?.fetcherId ?? '';

  async function requestCode() {
    if (!navigator.onLine) return setError(OFFLINE_MESSAGE);
    setBusy(true);
    setError(null);
    try {
      await apiRequest('/parent/dismissals', { method: 'POST', body: { studentId: child.studentId, fetcherId: selected } });
      onChanged();
    } catch (err) {
      setError(err.message);
      if (err.status === 502) onChanged();
    } finally {
      setBusy(false);
    }
  }

  const selectId = `fetcher-for-${child.studentId}`;
  const awaiting = dismissal?.status === DISMISSAL_STATUS.AWAITING_VERIFICATION;
  return (
    <li className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-brand-100 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <InitialsAvatar text={childInitials(child)} tone="leaf" className="h-11 w-11 text-sm" />
          <p className="font-semibold text-brand-900">{studentFullName(child)}</p>
        </div>
        {dismissal && <DismissalStatusBadge status={dismissal.status} />}
      </div>

      {dismissal && (
        <div className="mt-4 rounded-xl bg-canvas p-3 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-brand-500">Fetcher</dt>
            <dd className="text-brand-900"><strong>{dismissal.fetcher.fullName}</strong> ({dismissal.fetcher.relationship})</dd>
            {dismissal.requestedAt && (
              <>
                <dt className="text-brand-500">Code requested</dt>
                <dd className="tabular-nums text-brand-900">{formatTime(dismissal.requestedAt, timeZone)}</dd>
              </>
            )}
            {awaiting && (
              <>
                <dt className="text-brand-500">Code expires</dt>
                <dd className="font-semibold tabular-nums text-brand-900">{formatTime(dismissal.otpExpiresAt, timeZone)}</dd>
              </>
            )}
            {dismissal.releasedAt && (
              <>
                <dt className="text-brand-500">Released</dt>
                <dd className="tabular-nums text-brand-900">{formatTime(dismissal.releasedAt, timeZone)}</dd>
              </>
            )}
            <dt className="text-brand-500">Codes sent today</dt>
            <dd className="tabular-nums text-brand-900">{dismissal.codesRequestedToday}</dd>
          </dl>
          <p className="mt-2 flex gap-2 border-t border-brand-100 pt-2 text-brand-700">
            <InfoIcon className="mt-0.5 h-4 w-4 shrink-0 text-sky-700" />
            {STATUS_HINT[dismissal.status]}
          </p>
        </div>
      )}

      {/* Development builds only (removed from production builds): read the mock-SMS code. */}
      {import.meta.env.DEV && awaiting && (
        <DevOtpPeek studentId={child.studentId} requestNumber={dismissal.codesRequestedToday} />
      )}

      {!done && (
        eligible.length === 0 ? (
          <p className="mt-3 flex gap-2 rounded-xl border border-dashed border-brand-200 px-3 py-2.5 text-sm text-brand-700">
            <FetcherIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
            Add a Fetcher for {child.firstName} below to request a dismissal code.
          </p>
        ) : (
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <div className="min-w-48 flex-1">
              <label htmlFor={selectId} className="block text-sm font-semibold text-brand-900">Who will pick up {child.firstName}?</label>
              <select id={selectId} value={selected} onChange={(e) => setFetcherId(e.target.value)} disabled={busy} className={inputClass()}>
                {eligible.map((f) => <option key={f.fetcherId} value={f.fetcherId}>{f.fullName} ({f.relationship})</option>)}
              </select>
            </div>
            <button type="button" onClick={requestCode} disabled={busy || !selected} className={buttonClass()}>
              <PhoneIcon className="h-4 w-4" />
              {busy ? 'Sending…' : dismissal ? 'Send a new code' : 'Send code to my phone'}
            </button>
          </div>
        )
      )}
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">{error}</p>}
    </li>
  );
}

function FetcherRow({ fetcher, options, onChanged }) {
  const [mode, setMode] = useState(null); // null | 'edit' | 'confirm'
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const names = fetcher.studentIds
    .map((id) => ({ id, name: options.find((c) => c.studentId === id)?.firstName }))
    .filter((c) => c.name);

  async function deactivate() {
    if (!navigator.onLine) return setError(OFFLINE_MESSAGE);
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/parent/fetchers/${encodeURIComponent(fetcher.fetcherId)}/deactivate`, { method: 'POST' });
      onChanged();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  if (mode === 'edit') {
    return <li><FetcherForm fetcher={fetcher} options={options} onSaved={onChanged} onCancel={() => setMode(null)} /></li>;
  }

  return (
    <li className={`rounded-2xl p-4 ring-1 ${fetcher.active ? 'bg-white shadow-sm ring-brand-100' : 'bg-canvas ring-brand-100'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${fetcher.active ? 'bg-grape-50 text-grape-700' : 'bg-white text-brand-500'}`}>
            <FetcherIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-brand-900">{fetcher.fullName}</p>
            <p className="text-sm text-brand-600">{fetcher.relationship}</p>
          </div>
        </div>
        {!fetcher.active && <Badge tone="neutral">Deactivated</Badge>}
      </div>
      {names.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="text-xs font-semibold uppercase tracking-wide text-brand-500">May collect</span>
          {names.map(({ id, name }) => (
            <span key={id} className="rounded-full bg-leaf-50 px-2.5 py-0.5 font-medium text-leaf-700 ring-1 ring-inset ring-leaf-100">{name}</span>
          ))}
        </div>
      )}
      {fetcher.active && mode === 'confirm' && (
        <InlineConfirm
          className="mt-3"
          message={<>Deactivate <strong>{fetcher.fullName}</strong>? They will no longer be able to collect your child, and any code already sent for them will stop working.</>}
          confirmLabel="Deactivate"
          busyLabel="Deactivating…"
          busy={busy}
          onConfirm={deactivate}
          onCancel={() => setMode(null)}
        />
      )}
      {fetcher.active && mode === null && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setMode('edit')} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            <PencilIcon className="h-4 w-4" />
            Edit
          </button>
          <button type="button" onClick={() => setMode('confirm')} className={buttonClass({ variant: 'danger', size: 'sm' })}>Deactivate</button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-medium text-red-700">{error}</p>}
    </li>
  );
}

/**
 * Parent's Fetchers and Dismissal Verification. `options` = the parent's own active children
 * (from GET /api/parent/children). Codes are sent ONLY by SMS to the parent's phone; this page
 * never receives them (except DevOtpPeek, which exists only in development builds with mock SMS).
 */
export default function ParentDismissal({ options }) {
  const fetcherData = useApiData('/parent/fetchers');
  const dismissalData = useApiData('/parent/dismissals');
  const [adding, setAdding] = useState(false);

  const fetchers = fetcherData.data?.fetchers ?? [];
  const byStudent = new Map((dismissalData.data?.dismissals ?? []).map((d) => [d.studentId, d]));
  const active = fetchers.filter((f) => f.active);
  const inactive = fetchers.filter((f) => !f.active);

  function fetchersChanged() {
    setAdding(false);
    fetcherData.reload();
    dismissalData.reload();
  }

  return (
    <div className="grid items-start gap-6 lg:grid-cols-2">
      <Panel
        title="Dismissal Verification"
        titleId="parent-dismissal-title"
        subtitle="Can’t pick up your child today? Send a one-time code to your phone and give it to your Fetcher."
        script
        accent="sky"
        actions={(
          <QuietButton onClick={dismissalData.refresh} disabled={dismissalData.loading}>
            <RefreshIcon className="h-4 w-4" />
            Refresh
          </QuietButton>
        )}
      >
        <HowItWorks />
        {(dismissalData.error || fetcherData.error) && (
          <ErrorMessage message={dismissalData.error || fetcherData.error} onRetry={fetchersChanged} />
        )}
        {(dismissalData.loading || fetcherData.loading) && <LoadingState className="mt-4">Loading…</LoadingState>}
        {dismissalData.data && fetcherData.data && (
          <ul className="mt-5 space-y-3">
            {options.map((child) => (
              <ChildDismissal
                key={child.studentId}
                child={child}
                fetchers={fetchers}
                dismissal={byStudent.get(child.studentId)}
                timeZone={dismissalData.data.timeZone}
                onChanged={dismissalData.reload}
              />
            ))}
          </ul>
        )}
        <p className="mt-5 flex gap-2 rounded-xl bg-sun-50 px-3 py-2.5 text-sm text-sun-700">
          <LockIcon className="mt-0.5 h-4 w-4 shrink-0" />
          Never share the code with anyone except the Fetcher. School staff will never ask you for it by phone.
        </p>
      </Panel>

      <Panel
        title="My Fetchers"
        titleId="parent-fetchers-title"
        subtitle="People you allow to pick up your child. Fetchers do not need an account."
        script
        accent="grape"
        actions={!adding && (
          <button type="button" onClick={() => setAdding(true)} className={buttonClass({ variant: 'secondary' })}>
            <PlusIcon className="h-4 w-4" />
            Add Fetcher
          </button>
        )}
      >
        <div className="mt-5 space-y-3">
          {adding && <FetcherForm options={options} onSaved={fetchersChanged} onCancel={() => setAdding(false)} />}
          {fetcherData.loading && <LoadingState>Loading Fetchers…</LoadingState>}
          {fetcherData.data && fetchers.length === 0 && !adding && (
            <EmptyState icon={<FetcherIcon className="h-6 w-6" />} title="You have not added any Fetchers yet.">
              Add a family member or trusted adult who may pick up your child.
            </EmptyState>
          )}
          {active.length > 0 && (
            <ul className="space-y-3">
              {active.map((f) => <FetcherRow key={f.fetcherId} fetcher={f} options={options} onChanged={fetchersChanged} />)}
            </ul>
          )}
          {inactive.length > 0 && (
            <details className="rounded-2xl bg-canvas p-3 ring-1 ring-brand-100">
              <summary className="min-h-11 cursor-pointer content-center rounded-lg px-1 text-sm font-semibold text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                Deactivated Fetchers ({inactive.length})
              </summary>
              <ul className="mt-2 space-y-2">
                {inactive.map((f) => <FetcherRow key={f.fetcherId} fetcher={f} options={options} onChanged={fetchersChanged} />)}
              </ul>
            </details>
          )}
        </div>
      </Panel>
    </div>
  );
}
