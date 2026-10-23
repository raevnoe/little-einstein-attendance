import { ATTENDANCE_STATUS } from '@led/shared';

// Staff wording (matches the status filter on the staff Attendance page).
export const STAFF_STATUS_LABELS = Object.freeze({
  [ATTENDANCE_STATUS.CHECKED_IN]: 'In school',
  [ATTENDANCE_STATUS.CHECKED_OUT]: 'Went home',
  [ATTENDANCE_STATUS.ABSENT]: 'No time in',
});

// Parent wording only states what was recorded (it never implies who fetched the child).
export const PARENT_STATUS_LABELS = Object.freeze({
  [ATTENDANCE_STATUS.CHECKED_IN]: 'At school',
  [ATTENDANCE_STATUS.CHECKED_OUT]: 'Left school',
  [ATTENDANCE_STATUS.ABSENT]: 'Not yet arrived',
});
