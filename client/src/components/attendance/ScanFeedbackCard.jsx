import { describeScanResult, FEEDBACK_KINDS } from '../../lib/scanFeedback.js';
import { buttonClass } from '../ui/classes.js';
import { AlertIcon, CheckCircleIcon, InfoIcon, RfidCardIcon, WifiOffIcon } from '../ui/icons.jsx';

const KINDS = {
  [FEEDBACK_KINDS.SUCCESS]: { box: 'border-leaf-300 bg-leaf-50', title: 'text-leaf-700', badge: 'bg-leaf-100 text-leaf-700', icon: CheckCircleIcon },
  [FEEDBACK_KINDS.INFO]: { box: 'border-sky-300 bg-sky-50', title: 'text-sky-700', badge: 'bg-sky-100 text-sky-700', icon: InfoIcon },
  [FEEDBACK_KINDS.WARNING]: { box: 'border-amber-300 bg-amber-50', title: 'text-amber-900', badge: 'bg-amber-100 text-amber-800', icon: AlertIcon },
  [FEEDBACK_KINDS.OFFLINE]: { box: 'border-amber-300 bg-amber-50', title: 'text-amber-900', badge: 'bg-amber-100 text-amber-800', icon: WifiOffIcon },
  [FEEDBACK_KINDS.ERROR]: { box: 'border-red-300 bg-red-50', title: 'text-red-800', badge: 'bg-red-100 text-red-700', icon: AlertIcon },
};

/**
 * Large result card for the latest reader scan (`result` null = still processing). Display only:
 * the reader keeps listening while it is shown, and the Recent scans list keeps the history.
 */
export default function ScanFeedbackCard({ uid, result, timeZone, onDismiss }) {
  if (!result) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border-2 border-brand-100 bg-canvas p-5">
        <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
          <RfidCardIcon className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <p className="text-lg font-bold text-brand-900">Processing scan…</p>
          <p className="truncate font-mono text-xs text-brand-500">{uid}</p>
        </div>
      </div>
    );
  }

  const feedback = describeScanResult(result, { timeZone });
  const style = KINDS[feedback.kind];
  const Icon = style.icon;
  const showUid = feedback.kind === FEEDBACK_KINDS.WARNING || feedback.kind === FEEDBACK_KINDS.ERROR;

  return (
    <div className={`rounded-2xl border-2 p-5 ${style.box}`}>
      <div className="flex items-start gap-4">
        <span aria-hidden="true" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${style.badge}`}>
          <Icon className="h-7 w-7" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-lg font-bold ${style.title}`}>{feedback.title}</p>
          {feedback.studentName && <p className="mt-1 break-words text-2xl font-bold text-brand-900">{feedback.studentName}</p>}
          {feedback.times.length > 0 && (
            <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
              {feedback.times.map((time) => (
                <div key={time.label}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-brand-500">{time.label}</dt>
                  <dd className="text-2xl font-bold tabular-nums text-brand-900">{time.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="mt-3 text-sm font-medium text-brand-900">{feedback.message}</p>
          {result.sms && (
            <p className={`mt-1 text-sm font-medium ${result.sms.error ? 'text-amber-900' : 'text-leaf-700'}`}>{result.sms.text}</p>
          )}
          {feedback.nextStep && <p className="mt-1 text-sm text-brand-700">{feedback.nextStep}</p>}
          {showUid && uid && <p className="mt-2 break-all font-mono text-xs text-brand-500">Card UID: {uid}</p>}
        </div>
      </div>
      {onDismiss && (
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onDismiss} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
