import { cloneElement, useEffect, useState } from 'react';
import { GENDERS } from '@led/shared';
import { apiRequest } from '../../lib/apiClient.js';
import { Alert, Card, Field as UiField, LoadingState, buttonClass, inputClass } from '../ui/index.js';

const EMPTY = { studentId: '', firstName: '', middleName: '', lastName: '', dateOfBirth: '', gender: '', section: '', parentIds: [] };

/** The shared Field, with the hint hidden while the field shows an error (as before). */
function Field({ id, label, error, hint, children }) {
  return (
    <UiField id={id} label={label} error={error} hint={error ? undefined : hint}>
      {cloneElement(children, { className: inputClass({ invalid: Boolean(error), className: children.props.className }) })}
    </UiField>
  );
}

/** Admin-only create/edit form. The server validates everything; this form shows its errors. */
export default function StudentForm({ student, onSaved, onCancel }) {
  const isEdit = Boolean(student);
  const [values, setValues] = useState(() => (isEdit ? { ...EMPTY, ...student } : EMPTY));
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [parents, setParents] = useState({ loading: true, list: [], error: null });
  // The admin-managed section list (Students -> Sections); the server accepts only these names.
  const [sections, setSections] = useState({ loading: true, names: [], error: null });

  useEffect(() => {
    apiRequest('/admin/parents')
      .then((data) => setParents({ loading: false, list: data.parents, error: null }))
      .catch((error) => setParents({ loading: false, list: [], error: error.message }));
    apiRequest('/admin/sections')
      .then((data) => setSections({ loading: false, names: data.sections.map((x) => x.name), error: null }))
      .catch((error) => setSections({ loading: false, names: [], error: error.message }));
  }, []);

  const set = (field) => (event) => setValues((v) => ({ ...v, [field]: event.target.value }));

  function toggleParent(uid) {
    setValues((v) => ({
      ...v,
      parentIds: v.parentIds.includes(uid) ? v.parentIds.filter((id) => id !== uid) : [...v.parentIds, uid],
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setFieldErrors({});
    setFormError(null);

    const { studentId, firstName, middleName, lastName, dateOfBirth, gender, section, parentIds } = values;
    const body = { firstName, middleName, lastName, dateOfBirth, gender, section, parentIds };

    try {
      const data = isEdit
        ? await apiRequest(`/students/${encodeURIComponent(student.studentId)}`, { method: 'PATCH', body })
        : await apiRequest('/students', { method: 'POST', body: { studentId, ...body } });
      onSaved(data.student, isEdit ? 'Student updated.' : 'Student added.');
    } catch (error) {
      setFieldErrors(error.details?.fields ?? {});
      setFormError(error.message);
      setSaving(false);
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  // A student may still carry an older section that is not on the list: keep it selectable.
  const sameSection = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const unlistedCurrent = isEdit && student.section && !sections.names.some((n) => sameSection(n, student.section)) ? student.section : null;
  const sectionHint = sections.error
    ? 'The section list could not be loaded.'
    : !sections.loading && sections.names.length === 0
      ? 'No sections yet. Add them under Students → Sections.'
      : 'Sections are managed under Students → Sections.';
  // Deactivated parents are hidden, except ones already linked to this student (so the link can be seen and removed).
  const shownParents = parents.list.filter((p) => p.active || student?.parentIds?.includes(p.uid));

  return (
    <form onSubmit={handleSubmit} noValidate>
      <Card>
        <h2 className="text-xl font-bold text-brand-900">{isEdit ? 'Edit Student' : 'Add Student'}</h2>
        <p className="mt-1 text-sm text-brand-500">Fields are checked by the server when you save.</p>

        <fieldset disabled={saving} className="mt-6 space-y-8">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-brand-500">Student details</h3>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <Field
                id="studentId"
                label="Student ID"
                error={fieldErrors.studentId}
                hint={isEdit ? 'Student ID cannot be changed.' : 'School ID, e.g. K2026-001 (not the RFID card number).'}
              >
                <input value={values.studentId} onChange={set('studentId')} disabled={isEdit} className="font-mono uppercase" />
              </Field>
              <Field id="section" label="Section" error={fieldErrors.section} hint={sectionHint}>
                <select value={values.section} onChange={set('section')} disabled={sections.loading}>
                  <option value="">{sections.loading ? 'Loading sections…' : 'Choose a section'}</option>
                  {sections.names.map((name) => <option key={name} value={name}>{name}</option>)}
                  {unlistedCurrent && <option value={unlistedCurrent}>{unlistedCurrent} (not on the list)</option>}
                </select>
              </Field>
              <Field id="firstName" label="First Name" error={fieldErrors.firstName}>
                <input value={values.firstName} onChange={set('firstName')} />
              </Field>
              <Field id="middleName" label="Middle Name (optional)" error={fieldErrors.middleName}>
                <input value={values.middleName} onChange={set('middleName')} />
              </Field>
              <Field id="lastName" label="Last Name" error={fieldErrors.lastName}>
                <input value={values.lastName} onChange={set('lastName')} />
              </Field>
              <Field id="dateOfBirth" label="Date of Birth" error={fieldErrors.dateOfBirth}>
                <input type="date" max={today} value={values.dateOfBirth} onChange={set('dateOfBirth')} />
              </Field>
              <Field id="gender" label="Gender" error={fieldErrors.gender}>
                <select value={values.gender} onChange={set('gender')}>
                  <option value="">Select…</option>
                  {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <div>
            <h3 id="parent-accounts-label" className="text-sm font-semibold uppercase tracking-wide text-brand-500">Parent Accounts (optional)</h3>
            {parents.loading && <LoadingState className="mt-2">Loading parent accounts…</LoadingState>}
            {parents.error && <p className="mt-2 text-sm text-red-700">{parents.error}</p>}
            {!parents.loading && !parents.error && shownParents.length === 0 && (
              <p className="mt-2 text-sm text-brand-500">No active parent accounts yet. Add one in the Accounts section.</p>
            )}
            <div role="group" aria-labelledby="parent-accounts-label" className="mt-3 grid gap-2 sm:grid-cols-2">
              {shownParents.map((p) => {
                const checked = values.parentIds.includes(p.uid);
                return (
                  <label
                    key={p.uid}
                    className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-sm motion-safe:transition-colors ${
                      checked ? 'border-brand-500 bg-brand-50' : 'border-brand-100 hover:bg-canvas'
                    }`}
                  >
                    <input type="checkbox" checked={checked} onChange={() => toggleParent(p.uid)} className="h-4 w-4 accent-brand-600" />
                    <span className="min-w-0">
                      <span className="font-medium text-brand-900">{p.displayName}</span> <span className="break-all text-brand-500">({p.email})</span>
                      {!p.active && <span className="ml-1 text-xs text-brand-500">· inactive</span>}
                    </span>
                  </label>
                );
              })}
            </div>
            {fieldErrors.parentIds && <p className="mt-2 text-sm font-medium text-red-700">{fieldErrors.parentIds}</p>}
          </div>
        </fieldset>

        {formError && <Alert tone="error" className="mt-6">{formError}</Alert>}

        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-brand-100 pt-5">
          <button type="button" onClick={onCancel} disabled={saving} className={buttonClass({ variant: 'secondary' })}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={buttonClass()}>
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Student'}
          </button>
        </div>
      </Card>
    </form>
  );
}
