import { useState } from 'react';
import { FETCHER_RELATIONSHIPS, MAX_FETCHER_NAME_LENGTH, MAX_FETCHER_RELATIONSHIP_LENGTH } from '@led/shared';
import { apiRequest } from '../../lib/apiClient.js';
import { OFFLINE_MESSAGE } from '../../lib/format.js';
import { Alert, Field, buttonClass, inputClass, FIELD_ERROR } from '../ui/index.js';

const OTHER = 'other';

/** Dropdown value for a stored relationship: a listed one, "other" (typed), or '' (not chosen yet). */
function choiceFor(relationship) {
  if (!relationship) return '';
  return FETCHER_RELATIONSHIPS.find((r) => r.toLowerCase() === relationship.toLowerCase()) ?? OTHER;
}

/**
 * Add or edit one of the parent's own Fetchers. `options` are the parent's own active
 * children; the server re-checks that every selected child belongs to this parent.
 */
export default function FetcherForm({ fetcher, options, onSaved, onCancel }) {
  const [fullName, setFullName] = useState(fetcher?.fullName ?? '');
  // Relationship: pick from the list, or "Other" and type it (e.g. "Nanay", "Tita").
  const [choice, setChoice] = useState(() => choiceFor(fetcher?.relationship));
  const [otherText, setOtherText] = useState(() => (choiceFor(fetcher?.relationship) === OTHER ? fetcher.relationship : ''));
  const relationship = choice === OTHER ? otherText : choice;
  const [studentIds, setStudentIds] = useState(
    fetcher?.studentIds ?? (options.length === 1 ? [options[0].studentId] : []),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const toggle = (id) => setStudentIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));

  async function submit(event) {
    event.preventDefault();
    if (!navigator.onLine) return setError(OFFLINE_MESSAGE);
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const body = { fullName, relationship, studentIds };
      await (fetcher
        ? apiRequest(`/parent/fetchers/${encodeURIComponent(fetcher.fetcherId)}`, { method: 'PATCH', body })
        : apiRequest('/parent/fetchers', { method: 'POST', body }));
      onSaved();
    } catch (err) {
      setError(err.message);
      setFieldErrors(err.details?.fields ?? {});
    } finally {
      setBusy(false);
    }
  }

  const prefix = fetcher ? `edit-${fetcher.fetcherId}` : 'new-fetcher';
  const childrenErrorId = `${prefix}-studentIds-error`;

  return (
    <form onSubmit={submit} className="rounded-2xl border-2 border-dashed border-grape-100 bg-grape-50/40 p-4 sm:p-5">
      <h3 className="font-script text-[1.75rem] leading-none text-grape-700">{fetcher ? `Edit ${fetcher.fullName}` : 'Add a Fetcher'}</h3>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <Field id={`${prefix}-name`} label="Full name" error={fieldErrors.fullName}>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={MAX_FETCHER_NAME_LENGTH}
            autoComplete="off"
            placeholder="e.g. Maria Santos"
            className={inputClass({ invalid: Boolean(fieldErrors.fullName) })}
          />
        </Field>
        <div>
          <Field id={`${prefix}-relationship`} label="Relationship to your child" error={choice === OTHER ? undefined : fieldErrors.relationship}>
            <select
              value={choice}
              onChange={(e) => setChoice(e.target.value)}
              className={inputClass({ invalid: Boolean(fieldErrors.relationship) && choice !== OTHER })}
            >
              <option value="" disabled>Choose a relationship</option>
              {FETCHER_RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}
              <option value={OTHER}>Other (type it)</option>
            </select>
          </Field>
          {choice === OTHER && (
            <Field id={`${prefix}-relationship-other`} label="Type the relationship" error={fieldErrors.relationship} className="mt-3">
              <input
                value={otherText}
                onChange={(e) => setOtherText(e.target.value)}
                maxLength={MAX_FETCHER_RELATIONSHIP_LENGTH}
                autoComplete="off"
                placeholder="e.g. Tita, Ninang, Stepfather"
                className={inputClass({ invalid: Boolean(fieldErrors.relationship) })}
              />
            </Field>
          )}
        </div>
      </div>
      <fieldset className="mt-4" aria-describedby={fieldErrors.studentIds ? childrenErrorId : undefined}>
        <legend className="text-sm font-semibold text-brand-900">May collect</legend>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {options.map((child) => (
            <label key={child.studentId} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-paper px-3 text-sm font-medium text-brand-900 ring-1 ring-brand-200 has-[:checked]:bg-leaf-50 has-[:checked]:ring-leaf-400 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-500">
              <input type="checkbox" checked={studentIds.includes(child.studentId)} onChange={() => toggle(child.studentId)} className="h-4 w-4 accent-brand-600" />
              {child.firstName} {child.lastName}
            </label>
          ))}
        </div>
        {fieldErrors.studentIds && <p id={childrenErrorId} className={FIELD_ERROR}>{fieldErrors.studentIds}</p>}
      </fieldset>
      {error && !Object.keys(fieldErrors).length && <Alert tone="error" role="alert" className="mt-4">{error}</Alert>}
      <div className="mt-5 flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className={buttonClass()}>{busy ? 'Saving…' : fetcher ? 'Save changes' : 'Add Fetcher'}</button>
        <button type="button" onClick={onCancel} disabled={busy} className={buttonClass({ variant: 'secondary' })}>Cancel</button>
      </div>
    </form>
  );
}
