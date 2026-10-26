import { useState } from 'react';
import { SCAN_METHODS } from '@led/shared';
import { apiRequest } from '../../lib/apiClient.js';
import { SCAN_TONES, submitAttendanceScan } from '../../lib/attendanceScan.js';
import ScanResultMessage from './ScanResultMessage.jsx';
import Field from '../ui/Field.jsx';
import { buttonClass, FOCUS_RING, inputClass } from '../ui/classes.js';
import { ChevronIcon, KeyboardIcon } from '../ui/icons.jsx';

/**
 * FALLBACK/TESTING: submits a card UID typed by hand through the same submitAttendanceScan()
 * -> server-side processRfidScan() path the UHF RFID reader uses. This is not the reader.
 * The server decides the student, date and time; only the UID is sent.
 */
export default function ManualScanPanel({ onScanned }) {
  const [uid, setUid] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [open, setOpen] = useState(false); // secondary tool: collapsed until needed

  async function handleSubmit(event) {
    event.preventDefault();
    if (!uid.trim()) {
      setResult(await submitAttendanceScan(uid, { request: apiRequest, method: SCAN_METHODS.MANUAL }));
      return;
    }
    setSubmitting(true);
    const scanResult = await submitAttendanceScan(uid, { request: apiRequest, method: SCAN_METHODS.MANUAL });
    setResult(scanResult);
    if (scanResult.tone === SCAN_TONES.ACCEPTED) setUid('');
    setSubmitting(false);
    onScanned();
  }

  return (
    <section aria-labelledby="manual-uid-heading" className="rounded-2xl border border-dashed border-brand-200 bg-paper">
      <h2 id="manual-uid-heading">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="manual-uid-panel"
          className={`flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left sm:px-6 ${FOCUS_RING}`}
        >
          <span className="flex items-center gap-3">
            <KeyboardIcon className="h-5 w-5 shrink-0 text-brand-500" />
            <span className="text-sm font-semibold text-brand-900">Manual RFID UID entry (fallback / testing)</span>
          </span>
          <ChevronIcon className={`h-5 w-5 shrink-0 text-brand-500 motion-safe:transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </h2>

      {/* Kept mounted while collapsed so a typed UID and the last result are not lost. */}
      <form id="manual-uid-panel" hidden={!open} onSubmit={handleSubmit} className="border-t border-brand-100 px-4 pb-5 pt-4 sm:px-6" noValidate>
        <p className="text-sm text-brand-500">
          Use this when the UHF RFID reader is not available or a card cannot be read. Type a registered card UID to
          record time in / time out exactly as a real scan would.
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <Field id="manual-uid" label="RFID card UID" className="min-w-64 flex-1">
            <input
              value={uid}
              onChange={(e) => setUid(e.target.value)}
              disabled={submitting}
              autoComplete="off"
              spellCheck={false}
              placeholder="e.g. 3008 33B2 DDD9 01C4 0A00 0001"
              className={inputClass({ className: 'font-mono text-sm' })}
            />
          </Field>
          <button type="submit" disabled={submitting} className={buttonClass()}>
            {submitting ? 'Submitting…' : 'Submit test scan'}
          </button>
        </div>
        {result && (
          <div role="status" className="mt-3">
            <ScanResultMessage result={result} />
          </div>
        )}
      </form>
    </section>
  );
}
