import { useEffect, useRef, useState } from 'react';
import { DISMISSAL_STATUS } from '@led/shared';
import { apiRequest } from '../lib/apiClient.js';
import { useApiData } from '../lib/useApiData.js';
import { playSound } from '../lib/sounds.js';
import { OFFLINE_MESSAGE, formatDayDate, formatTime } from '../lib/format.js';
import Panel, { ErrorMessage, QuietButton } from '../components/Panel.jsx';
import UpdatedNote from '../components/UpdatedNote.jsx';

// Today's list refreshes itself so a parent's new code request appears without reloading.
const DISMISSAL_REFRESH_MS = 15_000;
const requestKey = (item) => `${item.dismissalId}:${item.requestNumber}`;

/**
 * Chimes and returns an announcement when a refresh brings a NEW request waiting for verification
 * (a new child, or a new code for the same child). Never on the first load or for past dates.
 */
function useNewRequestAlert(data, isToday) {
  const seen = useRef(null);
  const [announcement, setAnnouncement] = useState(null);
  useEffect(() => {
    if (!data) return;
    if (!isToday) {
      seen.current = null;
      return;
    }
    const waiting = data.dismissals.filter((item) => item.status === DISMISSAL_STATUS.AWAITING_VERIFICATION);
    if (seen.current) {
      const fresh = waiting.filter((item) => !seen.current.has(requestKey(item)));
      if (fresh.length > 0) {
        playSound('alert');
        setAnnouncement(`New dismissal request: ${fresh.map((item) => item.student?.name ?? item.studentId).join(', ')}.`);
      }
    }
    seen.current = new Set([...(seen.current ?? []), ...waiting.map(requestKey)]);
  }, [data, isToday]);
  return [announcement, () => setAnnouncement(null)];
}
import DismissalStatusBadge from '../components/dismissal/DismissalStatusBadge.jsx';
import { Alert, EmptyState, InlineConfirm, LoadingState, buttonClass, inputClass, LABEL } from '../components/ui/index.js';
import { AlertIcon, CheckCircleIcon, ClockIcon, DismissalIcon, RefreshIcon, UserIcon } from '../components/ui/icons.jsx';

/** Step 1: the teacher checks the Fetcher's identity and enters the code the Fetcher gives them. */
function VerifyForm({ item, onDone }) {
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    if (!navigator.onLine) return setError(OFFLINE_MESSAGE);
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/dismissals/${encodeURIComponent(item.dismissalId)}/verify`, {
        method: 'POST',
        body: { otp, requestNumber: item.requestNumber },
      });
      onDone();
    } catch (err) {
      setError(err.message);
      setOtp('');
      // Anything other than a wrong code changed the request's state: show the new state.
      if (err.code !== 'dismissal/incorrect-code' && err.code !== 'validation/invalid-otp') onDone();
    } finally {
      setBusy(false);
    }
  }

  const inputId = `otp-${item.dismissalId}`;
  return (
    <form onSubmit={submit} className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm text-amber-900">
        Check that the person is <strong>{item.fetcher.fullName}</strong> ({item.fetcher.relationship}),
        then enter the 6-digit code they received from the parent.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={inputId} className={LABEL}>Dismissal code</label>
          <input
            id={inputId}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/[^\d ]/g, '').slice(0, 7))}
            inputMode="numeric"
            autoComplete="off"
            placeholder="123456"
            disabled={busy}
            className={inputClass({ className: 'w-48 text-center font-mono text-2xl tracking-[0.3em]' })}
          />
        </div>
        <button type="submit" disabled={busy || otp.replace(/\s/g, '').length !== 6} className={buttonClass({ size: 'lg' })}>
          {busy ? 'Checking…' : 'Verify code'}
        </button>
      </div>
      {error && <p role="alert" className="mt-3 flex items-start gap-2 text-sm font-medium text-red-700"><AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}
    </form>
  );
}

/** Step 2: a separate, explicit confirmation that the child has been handed over. */
function ReleaseConfirm({ item, onDone }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function release() {
    if (!navigator.onLine) return setError(OFFLINE_MESSAGE);
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/dismissals/${encodeURIComponent(item.dismissalId)}/release`, {
        method: 'POST',
        body: { requestNumber: item.requestNumber },
      });
      onDone();
    } catch (err) {
      setError(err.message);
      setConfirming(false);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  const child = item.student?.name ?? item.studentId;
  return (
    <div className="mt-4 rounded-2xl border border-leaf-100 bg-leaf-50 p-4 text-sm text-brand-900">
      <p className="flex items-start gap-2">
        <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-leaf-700" />
        <span>Code verified. Hand <strong>{child}</strong> over to <strong>{item.fetcher.fullName}</strong>, then confirm.</span>
      </p>
      {confirming ? (
        <InlineConfirm
          className="mt-3"
          tone="brand"
          message={`Confirm that ${child} has been handed over to ${item.fetcher.fullName}?`}
          confirmLabel="Yes, child released"
          busyLabel="Saving…"
          busy={busy}
          onConfirm={release}
          onCancel={() => setConfirming(false)}
        />
      ) : (
        <button type="button" onClick={() => setConfirming(true)} className={buttonClass({ size: 'lg', className: 'mt-3' })}>
          Confirm handover
        </button>
      )}
      {error && <p role="alert" className="mt-2 font-medium text-red-700">{error}</p>}
    </div>
  );
}

// Progress for a live request: 1 verify the code -> 2 confirm the handover -> released.
const STEPS = [
  { label: 'Verify code', status: DISMISSAL_STATUS.AWAITING_VERIFICATION },
  { label: 'Confirm handover', status: DISMISSAL_STATUS.VERIFIED },
  { label: 'Released', status: DISMISSAL_STATUS.RELEASED },
];

function StepIndicator({ status }) {
  const current = STEPS.findIndex((step) => step.status === status);
  if (current === -1) return null;
  return (
    <ol aria-label="Dismissal steps" className="mt-4 flex flex-wrap items-center gap-2 text-xs font-semibold">
      {STEPS.map((step, index) => {
        const done = index < current || status === DISMISSAL_STATUS.RELEASED;
        const active = index === current && !done;
        return (
          <li key={step.label} aria-current={active ? 'step' : undefined} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full ${
                done ? 'bg-leaf-400 text-brand-900' : active ? 'bg-brand-600 text-white' : 'bg-canvas text-brand-500 ring-1 ring-brand-100'
              }`}
            >
              {done ? <CheckCircleIcon className="h-4 w-4" /> : index + 1}
            </span>
            <span className={active ? 'text-brand-900' : 'text-brand-500'}>
              {step.label}
              {done && <span className="sr-only"> (done)</span>}
            </span>
            {index < STEPS.length - 1 && <span aria-hidden="true" className="h-px w-6 bg-brand-200" />}
          </li>
        );
      })}
    </ol>
  );
}

function Detail({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />
      <div>
        <dt className="inline font-semibold text-brand-900">{label}: </dt>
        <dd className="inline">{children}</dd>
      </div>
    </div>
  );
}

function DismissalCard({ item, timeZone, isToday, onChanged }) {
  const time = (iso) => formatTime(iso, timeZone);
  const name = item.student?.name ?? item.studentId;
  return (
    <li className="rounded-2xl border border-brand-100 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-sky-50 text-sm font-bold text-sky-700">
            {name.split(/\s+/).filter(Boolean).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="text-lg font-semibold text-brand-900">{name}</p>
            <p className="text-sm text-brand-500">
              <span className="font-mono">{item.studentId}</span>{item.student?.section ? ` · ${item.student.section}` : ''}
            </p>
          </div>
        </div>
        <DismissalStatusBadge status={item.status} />
      </div>
      <StepIndicator status={item.status} />
      <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm text-brand-700 sm:grid-cols-2">
        <Detail icon={UserIcon} label="Fetcher">{item.fetcher.fullName} ({item.fetcher.relationship})</Detail>
        <Detail icon={ClockIcon} label="Requested by">{item.parentName ?? 'Parent'} at {time(item.requestedAt)}</Detail>
        {item.status === DISMISSAL_STATUS.AWAITING_VERIFICATION && (
          <Detail icon={ClockIcon} label="Code expires">{time(item.otpExpiresAt)} · {item.attemptsRemaining} attempts left</Detail>
        )}
        {item.verifiedAt && (
          <Detail icon={CheckCircleIcon} label="Verified">{time(item.verifiedAt)} by {item.verifiedByName ?? 'staff'}</Detail>
        )}
        {item.releasedAt && (
          <Detail icon={CheckCircleIcon} label="Released">{time(item.releasedAt)} by {item.releasedByName ?? 'staff'}</Detail>
        )}
      </dl>
      {isToday && item.status === DISMISSAL_STATUS.AWAITING_VERIFICATION && <VerifyForm item={item} onDone={onChanged} />}
      {isToday && item.status === DISMISSAL_STATUS.VERIFIED && <ReleaseConfirm item={item} onDone={onChanged} />}
      {[DISMISSAL_STATUS.LOCKED, DISMISSAL_STATUS.EXPIRED, DISMISSAL_STATUS.SMS_FAILED, DISMISSAL_STATUS.CANCELLED].includes(item.status) && (
        <Alert tone="warning" role={null} className="mt-4">
          Do not release the child with this request. The parent can request a new code.
        </Alert>
      )}
    </li>
  );
}

/**
 * Dismissal Verification for staff: today's requests from parents. A teacher verifies the
 * Fetcher's code, then separately confirms the handover. Admins can also look at past dates.
 * The server enforces every rule; this page never sees a code or its hash.
 */
export default function DismissalPage({ allowDate = false }) {
  const [date, setDate] = useState('');
  const path = date ? `/dismissals?${new URLSearchParams({ date })}` : '/dismissals';
  // Only "today" (no date picked) refreshes itself; past dates do not change.
  const { loading, data, error, reload, refresh, updatedAt } = useApiData(path, { refreshMs: date ? 0 : DISMISSAL_REFRESH_MS });
  const isToday = Boolean(data) && data.schoolDate === data.today;
  const items = data?.dismissals ?? [];
  const [announcement, clearAnnouncement] = useNewRequestAlert(data, isToday);

  return (
    <Panel
      title={data ? formatDayDate(data.schoolDate, { long: true }) : 'Dismissal Verification'}
      titleId="dismissal-title"
      subtitle="A parent requests a code for their Fetcher. Verify the code, then confirm the handover."
      actions={(
        <div className="flex flex-wrap items-end gap-2">
          {allowDate && (
            <div>
              <label htmlFor="dismissal-date" className={LABEL}>Date</label>
              <input id="dismissal-date" type="date" value={date} max={data?.today} onChange={(e) => setDate(e.target.value)} className={inputClass({ className: 'w-auto' })} />
            </div>
          )}
          <QuietButton onClick={refresh} disabled={loading}>
            <RefreshIcon className="h-4 w-4" />
            {loading ? 'Refreshing…' : 'Refresh'}
          </QuietButton>
        </div>
      )}
    >
      {isToday && <UpdatedNote updatedAt={updatedAt} timeZone={data.timeZone} every="15 seconds" className="mt-3" />}
      {/* Always mounted so screen readers announce a new request. */}
      <div role="status" aria-live="polite" className="empty:hidden">
        {announcement && (
          <Alert
            tone="info"
            role={null}
            className="mt-4"
            action={<button type="button" onClick={clearAnnouncement} className={buttonClass({ variant: 'quiet', size: 'sm' })}>Dismiss</button>}
          >
            <p className="font-semibold">{announcement}</p>
          </Alert>
        )}
      </div>
      {error && <ErrorMessage message={error} onRetry={reload} />}
      {loading && !data && <LoadingState className="mt-4">Loading dismissal requests…</LoadingState>}
      {data && items.length === 0 && (
        <EmptyState className="mt-4" icon={<DismissalIcon className="h-6 w-6" />} title="No dismissal requests for this day." />
      )}
      {items.length > 0 && (
        <ul className="mt-4 space-y-4">
          {items.map((item) => (
            <DismissalCard key={`${item.dismissalId}-${item.requestNumber}-${item.status}`} item={item} timeZone={data.timeZone} isToday={isToday} onChanged={reload} />
          ))}
        </ul>
      )}
    </Panel>
  );
}
