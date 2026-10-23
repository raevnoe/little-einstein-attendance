import { useEffect, useRef, useState } from 'react';
import { apiRequest } from '../../lib/apiClient.js';
import { submitAttendanceScan } from '../../lib/attendanceScan.js';
import { createKeyboardScanBuffer, isTextEntryElement } from '../../lib/rfidKeyboardScanner.js';
import { AUTO_CLEAR_KINDS, describeScanResult, soundForScan } from '../../lib/scanFeedback.js';
import { playSound } from '../../lib/sounds.js';
import ScanResultMessage from './ScanResultMessage.jsx';
import ScanFeedbackCard from './ScanFeedbackCard.jsx';
import { buttonClass } from '../ui/classes.js';
import { RfidCardIcon } from '../ui/icons.jsx';

const MAX_RECENT_SCANS = 5;
// How long a success / "already recorded" card stays before the panel shows only the Ready state.
// Long enough to read a name and time; the result also stays in Recent scans.
const FEEDBACK_SHOW_MS = 5000;

/** Why typed reader input would not reach this page right now (null = ready). */
function currentPauseReason() {
  if (!document.hasFocus()) return 'window';
  if (isTextEntryElement(document.activeElement)) return 'text-field';
  return null;
}

const PAUSE_MESSAGES = {
  window: 'Paused: this browser window is not active. Click anywhere on this page to resume.',
  'text-field': 'Paused: a text box is selected, so the reader would type into it. Click “Resume scanning” to continue.',
};

/**
 * UHF RFID reader in keyboard-emulation mode (WYUAN UHF60U over USB HID): the reader types the
 * card UID and presses Enter. While this panel is shown, keystrokes that are NOT aimed at a text
 * field are collected by the scan buffer, and each completed scan goes through the same
 * submitAttendanceScan() -> POST /api/attendance/scan -> processRfidScan() path as the manual form.
 */
export default function ReaderScanPanel({ onScanned, timeZone }) {
  const [pauseReason, setPauseReason] = useState(null);
  const [scans, setScans] = useState([]); // newest first: { id, uid, result | null }
  const [dismissedId, setDismissedId] = useState(null); // latest scan whose large card was cleared
  const nextId = useRef(1);
  const onScannedRef = useRef(onScanned);

  // The large card always shows the newest scan; a newer scan replaces it. The timer only hides
  // the card - it never touches the scanner, the request, or the server's debounce.
  const latest = scans[0] ?? null;
  const latestId = latest?.id ?? null;
  const latestKind = latest?.result ? describeScanResult(latest.result, { timeZone }).kind : null;
  const showLatest = latest !== null && latestId !== dismissedId;

  useEffect(() => {
    if (!AUTO_CLEAR_KINDS.has(latestKind)) return undefined;
    const timer = setTimeout(() => setDismissedId(latestId), FEEDBACK_SHOW_MS);
    return () => clearTimeout(timer);
  }, [latestId, latestKind]);

  useEffect(() => {
    onScannedRef.current = onScanned;
  }, [onScanned]);

  useEffect(() => {
    async function handleScan(uid) {
      const id = nextId.current++;
      setScans((list) => [{ id, uid, result: null }, ...list].slice(0, MAX_RECENT_SCANS));
      // Scans are independent requests, so a queue of children is never blocked by one slow
      // response; the server's transaction and debounce handle any overlap.
      const result = await submitAttendanceScan(uid, { request: apiRequest });
      // Audible confirmation at the reader: staff do not have to look at the screen for every child.
      const sound = soundForScan(result);
      if (sound) playSound(sound);
      setScans((list) => list.map((scan) => (scan.id === id ? { ...scan, result } : scan)));
      onScannedRef.current?.();
    }

    const scanner = createKeyboardScanBuffer({ onScan: handleScan });
    const updatePause = () => setPauseReason(currentPauseReason());
    // focusout/blur fire before focus has moved on, so re-check once it has.
    const updatePauseSoon = () => setTimeout(updatePause, 0);

    updatePause();
    document.addEventListener('keydown', scanner.handleKeyDown);
    document.addEventListener('focusin', updatePause);
    document.addEventListener('focusout', updatePauseSoon);
    window.addEventListener('focus', updatePause);
    window.addEventListener('blur', updatePauseSoon);
    return () => {
      document.removeEventListener('keydown', scanner.handleKeyDown);
      document.removeEventListener('focusin', updatePause);
      document.removeEventListener('focusout', updatePauseSoon);
      window.removeEventListener('focus', updatePause);
      window.removeEventListener('blur', updatePauseSoon);
    };
  }, []);

  function resumeScanning() {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    setPauseReason(currentPauseReason());
  }

  const ready = pauseReason === null;

  return (
    <section
      className={`rounded-2xl border-2 bg-white p-5 shadow-sm sm:p-6 ${ready ? 'border-leaf-300' : 'border-amber-300'}`}
      aria-labelledby="reader-heading"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden="true" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${ready ? 'bg-leaf-50 text-leaf-700' : 'bg-amber-50 text-amber-800'}`}>
            <RfidCardIcon className="h-7 w-7" />
          </span>
          <div className="min-w-0">
            <h2 id="reader-heading" className="text-lg font-semibold text-brand-900">UHF RFID Reader</h2>
            <p className="mt-0.5 text-sm text-brand-500">
              Keep this page open with the reader connected by USB. Present the RFID card to record time in / time out.
            </p>
          </div>
        </div>
        {!ready && (
          <button type="button" onClick={resumeScanning} className={buttonClass({ variant: 'secondary' })}>
            Resume scanning
          </button>
        )}
      </div>

      <p
        role="status"
        className={`mt-4 flex items-center gap-3 rounded-xl px-4 py-3 text-base font-semibold ${
          ready ? 'bg-leaf-50 text-leaf-700' : 'bg-amber-50 text-amber-900'
        }`}
      >
        <span aria-hidden="true" className="relative flex h-3 w-3 shrink-0">
          {ready && <span className="absolute inline-flex h-full w-full rounded-full bg-leaf-400 opacity-60 motion-safe:animate-ping" />}
          <span className={`relative inline-flex h-3 w-3 rounded-full ${ready ? 'bg-leaf-400' : 'bg-amber-500'}`} />
        </span>
        {ready ? 'RFID Reader Ready — Scan RFID Card' : 'Scanning paused'}
      </p>
      {!ready && <p className="mt-2 text-sm text-amber-900">{PAUSE_MESSAGES[pauseReason]}</p>}

      {/* Always mounted so screen readers announce each new result; the list below is not live. */}
      <div role="status" aria-live="polite" aria-atomic="true" className="mt-4 empty:hidden">
        {showLatest && (
          <ScanFeedbackCard
            uid={latest.uid}
            result={latest.result}
            timeZone={timeZone}
            onDismiss={latest.result && !AUTO_CLEAR_KINDS.has(latestKind) ? () => setDismissedId(latestId) : null}
          />
        )}
      </div>

      {scans.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-brand-500">Recent scans</h3>
          <ul className="mt-2 space-y-2">
            {scans.map((scan) =>
              scan.result ? (
                <li key={scan.id}>
                  <ScanResultMessage result={scan.result}>
                    <p className="mb-0.5 font-mono text-xs opacity-75">{scan.uid}</p>
                  </ScanResultMessage>
                </li>
              ) : (
                <li key={scan.id} className="rounded-xl border border-brand-100 bg-canvas px-3 py-2.5 text-sm text-brand-700">
                  <p className="mb-0.5 font-mono text-xs opacity-75">{scan.uid}</p>
                  <p>Processing scan…</p>
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </section>
  );
}
