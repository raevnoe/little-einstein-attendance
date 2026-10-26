import { useState } from 'react';
import { SCHOOL_SETTINGS } from '@led/shared';
import { apiRequest } from '../../lib/apiClient.js';
import { useApiData } from '../../lib/useApiData.js';
import { ErrorMessage } from '../Panel.jsx';
import { Alert, Button, Card, CardHeader, Field, LoadingState } from '../ui/index.js';
import { inputClass } from '../ui/classes.js';
import { SettingsIcon } from '../ui/icons.jsx';

const GROUPS = [
  { key: 'attendance', title: 'RFID attendance' },
  { key: 'dismissal', title: 'Dismissal codes' },
  { key: 'sms', title: 'Arrival and departure SMS' },
];

// Form values are strings for number fields (what the input holds) and booleans for switches.
const toForm = (settings) => Object.fromEntries(Object.entries(settings).map(([group, values]) => [
  group, Object.fromEntries(Object.entries(values).map(([key, value]) => [key, typeof value === 'number' ? String(value) : value])),
]));

/** Only the fields that differ from what the server sent: { group: { key: value } }. */
function changesOf(form, saved) {
  const patch = {};
  for (const [group, fields] of Object.entries(SCHOOL_SETTINGS)) {
    for (const [key, spec] of Object.entries(fields)) {
      const value = spec.type === 'integer' ? Number(form[group][key]) : form[group][key];
      if (spec.type === 'integer' && (form[group][key].trim() === '' || !Number.isInteger(value))) {
        patch[group] = { ...patch[group], [key]: form[group][key] }; // the server explains what is wrong
      } else if (value !== saved[group][key]) {
        patch[group] = { ...patch[group], [key]: value };
      }
    }
  }
  return patch;
}

/** School Settings (admin): rules that apply to everyone. Every saved change is in the Audit Log. */
export default function SchoolSettingsForm() {
  const { loading, data, error, reload } = useApiData('/admin/settings');
  if (loading) return <Card><LoadingState /></Card>;
  if (error) return <Card><ErrorMessage message={error} onRetry={reload} /></Card>;
  return <SettingsEditor key={JSON.stringify(data.settings)} initial={data.settings} />;
}

function SettingsEditor({ initial }) {
  const [saved, setSaved] = useState(initial);
  const [form, setForm] = useState(() => toForm(initial));
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const patch = changesOf(form, saved);
  const dirty = Object.keys(patch).length > 0;
  const set = (group, key, value) => setForm((f) => ({ ...f, [group]: { ...f[group], [key]: value } }));

  async function save(event) {
    event.preventDefault();
    setMessage(null);
    setErrors({});
    setBusy(true);
    try {
      const res = await apiRequest('/admin/settings', { method: 'PATCH', body: patch });
      setSaved(res.settings);
      setForm(toForm(res.settings));
      setMessage({ tone: 'success', text: 'School settings saved. They apply within half a minute.' });
    } catch (err) {
      setErrors(err.details?.fields ?? {});
      setMessage({ tone: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card as="section" aria-labelledby="school-settings-title">
      <CardHeader
        titleId="school-settings-title"
        title="School settings"
        subtitle="Rules for everyone. Changes are recorded in the Audit Log."
        icon={<SettingsIcon className="h-5 w-5" />}
      />
      <form onSubmit={save} noValidate className="mt-5 space-y-6">
        {GROUPS.map(({ key: group, title }) => (
          <fieldset key={group} className="space-y-4 border-t border-brand-100 pt-4 first:border-t-0 first:pt-0">
            <legend className="sr-only">{title}</legend>
            <p aria-hidden="true" className="text-base font-semibold text-brand-900">{title}</p>
            {Object.entries(SCHOOL_SETTINGS[group]).map(([key, spec]) => {
              const id = `setting-${group}-${key}`;
              const error = errors[`${group}.${key}`];
              if (spec.type === 'boolean') {
                return (
                  <div key={key}>
                    <label htmlFor={id} className="flex cursor-pointer items-start gap-3">
                      <input
                        id={id}
                        type="checkbox"
                        checked={form[group][key]}
                        onChange={(e) => set(group, key, e.target.checked)}
                        aria-describedby={spec.hint ? `${id}-hint` : undefined}
                        className="mt-0.5 h-5 w-5 shrink-0 accent-brand-600"
                      />
                      <span className="text-sm font-semibold text-brand-900">{spec.label}</span>
                    </label>
                    {spec.hint && <p id={`${id}-hint`} className="ml-8 mt-1 text-sm text-brand-500">{spec.hint}</p>}
                    {error && <p className="ml-8 mt-1 text-sm font-medium text-red-700">{error}</p>}
                  </div>
                );
              }
              return (
                <Field
                  key={key}
                  id={id}
                  label={spec.label}
                  hint={[`${spec.min}-${spec.max} ${spec.unit}, default ${spec.default}.`, spec.hint].filter(Boolean).join(' ')}
                  error={error}
                >
                  <input
                    type="number"
                    inputMode="numeric"
                    min={spec.min}
                    max={spec.max}
                    step="1"
                    value={form[group][key]}
                    onChange={(e) => set(group, key, e.target.value)}
                    className={inputClass({ invalid: Boolean(error), className: 'sm:max-w-40' })}
                  />
                </Field>
              );
            })}
          </fieldset>
        ))}
        <div className="flex flex-wrap items-center gap-3 border-t border-brand-100 pt-4">
          <Button type="submit" busy={busy} busyLabel="Saving…" disabled={!dirty}>Save school settings</Button>
          {dirty && (
            <Button variant="secondary" disabled={busy} onClick={() => { setForm(toForm(saved)); setErrors({}); setMessage(null); }}>
              Undo changes
            </Button>
          )}
        </div>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
      </form>
    </Card>
  );
}
