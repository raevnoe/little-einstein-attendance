import { useState } from 'react';
import { ARRIVAL_STATUS, LATE_EXCUSE_MAX_LENGTH } from '@led/shared';
import { apiRequest } from '../../lib/apiClient.js';
import { Button } from '../ui/index.js';
import { inputClass } from '../ui/classes.js';

/**
 * Staff action next to a late arrival: excuse it with a short reason (e.g. doctor's appointment,
 * flooding), or remove the excuse. The server checks the role and the teacher's sections.
 * `onChanged()` reloads the list.
 */
export default function LateExcuse({ studentName, attendance, onChanged }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const status = attendance?.arrivalStatus;
  if (status !== ARRIVAL_STATUS.LATE && status !== ARRIVAL_STATUS.EXCUSED) return null;

  const id = `${attendance.studentId}_${attendance.schoolDate}`;
  async function send(body) {
    setBusy(true);
    setError(null);
    try {
      await apiRequest(`/attendance/${encodeURIComponent(id)}/late`, { method: 'PATCH', body });
      setOpen(false);
      setReason('');
      onChanged?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (status === ARRIVAL_STATUS.EXCUSED) {
    return (
      <div className="mt-1 text-xs text-brand-500">
        <span className="font-semibold text-brand-700">Reason:</span> {attendance.excuseReason}
        <button type="button" disabled={busy} onClick={() => send({ excused: false })} className="ml-2 font-semibold text-brand-600 underline-offset-2 hover:underline dark:text-brand-300">
          {busy ? 'Removing…' : 'Remove excuse'}
        </button>
        {error && <p role="alert" className="mt-1 font-medium text-red-700">{error}</p>}
      </div>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="mt-1 block text-xs font-semibold text-brand-600 underline-offset-2 hover:underline dark:text-brand-300">
        Excuse late arrival
      </button>
    );
  }

  const inputId = `excuse-${id}`;
  return (
    <form
      className="mt-2 space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        send({ excused: true, reason });
      }}
    >
      <label htmlFor={inputId} className="block text-xs font-semibold text-brand-900">Reason {studentName} was late</label>
      <input
        id={inputId}
        value={reason}
        maxLength={LATE_EXCUSE_MAX_LENGTH}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. Doctor's appointment"
        className={inputClass({ className: 'min-h-10 text-sm' })}
        autoFocus
      />
      {error && <p role="alert" className="text-xs font-medium text-red-700">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" busy={busy} busyLabel="Saving…">Excuse</Button>
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => { setOpen(false); setError(null); }}>Cancel</Button>
      </div>
    </form>
  );
}
