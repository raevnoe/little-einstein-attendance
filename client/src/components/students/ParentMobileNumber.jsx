import { useState } from 'react';
import { apiRequest } from '../../lib/apiClient.js';
import { OFFLINE_MESSAGE, parentSmsContact } from '../../lib/format.js';
import { buttonClass, inputClass } from '../ui/classes.js';
import { PhoneIcon } from '../ui/icons.jsx';

/**
 * A linked parent's mobile number for attendance SMS. Admins (`canManage`) can set or
 * remove it; the server validates and stores it as +639XXXXXXXXX on the parent account.
 */
export default function ParentMobileNumber({ parent, canManage, onSaved }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(parent.mobileNumber ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function save(mobileNumber) {
    if (!navigator.onLine) {
      setError(OFFLINE_MESSAGE);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await apiRequest(`/admin/users/${encodeURIComponent(parent.uid)}/mobile-number`, { method: 'PATCH', body: { mobileNumber } });
      setEditing(false);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    const sms = parentSmsContact(parent);
    return (
      <span className="mt-1 flex flex-wrap items-center gap-2 text-brand-700">
        <PhoneIcon className="h-4 w-4 text-brand-500" />
        <span>
          SMS: {sms.kind === 'number' ? <span className="font-mono">{sms.text}</span> : <span className={sms.kind === 'none' ? 'font-medium text-amber-800' : ''}>{sms.text}</span>}
        </span>
        {canManage && (
          <button type="button" onClick={() => setEditing(true)} className={buttonClass({ variant: 'quiet', size: 'sm', className: 'min-h-9 px-2' })}>
            {parent.mobileNumber ? 'Change' : 'Add'}
          </button>
        )}
      </span>
    );
  }

  return (
    <form
      className="mt-2 flex flex-wrap items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        save(value.trim() || null);
      }}
    >
      <label htmlFor={`mobile-${parent.uid}`} className="sr-only">Mobile number for {parent.displayName}</label>
      <input
        id={`mobile-${parent.uid}`}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={saving}
        inputMode="tel"
        placeholder="0917 123 4567"
        className={inputClass({ className: 'mt-0 w-44 font-mono text-sm' })}
      />
      <button type="submit" disabled={saving} className={buttonClass({ size: 'sm' })}>
        {saving ? 'Saving…' : 'Save'}
      </button>
      {parent.mobileNumber && (
        <button type="button" onClick={() => save(null)} disabled={saving} className={buttonClass({ variant: 'danger', size: 'sm' })}>
          Remove
        </button>
      )}
      <button type="button" onClick={() => { setEditing(false); setError(null); setValue(parent.mobileNumber ?? ''); }} disabled={saving} className={buttonClass({ variant: 'quiet', size: 'sm' })}>
        Cancel
      </button>
      {error && <p role="alert" className="w-full text-sm font-medium text-red-700">{error}</p>}
    </form>
  );
}
