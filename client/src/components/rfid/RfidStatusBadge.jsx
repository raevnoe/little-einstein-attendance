import Badge from '../ui/Badge.jsx';

const STYLES = {
  assigned: ['success', 'Assigned'],
  unassigned: ['warning', 'Unassigned'],
  inactive: ['neutral', 'Inactive'],
};

export default function RfidStatusBadge({ status }) {
  const [tone, label] = STYLES[status] ?? STYLES.inactive;
  return <Badge tone={tone} dot>{label}</Badge>;
}
