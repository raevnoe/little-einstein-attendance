import { useEffect, useRef, useState } from 'react';
import { normalizeRfidUid } from '@led/shared';
import { apiRequest } from '../../lib/apiClient.js';
import { createKeyboardScanBuffer, isTextEntryElement } from '../../lib/rfidKeyboardScanner.js';
import { classifyRegistrationScan } from '../../lib/rfidRegistration.js';
import StudentPicker from './StudentPicker.jsx';
import RfidStatusBadge from './RfidStatusBadge.jsx';
import { Alert, Button, Card, buttonClass, inputClass, HINT, LABEL, UID_CHIP } from '../ui/index.js';
import { ArrowLeftIcon, RfidCardIcon } from '../ui/icons.jsx';

/** Why reader input would not reach this page right now (null = ready). Same rule as the Attendance reader. */
function currentPauseReason() {
  if (!document.hasFocus()) return 'window';
  if (isTextEntryElement(document.activeElement)) return 'text-field';
  return null;
}

const PAUSE_MESSAGES = {
  window: 'Paused: this browser window is not active. Click anywhere on this page to resume.',
  'text-field': 'Paused while a text box is selected (the reader would type into it). Click “Resume scanning” to continue.',
};

const MAX_HISTORY = 10;

/**
 * Admin: register UHF RFID cards with the reader (keyboard-emulation mode). Scan a card -> the
 * screen checks whether it is already registered -> for a new card, optionally choose the
 * student -> Register Card saves the card (and its student) in ONE server transaction.
 * A person always confirms; nothing is assigned automatically. Typing the UID is a fallback.
 */
export default function RfidCardRegister({ onView, onBack }) {
  // phase: waiting | checking | new | existing | multiple | error | saving
  const [phase, setPhase] = useState('waiting');
  const [uid, setUid] = useState(null);
  const [existing, setExisting] = useState(null);
  const [otherUid, setOtherUid] = useState(null);
  const [student, setStudent] = useState(null);
  const [error, setError] = useState(null);
  const [invalidScan, setInvalidScan] = useState(false);
  const [pauseReason, setPauseReason] = useState(null);
  const [history, setHistory] = useState([]); // cards registered on this screen, newest first
  const [notice, setNotice] = useState(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState('');
  const [manualError, setManualError] = useState(null);

  // Read by the keyboard listener, which is attached once.
  const scanState = useRef({ phase: 'waiting', current: null, lastSaved: null });
  const lookupId = useRef(0);

  async function lookup(cardUid) {
    const id = ++lookupId.current;
    scanState.current = { ...scanState.current, phase: 'checking', current: cardUid };
    setPhase('checking');
    setUid(cardUid);
    setExisting(null);
    setOtherUid(null);
    setStudent(null);
    setError(null);
    setNotice(null);
    setInvalidScan(false);
    try {
      const { card } = await apiRequest(`/rfid-cards/${encodeURIComponent(cardUid)}`);
      if (id !== lookupId.current) return;
      setExisting(card);
      setPhase('existing');
    } catch (err) {
      if (id !== lookupId.current) return;
      if (err.status === 404) {
        setPhase('new');
      } else {
        setError(err.message);
        setPhase('error');
      }
    }
  }

  function startOver() {
    lookupId.current += 1;
    scanState.current = { ...scanState.current, phase: 'waiting', current: null };
    setPhase('waiting');
    setUid(null);
    setExisting(null);
    setOtherUid(null);
    setStudent(null);
    setError(null);
    setInvalidScan(false);
  }

  // Latest scan handler for the listener below (updated after each render, not during it).
  const handleScanRef = useRef(null);
  useEffect(() => {
    handleScanRef.current = (raw) => {
      if (scanState.current.phase === 'saving') return; // never interrupt a save
      const result = classifyRegistrationScan(scanState.current, raw);
      if (result.kind === 'ignore') return;
      if (result.kind === 'invalid') {
        setInvalidScan(true);
        return;
      }
      if (result.kind === 'multiple') {
        lookupId.current += 1;
        scanState.current = { ...scanState.current, phase: 'multiple' };
        setOtherUid(result.uid);
        setPhase('multiple');
        return;
      }
      lookup(result.uid);
    };
  });

  useEffect(() => {
    const scanner = createKeyboardScanBuffer({ onScan: (raw) => handleScanRef.current?.(raw) });
    const updatePause = () => setPauseReason(currentPauseReason());
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

  async function register() {
    if (!navigator.onLine) {
      setError('You’re offline — this action requires an internet connection.');
      return;
    }
    scanState.current = { ...scanState.current, phase: 'saving' };
    setPhase('saving');
    setError(null);
    try {
      const { card } = await apiRequest('/rfid-cards', {
        method: 'POST',
        body: { uid, ...(student ? { studentId: student.studentId } : {}) },
      });
      scanState.current = { phase: 'waiting', current: null, lastSaved: card.uid };
      setHistory((list) => [card, ...list].slice(0, MAX_HISTORY));
      setNotice(card.student
        ? `RFID card registered and assigned to ${card.student.name} (${card.student.studentId}).`
        : 'RFID card registered (not assigned to a student yet).');
      setPhase('waiting');
      setUid(null);
      setStudent(null);
    } catch (err) {
      scanState.current = { ...scanState.current, phase: 'new' };
      setError(err.message);
      setPhase('new');
    }
  }

  function submitManual(event) {
    event.preventDefault();
    const typed = normalizeRfidUid(manualValue);
    if (!typed) {
      setManualError('Use 4-64 hexadecimal characters (0-9, A-F).');
      return;
    }
    setManualError(null);
    setManualValue('');
    setManualOpen(false);
    lookup(typed);
  }

  const ready = pauseReason === null;
  const waiting = phase === 'waiting';

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className={buttonClass({ variant: 'quiet', size: 'sm' })}>
        <ArrowLeftIcon className="h-4 w-4" /> Back to RFID Cards
      </button>

      <Card className="max-w-3xl">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
              <RfidCardIcon className="h-7 w-7" />
            </span>
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-brand-900">Register RFID Cards</h2>
              <p className="mt-1 text-sm text-brand-500">
                Place ONE card on the UHF RFID reader. Keep other cards away from it - the reader can pick them up from a distance.
              </p>
            </div>
          </div>
          {!ready && (
            <button type="button" onClick={resumeScanning} className={buttonClass({ variant: 'secondary' })}>Resume scanning</button>
          )}
        </div>

        <p
          role="status"
          className={`mt-5 flex items-center gap-3 rounded-xl px-4 py-3 text-base font-semibold ${
            !ready ? 'bg-amber-50 text-amber-900' : waiting ? 'bg-leaf-50 text-leaf-700' : 'bg-sky-50 text-sky-700'
          }`}
        >
          <span aria-hidden="true" className="relative flex h-3 w-3 shrink-0">
            {ready && waiting && <span className="absolute inline-flex h-full w-full rounded-full bg-leaf-400 opacity-60 motion-safe:animate-ping" />}
            <span className={`relative inline-flex h-3 w-3 rounded-full ${!ready ? 'bg-amber-500' : waiting ? 'bg-leaf-400' : 'bg-sky-500'}`} />
          </span>
          {!ready ? 'Scanning paused' : waiting ? 'Ready — scan an RFID card' : phase === 'checking' ? 'Card detected — checking…' : 'Card detected'}
        </p>
        {!ready && <p className="mt-2 text-sm text-amber-900">{PAUSE_MESSAGES[pauseReason]}</p>}

        <div aria-live="polite" className="mt-4 space-y-4 empty:hidden">
          {notice && waiting && <Alert tone="success" role={null}>{notice} Scan the next card.</Alert>}
          {invalidScan && waiting && (
            <Alert tone="warning" role={null}>The reader sent something that is not a valid UHF RFID UID. Try the card again.</Alert>
          )}

          {uid && (
            <div>
              <p className={LABEL}>RFID UID</p>
              <p className="mt-1"><span className={`${UID_CHIP} text-sm`}>{uid}</span></p>
            </div>
          )}

          {phase === 'multiple' && (
            <Alert tone="error" title="More than one card detected">
              <p>
                The reader also read <span className="font-mono">{otherUid}</span>. Keep only the card you are registering near
                the reader, then start over. Nothing was saved.
              </p>
            </Alert>
          )}

          {phase === 'existing' && existing && (
            <Alert tone="warning" title="This RFID card is already registered">
              <p className="flex flex-wrap items-center gap-2">
                <RfidStatusBadge status={existing.status} />
                {existing.student ? <>Assigned to <strong>{existing.student.name}</strong> ({existing.student.studentId}).</> : 'Not assigned to a student.'}
              </p>
              <p className="mt-1">Open the card to assign, reassign or deactivate it.</p>
            </Alert>
          )}

          {phase === 'error' && <Alert tone="error">{error}</Alert>}

          {(phase === 'new' || phase === 'saving') && (
            <div className="space-y-4">
              <Alert tone="info" role={null}>New card. Choose the student who will use it, or register it without a student.</Alert>
              <fieldset disabled={phase === 'saving'} className="space-y-2">
                <StudentPicker value={student} onChange={setStudent} />
                {student && (
                  <p className="text-sm text-brand-700">
                    Selected: <strong>{student.lastName}, {student.firstName}</strong> ({student.studentId}){' '}
                    <button type="button" onClick={() => setStudent(null)} className={buttonClass({ variant: 'quiet', size: 'sm', className: 'min-h-9 px-2' })}>Clear</button>
                  </p>
                )}
              </fieldset>
              {error && <Alert tone="error">{error}</Alert>}
            </div>
          )}
        </div>

        {!waiting && (
          <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-brand-100 pt-5">
            {phase === 'existing' && (
              <button type="button" onClick={() => onView(existing.uid)} className={buttonClass({ variant: 'secondary' })}>Open card</button>
            )}
            {phase === 'error' && (
              <button type="button" onClick={() => lookup(uid)} className={buttonClass({ variant: 'secondary' })}>Try again</button>
            )}
            <button type="button" onClick={startOver} disabled={phase === 'saving'} className={buttonClass({ variant: phase === 'multiple' ? 'primary' : 'secondary' })}>
              {phase === 'new' || phase === 'saving' ? 'Cancel' : 'Start over'}
            </button>
            {(phase === 'new' || phase === 'saving') && (
              <Button onClick={register} busy={phase === 'saving'} busyLabel="Registering…">
                {student ? 'Register and assign card' : 'Register card'}
              </Button>
            )}
          </div>
        )}

        {waiting && (
          <div className="mt-6 border-t border-brand-100 pt-5">
            {manualOpen ? (
              <form onSubmit={submitManual} noValidate className="space-y-2">
                <label htmlFor="rfid-manual-uid" className={LABEL}>Type the RFID UID instead</label>
                <div className="flex flex-wrap gap-2">
                  <input
                    id="rfid-manual-uid"
                    value={manualValue}
                    onChange={(e) => setManualValue(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="e.g. 300833B2DDD901C40A000001"
                    aria-describedby="rfid-manual-uid-hint"
                    aria-invalid={manualError ? true : undefined}
                    className={inputClass({ invalid: Boolean(manualError), className: 'mt-0 max-w-md flex-1 font-mono text-sm' })}
                  />
                  <button type="submit" className={buttonClass()}>Continue</button>
                  <button type="button" onClick={() => { setManualOpen(false); setManualError(null); }} className={buttonClass({ variant: 'secondary' })}>Cancel</button>
                </div>
                <p id="rfid-manual-uid-hint" className={manualError ? 'mt-1 text-sm font-medium text-red-700' : HINT}>
                  {manualError ?? 'For when the reader is not connected. Scanning is paused while you type here.'}
                </p>
              </form>
            ) : (
              <button type="button" onClick={() => setManualOpen(true)} className={buttonClass({ variant: 'quiet', size: 'sm' })}>
                Reader not available? Type the UID instead
              </button>
            )}
          </div>
        )}
      </Card>

      {history.length > 0 && (
        <Card className="max-w-3xl">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-brand-500">Registered on this screen</h3>
          <ul className="mt-3 space-y-2">
            {history.map((card) => (
              <li key={card.uid} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-brand-100 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className={UID_CHIP}>{card.uid}</span>{' '}
                  <span className="text-brand-900">{card.student ? `${card.student.name} (${card.student.studentId})` : 'Not assigned'}</span>
                </span>
                <button type="button" onClick={() => onView(card.uid)} className={buttonClass({ variant: 'quiet', size: 'sm', className: 'min-h-9 px-2' })}>Open</button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
