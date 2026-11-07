// School calendar (admin only): the school-year start, the no-class dates that keep holidays and
// suspensions from counting as Absent, and the extra class days that make a weekend count as a class
// day. Saved with one audit entry, in one transaction.
import { CLASS_WEEKDAYS, MAX_NO_CLASS_DATES, NO_CLASS_REASON_MAX_LENGTH, hasLetters, weekdayOf } from '@led/shared';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config/firebaseAdmin.js';
import { calendarRef, clearCalendarCache, getCalendar, parseCalendar } from '../models/calendar.model.js';
import { auditInTransaction } from './audit.service.js';
import { isValidSchoolDate } from '../utils/schoolDate.js';
import { HttpError } from '../utils/httpError.js';

const invalid = (field, message) => new HttpError(400, 'validation/invalid-calendar', message, { fields: { [field]: message } });

/** Checks one list of { date, reason }; `what` names it in the messages. */
function cleanDates(list = [], field, what) {
  if (!Array.isArray(list)) throw invalid(field, `${what} must be a list.`);
  if (list.length > MAX_NO_CLASS_DATES) throw invalid(field, `At most ${MAX_NO_CLASS_DATES} ${what.toLowerCase()}.`);
  const seen = new Set();
  return list.map((entry) => {
    const date = entry?.date;
    if (!isValidSchoolDate(date)) throw invalid(field, `Each date in ${what.toLowerCase()} must be a valid date.`);
    if (seen.has(date)) throw invalid(field, `${date} is listed twice.`);
    seen.add(date);
    const reason = typeof entry.reason === 'string' ? entry.reason.trim().replace(/\s+/g, ' ') : '';
    if (reason.length > NO_CLASS_REASON_MAX_LENGTH) throw invalid(field, `Keep each reason under ${NO_CLASS_REASON_MAX_LENGTH} characters.`);
    if (reason && !hasLetters(reason)) throw invalid(field, 'A reason must use words (e.g. "Christmas break").');
    return { date, reason };
  });
}

/** Checks a whole calendar { schoolYearStart, noClassDates, extraClassDates }; returns it cleaned. */
export function validateCalendar(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw invalid('calendar', 'Send the school calendar.');
  const unknown = Object.keys(body).filter((k) => !['schoolYearStart', 'noClassDates', 'extraClassDates'].includes(k));
  if (unknown.length) throw new HttpError(400, 'validation/unknown-fields', `Unknown fields: ${unknown.join(', ')}.`);

  const start = body.schoolYearStart ?? null;
  if (start !== null && start !== '' && !isValidSchoolDate(start)) throw invalid('schoolYearStart', 'Enter a valid date for the first day of the school year.');

  const noClassDates = cleanDates(body.noClassDates ?? [], 'noClassDates', 'No-class dates');
  const extraClassDates = cleanDates(body.extraClassDates ?? [], 'extraClassDates', 'Extra class days');
  for (const { date } of extraClassDates) {
    if (CLASS_WEEKDAYS.includes(weekdayOf(date))) throw invalid('extraClassDates', `${date} is already a class day. Extra class days are Saturdays or Sundays.`);
    if (noClassDates.some((d) => d.date === date)) throw invalid('extraClassDates', `${date} cannot be both a no-class date and an extra class day.`);
  }
  return parseCalendar({ schoolYearStart: start || null, noClassDates, extraClassDates });
}

export async function readSchoolCalendar() {
  return { calendar: await getCalendar() };
}

function dateChanges(previous, next, prefix) {
  const before = new Map(previous.map((d) => [d.date, d.reason]));
  const after = new Map(next.map((d) => [d.date, d.reason]));
  return [
    ...[...after.keys()].filter((d) => !before.has(d)).map((d) => `added ${prefix}${d}`),
    ...[...before.keys()].filter((d) => !after.has(d)).map((d) => `removed ${prefix}${d}`),
    ...[...after.keys()].filter((d) => before.has(d) && before.get(d) !== after.get(d)).map((d) => `renamed ${prefix}${d}`),
  ];
}

/** Replaces the calendar. Audits what changed (dates only; reasons are not needed there). */
export async function updateSchoolCalendar(ctx, body) {
  const next = validateCalendar(body);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(calendarRef());
    const current = parseCalendar(snap.exists ? snap.data() : null);
    const changes = [
      ...(current.schoolYearStart !== next.schoolYearStart ? [`schoolYearStart: ${current.schoolYearStart ?? 'none'} -> ${next.schoolYearStart ?? 'none'}`] : []),
      ...dateChanges(current.noClassDates, next.noClassDates, ''),
      ...dateChanges(current.extraClassDates, next.extraClassDates, 'extra class day '),
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
