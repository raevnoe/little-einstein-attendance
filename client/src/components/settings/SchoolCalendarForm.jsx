import { useState } from 'react';
import { CLASS_WEEKDAYS, NO_CLASS_REASON_MAX_LENGTH, weekdayOf } from '@led/shared';
import { apiRequest } from '../../lib/apiClient.js';
import { useApiData } from '../../lib/useApiData.js';
import { formatDate } from '../../lib/format.js';
import { ErrorMessage } from '../Panel.jsx';
import { Alert, Button, Card, CardHeader, Field, LoadingState } from '../ui/index.js';
import { inputClass } from '../ui/classes.js';
import { CalendarIcon, CloseIcon } from '../ui/icons.jsx';

/**
 * School calendar (admin): which days count for Absent. Classes are Monday to Friday; the admin sets
 * the first day of the school year, adds no-class dates (holidays, suspensions) and extra class days
 * (a Saturday or Sunday with class). Saved as a whole.
 */
export default function SchoolCalendarForm() {
  const { loading, data, error, reload } = useApiData('/admin/calendar');
  if (loading) return <Card><LoadingState /></Card>;
  if (error) return <Card><ErrorMessage message={error} onRetry={reload} /></Card>;
  return <CalendarEditor key={JSON.stringify(data.calendar)} initial={data.calendar} />;
}

function CalendarEditor({ initial }) {
  const [start, setStart] = useState(initial.schoolYearStart ?? '');
  const [dates, setDates] = useState(initial.noClassDates);
  const [extraDates, setExtraDates] = useState(initial.extraClassDates);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const dirty = (start || null) !== initial.schoolYearStart
    || JSON.stringify(dates) !== JSON.stringify(initial.noClassDates)
    || JSON.stringify(extraDates) !== JSON.stringify(initial.extraClassDates);

  const showError = (text) => setMessage(text ? { tone: 'error', text } : null);
  const isWeekday = (date) => CLASS_WEEKDAYS.includes(weekdayOf(date));

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await apiRequest('/admin/calendar', { method: 'PUT', body: { schoolYearStart: start || null, noClassDates: dates, extraClassDates: extraDates } });
      setMessage({ tone: 'success', text: 'School calendar saved. Absences now follow it.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card as="section" aria-labelledby="calendar-title">
      <CardHeader
        titleId="calendar-title"
        title="School calendar"
        subtitle="Classes are Monday to Friday. A child with no arrival on a class day is marked absent after the class end time."
        icon={<CalendarIcon className="h-5 w-5" />}
      />
      <div className="mt-5 space-y-5">
        <Field id="calendar-start" label="First day of the school year" hint="Days before it are never counted as absent." optional>
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className={inputClass({ className: 'sm:max-w-56' })} />
        </Field>

        <DateList
          id="calendar-no-class"
          title="No-class dates"
          hint="Holidays, suspensions and other days without class."
          placeholder="e.g. Christmas break"
          addLabel="Add date"
          dates={dates}
          onChange={setDates}
          onError={showError}
          problem={(date) => (extraDates.some((d) => d.date === date) ? `${formatDate(date)} is an extra class day.` : null)}
        />
        <DateList
          id="calendar-extra"
          title="Extra class days"
          hint="A Saturday or Sunday with class, such as a make-up class. It counts like any class day: a child who does not arrive is marked absent."
          placeholder="e.g. Make-up class"
          addLabel="Add class day"
          dates={extraDates}
          onChange={setExtraDates}
          onError={showError}
          problem={(date) => {
            if (isWeekday(date)) return `${formatDate(date)} is already a class day. Pick a Saturday or Sunday.`;
            return dates.some((d) => d.date === date) ? `${formatDate(date)} is a no-class date.` : null;
          }}
        />

        <div className="flex flex-wrap items-center gap-3 border-t border-brand-100 pt-4">
          <Button busy={busy} busyLabel="Saving…" disabled={!dirty} onClick={save}>Save school calendar</Button>
          {dirty && <span className="text-sm text-brand-500">Unsaved changes</span>}
        </div>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
      </div>
    </Card>
  );
}

/** A list of dates with optional reasons, and the small form that adds to it. */
function DateList({ id, title, hint, placeholder, addLabel, dates, onChange, onError, problem }) {
  const [newDate, setNewDate] = useState('');
  const [newReason, setNewReason] = useState('');

  function addDate(event) {
    event.preventDefault();
    if (!newDate) return;
    const refused = dates.some((d) => d.date === newDate) ? `${formatDate(newDate)} is already on the list.` : problem(newDate);
    if (refused) {
      onError(refused);
      return;
    }
    onChange([...dates, { date: newDate, reason: newReason.trim() }].sort((a, b) => a.date.localeCompare(b.date)));
    setNewDate('');
    setNewReason('');
    onError(null);
  }

  return (
    <div className="border-t border-brand-100 pt-4">
      <p className="text-sm font-semibold text-brand-900">{title}</p>
      <p className="text-sm text-brand-500">{hint}</p>
      {dates.length === 0 ? (
        <p className="mt-3 text-sm text-brand-700">None yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-brand-50 rounded-xl ring-1 ring-brand-100">
          {dates.map((d) => (
            <li key={d.date} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <span className="text-sm text-brand-900">
                <strong>{formatDate(d.date)}</strong>
                {d.reason && <span className="text-brand-700"> · {d.reason}</span>}
              </span>
              <button
                type="button"
                onClick={() => onChange(dates.filter((x) => x.date !== d.date))}
                aria-label={`Remove ${formatDate(d.date)}`}
                className="rounded-lg p-1.5 text-brand-500 hover:bg-red-50 hover:text-red-700"
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={addDate} className="mt-3 flex flex-wrap items-end gap-2">
        <Field id={`${id}-date`} label="Date">
          <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className={inputClass({ className: 'w-auto' })} />
        </Field>
        <Field id={`${id}-reason`} label="Reason" optional className="min-w-48 flex-1">
          <input value={newReason} maxLength={NO_CLASS_REASON_MAX_LENGTH} onChange={(e) => setNewReason(e.target.value)} placeholder={placeholder} className={inputClass()} />
        </Field>
        <Button type="submit" variant="secondary" disabled={!newDate}>{addLabel}</Button>
      </form>
    </div>
  );
}
