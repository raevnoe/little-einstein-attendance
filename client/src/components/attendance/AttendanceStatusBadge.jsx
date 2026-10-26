import { ATTENDANCE_STATUS } from '@led/shared';
import { PARENT_STATUS_LABELS, STAFF_STATUS_LABELS } from '../../lib/attendanceStatusLabels.js';

const STYLES = {
  [ATTENDANCE_STATUS.CHECKED_IN]: ['bg-leaf-100 text-leaf-700', 'bg-leaf-400'],
  [ATTENDANCE_STATUS.CHECKED_OUT]: ['bg-brand-100 text-brand-700', 'bg-brand-500'],
  [ATTENDANCE_STATUS.ABSENT]: ['bg-brand-50 text-brand-600 dark:text-brand-300 ring-1 ring-inset ring-brand-200', 'bg-mist-400'],
};

/** `audience="parent"` switches to parent-friendly wording; the default keeps the staff labels. */
export default function AttendanceStatusBadge({ status, audience = 'staff' }) {
  const known = STYLES[status] ? status : ATTENDANCE_STATUS.ABSENT;
  const [className, dotClassName] = STYLES[known];
  const label = (audience === 'parent' ? PARENT_STATUS_LABELS : STAFF_STATUS_LABELS)[known];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotClassName}`} aria-hidden="true" />
      {label}
    </span>
  );
}
