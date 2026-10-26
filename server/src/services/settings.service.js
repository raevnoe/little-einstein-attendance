// School Settings (admin only): the values in systemSettings/{attendance,dismissal,sms}.
// Every change is validated against shared SCHOOL_SETTINGS and saved together with one audit entry
// per changed group, in one transaction.
import { SCHOOL_SETTINGS, isValidSettingValue } from '@led/shared';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin.js';
import { clearSettingsCache, readSchoolSettings, settingsRef } from '../models/systemSettings.model.js';
import { auditInTransaction } from './audit.service.js';
import { HttpError } from '../utils/httpError.js';

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function describe(spec) {
  return spec.type === 'boolean' ? 'Must be on or off.' : `Enter a whole number from ${spec.min} to ${spec.max}.`;
}

/** Checks a { group: { field: value } } patch. Unknown groups/fields -> 400; bad values -> 400 per field. */
export function validateSettingsPatch(body) {
  if (!isPlainObject(body)) throw new HttpError(400, 'validation/invalid-body', 'Send the settings to change.');
  const unknown = [];
  const fields = {};
  for (const [group, values] of Object.entries(body)) {
    const specs = SCHOOL_SETTINGS[group];
    if (!specs || !isPlainObject(values)) { unknown.push(group); continue; }
    for (const [key, value] of Object.entries(values)) {
      const spec = specs[key];
      if (!spec) unknown.push(`${group}.${key}`);
      else if (!isValidSettingValue(spec, value)) fields[`${group}.${key}`] = describe(spec);
    }
  }
  if (unknown.length) throw new HttpError(400, 'validation/unknown-fields', `Unknown settings: ${unknown.join(', ')}.`);
  if (Object.keys(fields).length) {
    throw new HttpError(400, 'validation/invalid-settings', 'Some settings are not valid.', { fields });
  }
  return body;
}

export async function getSchoolSettings() {
  return { settings: await readSchoolSettings() };
}

/** Saves the fields that differ from the current values. Nothing changed -> nothing written. */
export async function updateSchoolSettings(ctx, body) {
  const patch = validateSettingsPatch(body);
  await db.runTransaction(async (tx) => {
    const current = await readSchoolSettings(tx);
    for (const [group, values] of Object.entries(patch)) {
      const changed = Object.entries(values).filter(([key, value]) => current[group][key] !== value);
      if (!changed.length) continue;
      tx.set(settingsRef(group), { ...Object.fromEntries(changed), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      auditInTransaction(tx, {
        ...ctx,
        eventType: 'settings.changed',
        target: { type: 'settings', id: group },
        details: { group, changes: changed.map(([key, value]) => `${key}: ${current[group][key]} -> ${value}`) },
      });
    }
  });
  clearSettingsCache();
  return getSchoolSettings();
}
