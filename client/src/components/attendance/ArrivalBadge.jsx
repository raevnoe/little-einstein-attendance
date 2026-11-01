import { ARRIVAL_STATUS, DEPARTURE_STATUS } from '@led/shared';
import Badge from '../ui/Badge.jsx';
import { earlyText, lateText } from '../../lib/format.js';

/**
 * Late / Late (excused) / On time, as the server decided at time-in. Records from before late
 * arrivals were tracked (arrivalStatus null) show nothing. `showOnTime` adds the On time label.
 */
export default function ArrivalBadge({ attendance, showOnTime = false, className = '' }) {
  const status = attendance?.arrivalStatus;
  if (status === ARRIVAL_STATUS.LATE) return <Badge tone="warning" dot className={className}>{lateText(attendance.lateMinutes)}</Badge>;
  if (status === ARRIVAL_STATUS.EXCUSED) return <Badge tone="grape" dot className={className}>Late (excused)</Badge>;
  if (status === ARRIVAL_STATUS.ON_TIME && showOnTime) return <Badge tone="success" dot className={className}>On time</Badge>;
  return null;
}

/** "Picked up 30 min early" when the child left before the class end time; nothing otherwise. */
export function DepartureBadge({ attendance, className = '' }) {
  if (attendance?.departureStatus !== DEPARTURE_STATUS.EARLY) return null;
  return <Badge tone="info" dot className={className}>{earlyText(attendance.earlyMinutes)}</Badge>;
}
