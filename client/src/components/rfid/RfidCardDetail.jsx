import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/apiClient.js';
import RfidStatusBadge from './RfidStatusBadge.jsx';
import StudentPicker from './StudentPicker.jsx';
import { Alert, Card, InlineConfirm, LoadingState, buttonClass, FOCUS_RING } from '../ui/index.js';
import { ArrowLeftIcon, RfidCardIcon } from '../ui/icons.jsx';

const formatTime = (iso) => (iso ? new Date(iso).toLocaleString('en-PH') : '—');
const studentLabel = (s) => (s ? `${s.studentId} – ${s.name}` : '—');

function Row({ label, children }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-semibold text-brand-500">{label}</dt>
      <dd className="text-sm text-brand-900 sm:col-span-2">{children}</dd>
    </div>
  );
}

export default function RfidCardDetail({ uid, canManage, notice, onBack }) {
  const [state, setState] = useState({ loading: true, card: null, error: null });
  const [message, setMessage] = useState(notice);
  // null | 'assign' | 'reassign' | 'unassign' | 'deactivate'
  const [action, setAction] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const load = useCallback(() => {
    apiRequest(`/rfid-cards/${encodeURIComponent(uid)}`)
      .then((data) => setState({ loading: false, card: data.card, error: null }))
      .catch((error) => setState({ loading: false, card: null, error: error.message }));
  }, [uid]);

  useEffect(load, [load]);

  function startAction(name) {
    setMessage(null);
    setActionError(null);
    setSelected(null);
    setAction(name);
  }

  async function run(path, body, successMessage) {
    setBusy(true);
    setActionError(null);
    try {
      const data = await apiRequest(`/rfid-cards/${encodeURIComponent(uid)}/${path}`, { method: 'POST', body });
      setState({ loading: false, card: data.card, error: null });
      setMessage(successMessage);
      setAction(null);
    } catch (error) {
      setActionError(error.message);
      load(); // show the card's current state if someone else changed it
    } finally {
      setBusy(false);
    }
  }

  const { card } = state;
  const cancelButton = (
    <button type="button" onClick={() => setAction(null)} disabled={busy} className={buttonClass({ variant: 'secondary' })}>
      Cancel
    </button>
  );

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 ${FOCUS_RING}`}>
        <ArrowLeftIcon className="h-4 w-4" />
        Back to RFID Cards
      </button>

      {message && <Alert tone="success">{message}</Alert>}
      {state.loading && <LoadingState>Loading RFID card…</LoadingState>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      {card && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                <RfidCardIcon className="h-7 w-7" />
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-brand-500">UHF RFID Card</p>
                <h2 className="mt-1 break-all font-mono text-lg font-semibold text-brand-900">{card.uid}</h2>
              </div>
            </div>
            <RfidStatusBadge status={card.status} />
          </div>

          <dl className="mt-5 divide-y divide-brand-50">
            <Row label="Status">{card.active ? 'Active' : 'Inactive'}</Row>
            <Row label="Assigned Student">
              {card.student ? (
                <>
                  <span className="font-medium">{studentLabel(card.student)}</span>
                  {!card.student.active && <span className="ml-1 text-xs text-brand-500">· inactive student</span>}
                </>
              ) : 'Not assigned'}
            </Row>
            {card.studentId && <Row label="Assigned At">{formatTime(card.assignedAt)}</Row>}
            {card.previousStudent && <Row label="Previous Student">{studentLabel(card.previousStudent)}</Row>}
            {card.unassignedAt && <Row label="Last Unassigned">{formatTime(card.unassignedAt)}</Row>}
            <Row label="Registered">{formatTime(card.createdAt)}</Row>
          </dl>

          {canManage && (
            <div className="mt-6 border-t border-brand-100 pt-5">
              {actionError && <Alert tone="error" className="mb-3">{actionError}</Alert>}

              {(action === 'assign' || action === 'reassign') && (
                <div className="space-y-4 rounded-2xl border border-brand-100 bg-canvas p-4">
                  <h3 className="text-base font-semibold text-brand-900">{action === 'reassign' ? 'Reassign card' : 'Assign card to a student'}</h3>
                  {action === 'reassign' && (
                    <p className="text-sm text-brand-700">
                      Current student: <strong>{studentLabel(card.student)}</strong>
                    </p>
                  )}
                  <StudentPicker value={selected} onChange={setSelected} excludeStudentId={card.studentId} />
                  {selected && (
                    <p className="rounded-xl bg-white px-3 py-2 text-sm text-brand-900 ring-1 ring-brand-100">
                      {action === 'reassign' ? 'Reassign to' : 'Assign to'}:{' '}
                      <strong>{selected.studentId} – {selected.firstName} {selected.lastName}</strong>
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {cancelButton}
                    <button
                      type="button"
                      disabled={!selected || busy}
                      onClick={() => run(action, { studentId: selected.studentId }, action === 'reassign' ? 'RFID card reassigned.' : 'RFID card assigned.')}
                      className={buttonClass()}
                    >
                      {busy ? 'Saving…' : action === 'reassign' ? 'Confirm Reassign' : 'Confirm Assign'}
                    </button>
                  </div>
                </div>
              )}

              {action === 'unassign' && (
                <InlineConfirm
                  tone="brand"
                  message={<>Unassign this card from <strong>{studentLabel(card.student)}</strong>? The card record is kept.</>}
                  confirmLabel="Unassign"
                  busyLabel="Unassigning…"
                  busy={busy}
                  onConfirm={() => run('unassign', undefined, 'RFID card unassigned.')}
                  onCancel={() => setAction(null)}
                />
              )}

              {action === 'deactivate' && (
                <InlineConfirm
                  message={(
                    <>
                      Deactivate this card? It will not work for attendance.
                      {card.student && <> It will also be unassigned from <strong>{studentLabel(card.student)}</strong>.</>}
                    </>
                  )}
                  confirmLabel="Deactivate"
                  busyLabel="Deactivating…"
                  busy={busy}
                  onConfirm={() => run('deactivate', undefined, 'RFID card deactivated.')}
                  onCancel={() => setAction(null)}
                />
              )}

              {!action && (
                <div className="flex flex-wrap gap-2">
                  {card.status === 'unassigned' && (
                    <button type="button" onClick={() => startAction('assign')} className={buttonClass()}>
                      Assign Student
                    </button>
                  )}
                  {card.status === 'assigned' && (
                    <>
                      <button type="button" onClick={() => startAction('reassign')} className={buttonClass()}>
                        Reassign
                      </button>
                      <button type="button" onClick={() => startAction('unassign')} className={buttonClass({ variant: 'secondary' })}>
                        Unassign
                      </button>
                    </>
                  )}
                  {card.active ? (
                    <button type="button" onClick={() => startAction('deactivate')} className={buttonClass({ variant: 'danger' })}>
                      Deactivate
                    </button>
                  ) : (
                    <button type="button" disabled={busy} onClick={() => run('reactivate', undefined, 'RFID card reactivated.')} className={buttonClass({ variant: 'secondary' })}>
                      {busy ? 'Reactivating…' : 'Reactivate'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
