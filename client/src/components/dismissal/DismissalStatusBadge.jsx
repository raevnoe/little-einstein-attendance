import { DISMISSAL_STATUS, DISMISSAL_STATUS_LABELS } from '@led/shared';
import Badge from '../ui/Badge.jsx';

const TONES = {
  [DISMISSAL_STATUS.SENDING]: 'brand',
  [DISMISSAL_STATUS.AWAITING_VERIFICATION]: 'warning',
  [DISMISSAL_STATUS.VERIFIED]: 'success',
  [DISMISSAL_STATUS.RELEASED]: 'grape',
  [DISMISSAL_STATUS.SMS_FAILED]: 'danger',
  [DISMISSAL_STATUS.LOCKED]: 'danger',
  [DISMISSAL_STATUS.EXPIRED]: 'neutral',
  [DISMISSAL_STATUS.CANCELLED]: 'neutral',
};

export default function DismissalStatusBadge({ status }) {
  return (
    <Badge tone={TONES[status] ?? 'neutral'} dot>
      {DISMISSAL_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

