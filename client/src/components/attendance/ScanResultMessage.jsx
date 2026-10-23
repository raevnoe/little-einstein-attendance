import { SCAN_TONES } from '../../lib/attendanceScan.js';
import { AlertIcon, CheckCircleIcon, InfoIcon } from '../ui/icons.jsx';

const TONES = {
  [SCAN_TONES.ACCEPTED]: { box: 'border-leaf-100 bg-leaf-50 text-leaf-700', icon: CheckCircleIcon },
  [SCAN_TONES.IGNORED]: { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: InfoIcon },
  [SCAN_TONES.REJECTED]: { box: 'border-red-200 bg-red-50 text-red-800', icon: AlertIcon },
};

/** Shows one submitAttendanceScan() result: the server's message plus the SMS line, if any. */
export default function ScanResultMessage({ result, children }) {
  const { box, icon: Icon } = TONES[result.tone] ?? TONES[SCAN_TONES.REJECTED];
  return (
    <div className={`flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm ${box}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0">
        {children}
        <p className="font-medium">{result.text}</p>
        {result.sms && (
          <p className={`mt-1 text-xs font-medium ${result.sms.error ? 'text-amber-900' : 'text-leaf-700'}`}>{result.sms.text}</p>
        )}
      </div>
    </div>
  );
}
