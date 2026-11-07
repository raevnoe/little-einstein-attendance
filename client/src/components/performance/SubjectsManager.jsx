import { useState } from 'react';
import { SUBJECT_LABEL_MAX_LENGTH } from '@led/shared';
import { apiRequest } from '../../lib/apiClient.js';
import { setSubjects, useSubjects } from '../../lib/useSubjects.js';
import { Alert, Badge, Button, Card, CardHeader, Field } from '../ui/index.js';
import { buttonClass, inputClass } from '../ui/classes.js';
import { ChevronIcon, StarIcon } from '../ui/icons.jsx';

/**
 * Subjects (admin): the subjects teachers rate behavior in. Add, rename, hide/show and reorder.
 * Nothing is deleted: a hidden subject keeps its past evaluations (still shown in records and
 * reports) but cannot get new ones. Every change is saved right away and recorded in the Audit Log.
 */
export default function SubjectsManager() {
  const { subjects } = useSubjects();
  const [newLabel, setNewLabel] = useState('');
  const [editing, setEditing] = useState(null); // { key, label }
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState(null);

  async function change(busyKey, request, success) {
    setBusy(busyKey);
    setMessage(null);
    try {
      const result = await request();
      setSubjects(result.subjects);
      if (success) setMessage({ tone: 'success', text: success });
      return true;
    } catch (err) {
      setMessage({ tone: 'error', text: err.details?.fields?.label ?? err.message });
      return false;
    } finally {
      setBusy(null);
    }
  }

  const patch = (key, body) => apiRequest(`/admin/subjects/${encodeURIComponent(key)}`, { method: 'PATCH', body });

  async function add(event) {
    event.preventDefault();
    const label = newLabel.trim();
    if (!label) return;
    if (await change('add', () => apiRequest('/admin/subjects', { method: 'POST', body: { label } }), `${label} added.`)) setNewLabel('');
  }

  async function rename(event) {
    event.preventDefault();
    const { key, label } = editing;
    if (await change(key, () => patch(key, { label }), 'Subject renamed.')) setEditing(null);
  }

  const visibleCount = subjects.filter((s) => !s.hidden).length;

  return (
    <Card as="section" aria-labelledby="subjects-title">
      <CardHeader
        titleId="subjects-title"
        title="Subjects"
        subtitle="Teachers rate the child's behavior in each subject. A hidden subject keeps its past evaluations but cannot get new ones."
        icon={<StarIcon className="h-5 w-5" />}
      />
      <ol className="mt-5 divide-y divide-brand-50 rounded-xl ring-1 ring-brand-100">
        {subjects.map((s, i) => (
          <li key={s.key} className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:px-4">
            {editing?.key === s.key ? (
              <form onSubmit={rename} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                <label htmlFor={`subject-rename-${s.key}`} className="sr-only">New name for {s.label}</label>
                <input
                  id={`subject-rename-${s.key}`}
                  value={editing.label}
                  maxLength={SUBJECT_LABEL_MAX_LENGTH}
                  onChange={(e) => setEditing({ key: s.key, label: e.target.value })}
                  className={inputClass({ className: 'min-w-40 flex-1' })}
                  autoFocus
                />
                <Button type="submit" size="sm" busy={busy === s.key} busyLabel="Saving…" disabled={!editing.label.trim()}>Save</Button>
                <Button type="button" size="sm" variant="quiet" onClick={() => setEditing(null)}>Cancel</Button>
              </form>
            ) : (
              <>
                <span className={`min-w-0 flex-1 break-words text-sm font-semibold ${s.hidden ? 'text-brand-500' : 'text-brand-900'}`}>
                  {s.label}
                  {s.hidden && <Badge className="ml-2">Hidden</Badge>}
                </span>
                <div className="flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={() => change(s.key, () => patch(s.key, { move: 'up' }))}
                    disabled={i === 0 || busy !== null}
                    aria-label={`Move ${s.label} up`}
                    className={buttonClass({ variant: 'quiet', size: 'icon', className: 'disabled:opacity-30' })}
                  >
                    <ChevronIcon className="h-5 w-5 rotate-180" />
                  </button>
                  <button
                    type="button"
                    onClick={() => change(s.key, () => patch(s.key, { move: 'down' }))}
                    disabled={i === subjects.length - 1 || busy !== null}
                    aria-label={`Move ${s.label} down`}
                    className={buttonClass({ variant: 'quiet', size: 'icon', className: 'disabled:opacity-30' })}
                  >
                    <ChevronIcon className="h-5 w-5" />
                  </button>
                  <Button size="sm" variant="quiet" disabled={busy !== null} onClick={() => setEditing({ key: s.key, label: s.label })}>Rename</Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    busy={busy === s.key}
                    busyLabel="Saving…"
                    // At least one subject must stay visible (the server checks this too).
                    disabled={busy !== null || (!s.hidden && visibleCount <= 1)}
                    onClick={() => change(s.key, () => patch(s.key, { hidden: !s.hidden }), s.hidden ? `${s.label} is shown again.` : `${s.label} is hidden.`)}
                  >
                    {s.hidden ? 'Show' : 'Hide'}
                  </Button>
                </div>
              </>
            )}
          </li>
        ))}
      </ol>
      <form onSubmit={add} className="mt-4 flex flex-wrap items-end gap-2">
        <Field id="subject-new" label="Add a subject" className="min-w-48 flex-1">
          <input
            value={newLabel}
            maxLength={SUBJECT_LABEL_MAX_LENGTH}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="e.g. Filipino"
            className={inputClass()}
          />
        </Field>
        <Button type="submit" variant="secondary" busy={busy === 'add'} busyLabel="Adding…" disabled={!newLabel.trim() || busy !== null}>Add subject</Button>
      </form>
      {message && <Alert tone={message.tone} className="mt-4">{message.text}</Alert>}
    </Card>
  );
}
