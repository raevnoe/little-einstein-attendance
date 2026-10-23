import Badge from './ui/Badge.jsx';

export default function StatusBadge({ active }) {
  return (
    <Badge tone={active ? 'success' : 'neutral'} dot>
      {active ? 'Active' : 'Inactive'}
    </Badge>
  );
}
