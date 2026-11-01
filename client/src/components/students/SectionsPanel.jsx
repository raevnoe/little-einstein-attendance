import { useState } from 'react';
import { formatTimeOfDay } from '@led/shared';
import { apiRequest } from '../../lib/apiClient.js';
import { useApiData } from '../../lib/useApiData.js';
import { Alert, Badge, Card, InlineConfirm, LoadingState, buttonClass, inputClass, LABEL } from '../ui/index.js';
import { ChevronIcon, PlusIcon } from '../ui/icons.jsx';

/**
 * Admin-only: the kindergarten sections that student records and teacher assignments use
 * (GET/POST/DELETE /api/admin/sections). A section still used by a student or teacher cannot be
 * removed (the server refuses it). Collapsed by default under the student list's toolbar.
 * Each section may have its own class start time for late arrivals (PATCH /api/admin/sections/:name);
 * without one it uses the school default from Settings -> School settings.
 */
export default function SectionsPanel() {
  const [open, setOpen] = useState(false);
  const { loading, data, error, reload } = useApiData('/admin/sections');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(null); // null | 'add' | <section name being removed>
  const [confirming, setConfirming] = useState(null);
  const [message, setMessage] = useState(null);

  async function run(action, label) {
    setBusy(label);
    setMessage(null);
    try {
      await action();
      reload();
      return true;
    } catch (err) {
      setMessage({ error: true, text: err.details?.fields?.name ?? err.message });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function add(sectionName) {
    const ok = await run(() => apiRequest('/admin/sections', { method: 'POST', body: { name: sectionName } }), 'add');
    if (ok) {
      setName('');
      setMessage({ error: false, text: `Section "${sectionName.trim()}" added.` });
    }
  }

  async function remove(sectionName) {
    const ok = await run(() => apiRequest(`/admin/sections/${encodeURIComponent(sectionName)}`, { method: 'DELETE' }), sectionName);
    setConfirming(null);
    if (ok) setMessage({ error: false, text: `Section "${sectionName}" removed.` });
  }

  const sections = data?.sections ?? [];
  return (
    <Card padded={false}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="sections-panel"
        className="flex w-full items-center justify-between gap-3 p-4 text-left sm:p-5"
      >
        <span>
          <span className="block text-base font-semibold text-brand-900">Sections</span>
          <span className="block text-sm text-brand-500">
            {loading ? 'Loading…' : `${sections.length} section${sections.length === 1 ? '' : 's'} · used by student records and teacher assignments`}
          </span>
        </span>
        <ChevronIcon className={`h-5 w-5 shrink-0 text-brand-500 motion-safe:transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      <div id="sections-panel" hidden={!open} className="border-t border-brand-100 p-4 sm:p-5">
        {loading && <LoadingState>Loading sections…</LoadingState>}
        {error && <Alert tone="error">{error}</Alert>}
        {message && <Alert tone={message.error ? 'error' : 'success'} className="mb-4">{message.text}</Alert>}

        {data && (
          <>
            {sections.length === 0 ? (
              <p className="text-sm text-brand-700">No sections yet. Add the school's sections below (e.g. Kinder A).</p>
            ) : (
              <ul className="divide-y divide-brand-50 rounded-xl ring-1 ring-brand-100">
                {sections.map((s) => (
                  <li key={s.name} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-brand-900">{s.name}</p>
                      <p className="text-sm text-brand-500">
                        {s.activeStudents} active student{s.activeStudents === 1 ? '' : 's'} · {s.teachers} teacher{s.teachers === 1 ? '' : 's'}
                      </p>
                      <SectionHours
                        section={s}
                        disabled={busy !== null}
                        onSave={(hours) => run(
                          () => apiRequest(`/admin/sections/${encodeURIComponent(s.name)}`, { method: 'PATCH', body: hours }),
                          s.name,
                        ).then((ok) => {
                          if (ok) setMessage({ error: false, text: `${s.name} class hours: ${hoursText(hours)}.` });
                          return ok;
                        })}
                      />
                    </div>
                    {confirming === s.name ? (
                      <InlineConfirm
                        message={`Remove "${s.name}"? Only possible while no student or teacher uses it.`}
                        confirmLabel="Remove section"
                        busyLabel="Removing…"
                        busy={busy === s.name}
                        onConfirm={() => remove(s.name)}
                        onCancel={() => setConfirming(null)}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirming(s.name)}
                        disabled={s.students > 0 || s.teachers > 0 || busy !== null}
                        title={s.students > 0 || s.teachers > 0 ? 'Move its students and teachers to another section first' : undefined}
                        className={buttonClass({ variant: 'danger', size: 'sm' })}
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {data.unlisted?.length > 0 && (
              <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 ring-1 ring-amber-200">
                <p className="font-semibold">Students use sections that are not on the list:</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {data.unlisted.map((n) => (
                    <button key={n} type="button" onClick={() => add(n)} disabled={busy !== null} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                      <PlusIcon className="h-4 w-4" />
                      Add "{n}"
                    </button>
                  ))}
                </div>
              </div>
            )}

            <form
              className="mt-4 flex flex-wrap items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (name.trim()) add(name);
              }}
            >
              <div className="min-w-48 flex-1">
                <label htmlFor="new-section" className={LABEL}>New section</label>
                <input id="new-section" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Kinder A" className={inputClass()} />
              </div>
              <button type="submit" disabled={busy !== null || !name.trim()} className={buttonClass()}>
                <PlusIcon className="h-4 w-4" />
                {busy === 'add' ? 'Adding…' : 'Add section'}
              </button>
            </form>
            <p className="mt-2 text-xs text-brand-500">
              <Badge tone="neutral">Tip</Badge> Assign sections to teachers under Accounts. Teachers see only their sections' students.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

const timeOrDefault = (time) => (time ? formatTimeOfDay(time) : 'school default');
const hoursText = ({ startTime, endTime }) => `${timeOrDefault(startTime)} – ${timeOrDefault(endTime)}`;

/**
 * "Class hours: 8:00 AM – 11:30 AM" for one section, with an inline editor. An empty time uses the
 * school default (Settings -> School settings). The server checks that classes end after they start.
 */
function SectionHours({ section, disabled, onSave }) {
  const [editing, setEditing] = useState(false);
  const [start, setStart] = useState(section.startTime ?? '');
  const [end, setEnd] = useState(section.endTime ?? '');
  const id = `hours-${section.name}`;
  const save = async (hours) => {
    if (await onSave(hours)) setEditing(false);
  };

  if (!editing) {
    return (
      <p className="mt-1 text-sm text-brand-700">
        Class hours: <strong>{hoursText(section)}</strong>
        <button type="button" disabled={disabled} onClick={() => setEditing(true)} className="ml-2 font-semibold text-brand-600 underline-offset-2 hover:underline dark:text-brand-300">
          Change
        </button>
      </p>
    );
  }
  return (
    <div className="mt-2 flex flex-wrap items-end gap-2">
      <div>
        <label htmlFor={`${id}-start`} className={LABEL}>Classes start</label>
        <input id={`${id}-start`} type="time" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass({ className: 'w-auto min-h-10' })} />
      </div>
      <div>
        <label htmlFor={`${id}-end`} className={LABEL}>Classes end</label>
        <input id={`${id}-end`} type="time" value={end} onChange={(e) => setEnd(e.target.value)} className={inputClass({ className: 'w-auto min-h-10' })} />
      </div>
      <button type="button" disabled={disabled} onClick={() => save({ startTime: start || null, endTime: end || null })} className={buttonClass({ size: 'sm' })}>Save</button>
      {(section.startTime || section.endTime) && (
        <button type="button" disabled={disabled} onClick={() => save({ startTime: null, endTime: null })} className={buttonClass({ variant: 'secondary', size: 'sm' })}>Use school default</button>
      )}
      <button type="button" disabled={disabled} onClick={() => setEditing(false)} className={buttonClass({ variant: 'quiet', size: 'sm' })}>Cancel</button>
      <p className="w-full text-xs text-brand-500">Leave a time empty to use the school default.</p>
    </div>
  );
}
