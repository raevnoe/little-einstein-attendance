import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/apiClient.js';
import { formatDate, studentFullName } from '../../lib/format.js';
import StatusBadge from '../StatusBadge.jsx';
import ParentMobileNumber from './ParentMobileNumber.jsx';
import { Alert, Badge, Card, InlineConfirm, LoadingState, buttonClass, FOCUS_RING } from '../ui/index.js';
import { ArrowLeftIcon, PencilIcon, RfidCardIcon, StudentsIcon, UserIcon } from '../ui/icons.jsx';

function Row({ label, children }) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm font-semibold text-brand-500">{label}</dt>
      <dd className="text-sm text-brand-900 sm:col-span-2">{children}</dd>
    </div>
  );
}

function SectionTitle({ icon: Icon, children }) {
  return (
    <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand-500">
      <Icon className="h-4 w-4" />
      {children}
    </h3>
  );
}

export default function StudentDetail({ studentId, canManage, notice, onBack, onEdit }) {
  const [state, setState] = useState({ loading: true, student: null, error: null });
  const [message, setMessage] = useState(notice);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState(null);

  const load = useCallback(() => {
    apiRequest(`/students/${encodeURIComponent(studentId)}`)
      .then((data) => setState({ loading: false, student: data.student, error: null }))
      .catch((error) => setState({ loading: false, student: null, error: error.message }));
  }, [studentId]);

  useEffect(load, [load]);

  async function changeStatus(action) {
    setBusy(true);
    setActionError(null);
    try {
      const data = await apiRequest(`/students/${encodeURIComponent(studentId)}/${action}`, { method: 'POST' });
      setState({ loading: false, student: data.student, error: null });
      setMessage(action === 'deactivate' ? 'Student deactivated.' : 'Student reactivated.');
      setConfirming(false);
    } catch (error) {
      setActionError(error.message);
    } finally {
      setBusy(false);
    }
  }

  const { student } = state;

  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 ${FOCUS_RING}`}>
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Students
      </button>

      {message && <Alert tone="success">{message}</Alert>}
      {state.loading && <LoadingState>Loading student…</LoadingState>}
      {state.error && <Alert tone="error">{state.error}</Alert>}

      {student && (
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-4">
              <span aria-hidden="true" className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-grape-50 text-lg font-bold text-grape-700">
                {`${student.firstName?.[0] ?? ''}${student.lastName?.[0] ?? ''}`.toUpperCase()}
              </span>
              <div className="min-w-0">
                <h2 className="text-xl font-bold text-brand-900">{studentFullName(student)}</h2>
                <p className="font-mono text-sm text-brand-500">{student.studentId}</p>
              </div>
            </div>
            <StatusBadge active={student.active} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <section>
              <SectionTitle icon={StudentsIcon}>Profile</SectionTitle>
              <dl className="mt-2 divide-y divide-brand-50">
                <Row label="Student ID"><span className="font-mono">{student.studentId}</span></Row>
                <Row label="Name">{studentFullName(student)}</Row>
                <Row label="Date of Birth">{formatDate(student.dateOfBirth)}</Row>
                <Row label="Gender">{student.gender}</Row>
                <Row label="Section">{student.section}</Row>
                <Row label="Status">{student.active ? 'Active' : 'Inactive'}</Row>
              </dl>
            </section>

            <div className="space-y-6">
              <section>
                <SectionTitle icon={RfidCardIcon}>RFID Card</SectionTitle>
                <dl className="mt-2">
                  <Row label="RFID Card">
                    {student.rfidCardUid ? (
                      <>
                        <Badge tone="success">Assigned</Badge>
                        <span className="mt-1 block break-all rounded-lg bg-canvas px-2 py-1 font-mono text-xs text-brand-700">
                          <span className="sr-only">UID: </span>{student.rfidCardUid}
                        </span>
                      </>
                    ) : (
                      <span className="text-brand-500">Not Assigned</span>
                    )}
                  </Row>
                </dl>
              </section>

              <section>
                <SectionTitle icon={UserIcon}>Parent Accounts</SectionTitle>
                {student.parents.length === 0 ? (
                  <p className="mt-2 text-sm text-brand-500">None linked</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {student.parents.map((p) => (
                      <li key={p.uid} className="rounded-xl border border-brand-100 px-3 py-2.5 text-sm text-brand-900">
                        <span className="font-semibold">{p.displayName}</span>
                        {p.email && <span className="text-brand-500"> ({p.email})</span>}
                        {!p.active && <span className="ml-1 text-xs text-brand-500">· inactive account</span>}
                        <ParentMobileNumber
                          // Keyed on the number so the editor resets after a save.
                          key={p.mobileNumber ?? 'none'}
                          parent={p}
                          canManage={canManage}
                          onSaved={() => { setMessage('Parent mobile number saved.'); load(); }}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>

          {canManage && (
            <div className="mt-6 border-t border-brand-100 pt-5">
              {actionError && <Alert tone="error" className="mb-3">{actionError}</Alert>}

              {confirming ? (
                <InlineConfirm
                  message={<>Deactivate <strong>{studentFullName(student)}</strong>? The record is kept and can be reactivated later.</>}
                  confirmLabel="Deactivate"
                  busyLabel="Deactivating…"
                  busy={busy}
                  onConfirm={() => changeStatus('deactivate')}
                  onCancel={() => setConfirming(false)}
                />
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onEdit(student)} className={buttonClass()}>
                    <PencilIcon className="h-4 w-4" />
                    Edit
                  </button>
                  {student.active ? (
                    <button type="button" onClick={() => { setMessage(null); setConfirming(true); }} className={buttonClass({ variant: 'danger' })}>
                      Deactivate
                    </button>
                  ) : (
                    <button type="button" onClick={() => changeStatus('reactivate')} disabled={busy} className={buttonClass({ variant: 'secondary' })}>
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
