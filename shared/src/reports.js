// Report constants shared by client and server (the server is the authority).

// Longest date range a report may cover, inclusive. Keeps Firestore reads bounded.
export const MAX_REPORT_RANGE_DAYS = 31;

// Statuses SHOWN in attendance reports. They are derived from attendance records and are
// never stored. "no-time-out-recorded" only says that no time-out scan was recorded; it is
// not proof that the child was or was not dismissed.
export const REPORT_ATTENDANCE_STATUS = Object.freeze({
  TIME_OUT_RECORDED: 'time-out-recorded',
  NO_TIME_OUT_RECORDED: 'no-time-out-recorded',
});

export const REPORT_ATTENDANCE_STATUS_LABELS = Object.freeze({
  [REPORT_ATTENDANCE_STATUS.TIME_OUT_RECORDED]: 'Time in and time out recorded',
  [REPORT_ATTENDANCE_STATUS.NO_TIME_OUT_RECORDED]: 'No time out recorded',
});
