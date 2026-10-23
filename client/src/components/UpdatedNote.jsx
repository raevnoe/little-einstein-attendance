import { formatTime } from '../lib/format.js';
import { RefreshIcon } from './ui/icons.jsx';

/** "Updated 7:42 AM · checks every 15 seconds" under a screen that refreshes itself (polling). */
export default function UpdatedNote({ updatedAt, timeZone, every, className = '' }) {
  if (!updatedAt) return null;
  return (
    <p className={`flex items-center gap-1.5 text-xs text-brand-500 print:hidden ${className}`}>
      <RefreshIcon className="h-3.5 w-3.5" />
      <span>Updated {formatTime(new Date(updatedAt).toISOString(), timeZone)} · checks every {every}</span>
    </p>
  );
}
