// School calendar (admin only): the school-year start and the no-class dates that keep weekends,
// holidays and suspensions from counting as Absent. Saved with one audit entry, in one transaction.
import { MAX_NO_CLASS_DATES, NO_CLASS_REASON_MAX_LENGTH, hasLetters } from '@led/shared';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin.js';
import { calendarRef, clearCalendarCache, getCalendar, parseCalendar } from '../models/calendar.model.js';
import { auditInTransaction } from './audit.service.js';
import { isValidSchoolDate } from '../utils/schoolDate.js';
import { HttpError } from '../utils/httpError.js';

const invalid = (field, message) => new HttpError(400, 'validation/invalid-calendar', message, { fields: { [field]: message } });

/** Checks a whole calendar { schoolYearStart, noClassDates: [{ date, reason }] }; returns it cleaned. */
export function validateCalendar(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('calendar', 'Send the school calendar.');
  const unknown = Object.keys(body).filter((k) => !['schoolYearStart', 'noClassDates'].includes(k));
  if (unknown.length) throw new HttpError(400, 'validation/unknown-fields', `Unknown fields: ${unknown.join(', ')}.`);

  const start = body.schoolYearStart ?? null;
  if (start !== null && start !== '' && !isValidSchoolDate(start)) throw invalid('schoolYearStart', 'Enter a valid date for the first day of the school year.');

  const list = body.noClassDates ?? [];
  if (!Array.isArray(list)) throw invalid('noClassDates', 'No-class dates must be a list.');
  if (list.length > MAX_NO_CLASS_DATES) throw invalid('noClassDates', `At most ${MAX_NO_CLASS_DATES} no-class dates.`);
  const seen = new Set();
  const noClassDates = list.map((entry) => {
    const date = entry?.date;
    if (!isValidSchoolDate(date)) throw invalid('noClassDates', 'Each no-class date must be a valid date.');
    if (seen.has(date)) throw invalid('noClassDates', `${date} is listed twice.`);
    seen.add(date);
    const reason = typeof entry.reason === 'string' ? entry.reason.trim().replace(/\s+/g, ' ') : '';
    if (reason.length > NO_CLASS_REASON_MAX_LENGTH) throw invalid('noClassDates', `Keep each reason under ${NO_CLASS_REASON_MAX_LENGTH} characters.`);
    if (reason && !hasLetters(reason)) throw invalid('noClassDates', 'A reason must use words (e.g. "Christmas break").');
    return { date, reason };
  });
  return parseCalendar({ schoolYearStart: start || null, noClassDates });
}

export async function readSchoolCalendar() {
  return { calendar: await getCalendar() };
}

/** Replaces the calendar. Audits what changed (dates only; reasons are not needed there). */
export async function updateSchoolCalendar(ctx, body) {
  const next = validateCalendar(body);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(calendarRef());
    const current = parseCalendar(snap.exists ? snap.data() : null);
    const before = new Map(current.noClassDates.map((d) => [d.date, d.reason]));
    const after = new Map(next.noClassDates.map((d) => [d.date, d.reason]));
    const changes = [
      ...(current.schoolYearStart !== next.schoolYearStart ? [`schoolYearStart: ${current.schoolYearStart ?? 'none'} -> ${next.schoolYearStart ?? 'none'}`] : []),
      ...[...after.keys()].filter((d) => !before.has(d)).map((d) => `added ${d}`),
      ...[...before.keys()].filter((d) => !after.has(d)).map((d) => `removed ${d}`),
      ...[...after.keys()].filter((d) => before.has(d) && before.get(d) !== after.get(d)).map((d) => `renamed ${d}`),
    ];
    if (!changes.length) return;
    tx.set(calendarRef(), { ...next, updatedAt: FieldValue.serverTimestamp() });
    auditInTransaction(tx, {
      ...ctx, eventType: 'settings.changed', target: { type: 'settings', id: 'calendar' }, details: { group: 'calendar', changes },
    });
  });
  clearCalendarCache();
  return readSchoolCalendar();
}
