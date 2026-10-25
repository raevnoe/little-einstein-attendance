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
    createdAt: iso(record.createdAt),
    updatedAt: iso(record.updatedAt),
  };
}
