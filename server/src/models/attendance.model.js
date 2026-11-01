// `attendance/{studentId}_{schoolDate}` document: ONE Daily Attendance record per
// student per school day. The deterministic document ID is what makes a second record
// for the same day impossible (Student IDs never contain "_", so the ID is unambiguous).
//
//   studentId     string     school Student ID (not the RFID UID)
//   schoolDate    string     "YYYY-MM-DD" in the school's time zone
//   status        string     checked-in | checked-out
//   timeIn        Timestamp  first accepted scan of the day
//   timeOut       Timestamp? second accepted scan (after the debounce period)
//   entrySource   string     how the time-in UID reached the server: rfid-reader | manual-entry
//                            (reported by the screen, not proof); manual-test = before 2026-10-26
//   exitSource    string?
//   entryRfidUid  string     normalized card UID used for time-in (staff only)
//   exitRfidUid   string?
//   arrivalStatus string?    on-time | late | excused (decided at time-in; missing on older records)
//   lateMinutes   number?    minutes after the start time (0 when on time)
//   scheduledStart string?   "HH:MM" start time that applied (section's own or school default)
//   graceMinutes  number?    grace period that applied
//   excuseReason  string?    why a late arrival was excused (staff only; never in the audit log)
//   departureStatus string?  on-time | early (decided at time-out against the class end time)
//   earlyMinutes  number?    minutes before the end time (0 when not early); scheduledEnd = that end time
//   excusedBy, excusedAt     who excused it and when (server values)
//   createdAt, updatedAt
//
// Student details are NOT copied here; they are joined from students/{studentId}.
import { ATTENDANCE_STATUS, COLLECTIONS } from '@led/shared';
import { db } from '../config/firebaseAdmin.js';

export const attendanceCollection = () => db.collection(COLLECTIONS.ATTENDANCE);

export const attendanceDocId = (studentId, schoolDate) => `${studentId}_${schoolDate}`;
export const attendanceRef = (studentId, schoolDate) => attendanceCollection().doc(attendanceDocId(studentId, schoolDate));

export async function findAttendanceByDate(schoolDate) {
  const snapshot = await attendanceCollection().where('schoolDate', '==', schoolDate).get();
  return snapshot.docs.map((doc) => doc.data());
}

/** Every record from `from` to `to` (inclusive). Single-field range: no composite index needed. */
export async function findAttendanceInRange(from, to) {
  const snapshot = await attendanceCollection().where('schoolDate', '>=', from).where('schoolDate', '<=', to).get();
  return snapshot.docs.map((doc) => doc.data());
}

/** Records of one student for the given dates, fetched by document ID (no index needed). */
export async function findAttendanceOfStudent(studentId, schoolDates) {
  if (schoolDates.length === 0) return [];
  const snapshots = await db.getAll(...schoolDates.map((date) => attendanceRef(studentId, date)));
  return snapshots.filter((snap) => snap.exists).map((snap) => snap.data());
}

const iso = (timestamp) => timestamp?.toDate?.().toISOString() ?? null;

/** What parents see: times and status only (no RFID UID, no scan source). */
export function toAttendanceView(record) {
  return {
    studentId: record.studentId,
    schoolDate: record.schoolDate,
    status: record.status ?? ATTENDANCE_STATUS.CHECKED_IN,
    timeIn: iso(record.timeIn),
    timeOut: iso(record.timeOut),
    arrivalStatus: record.arrivalStatus ?? null,
    lateMinutes: record.lateMinutes ?? null,
    departureStatus: record.departureStatus ?? null,
    earlyMinutes: record.earlyMinutes ?? null,
  };
}

/** Full record for staff. */
export function toStaffAttendanceView(record) {
  return {
    ...toAttendanceView(record),
    entrySource: record.entrySource ?? null,
    exitSource: record.exitSource ?? null,
    entryRfidUid: record.entryRfidUid ?? null,
    exitRfidUid: record.exitRfidUid ?? null,
    scheduledStart: record.scheduledStart ?? null,
    graceMinutes: record.graceMinutes ?? null,
    scheduledEnd: record.scheduledEnd ?? null,
    excuseReason: record.excuseReason ?? null,
    excusedAt: iso(record.excusedAt),
    createdAt: iso(record.createdAt),
    updatedAt: iso(record.updatedAt),
  };
}
