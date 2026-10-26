// Small line icons drawn inline (24x24, stroke = currentColor), so no icon package is needed.
// They are decorative: always place them next to visible text (aria-hidden).

function Icon({ className = 'h-5 w-5', children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export function HomeIcon({ className }) {
  return <Icon className={className}><><path d="M3.5 10.5L12 4l8.5 6.5" /><path d="M5.5 9v10.5h13V9" /><path d="M10 19.5v-5h4v5" /></></Icon>;
}
export function AttendanceIcon({ className }) {
  return <Icon className={className}><><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17M9 15l2 2 4-4" /></></Icon>;
}
export function StarIcon({ className }) {
  return <Icon className={className}><path d="M12 3.5l2.5 5.1 5.6.8-4 3.9.9 5.6-5-2.6-5 2.6.9-5.6-4-3.9 5.6-.8z" /></Icon>;
}
export function DismissalIcon({ className }) {
  return <Icon className={className}><><circle cx="9" cy="7.5" r="3" /><path d="M3.5 19.5c.6-3.3 2.8-5 5.5-5s4.9 1.7 5.5 5" /><path d="M15.5 11.5l2 2 3.5-4" /></></Icon>;
}
export function ReportsIcon({ className }) {
  return <Icon className={className}><><path d="M4 20V4M4 20h16" /><rect x="7.5" y="11" width="3" height="6" rx="0.8" /><rect x="12.5" y="7" width="3" height="10" rx="0.8" /><rect x="17.5" y="13" width="2.5" height="4" rx="0.8" /></></Icon>;
}
export function StudentsIcon({ className }) {
  return <Icon className={className}><><circle cx="9" cy="8" r="3" /><path d="M3.5 19c.5-3 2.6-4.8 5.5-4.8s5 1.8 5.5 4.8" /><circle cx="17" cy="9" r="2.3" /><path d="M16 14.4c2.3.1 4 1.6 4.5 4.1" /></></Icon>;
}
export function RfidCardIcon({ className }) {
  return <Icon className={className}><><rect x="3" y="6" width="18" height="12" rx="2.5" /><path d="M7 10.5h4M7 13.5h6" /><path d="M15.5 10a3 3 0 010 4M17.5 8.5a5.5 5.5 0 010 7" /></></Icon>;
}
export function FetcherIcon({ className }) {
  return <Icon className={className}><><circle cx="8" cy="7" r="2.8" /><path d="M3 19c.5-3 2.5-4.7 5-4.7s4.5 1.7 5 4.7" /><circle cx="17" cy="10.5" r="2" /><path d="M14.3 19c.3-2 1.3-3.2 2.7-3.2s2.4 1.2 2.7 3.2" /></></Icon>;
}
export function AuditIcon({ className }) {
  return <Icon className={className}><><path d="M9 4.5h6M9 4.5a1.5 1.5 0 00-1.5 1.5H6a1.5 1.5 0 00-1.5 1.5v12A1.5 1.5 0 006 21h12a1.5 1.5 0 001.5-1.5v-12A1.5 1.5 0 0018 6h-1.5A1.5 1.5 0 0015 4.5" /><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4" /></></Icon>;
}
export function RecordsIcon({ className }) {
  return <Icon className={className}><><path d="M12 6.5c-2-1.5-4.8-2-8-1.5v13c3.2-.5 6 0 8 1.5 2-1.5 4.8-2 8-1.5V5c-3.2-.5-6 0-8 1.5z" /><path d="M12 6.5v13" /></></Icon>;
}
export function SignOutIcon({ className }) {
  return <Icon className={className}><><path d="M14 4.5h3.5A1.5 1.5 0 0119 6v12a1.5 1.5 0 01-1.5 1.5H14" /><path d="M10 8l-4 4 4 4M6 12h9" /></></Icon>;
}
export function WifiOffIcon({ className }) {
  return <Icon className={className}><><path d="M3 3l18 18" /><path d="M8.5 16.5a5 5 0 017 0M5 12.8a10 10 0 015.2-2.7M19 12.8a10 10 0 00-2.4-1.8M2 9.3a14.5 14.5 0 014.2-2.7M22 9.3A14.5 14.5 0 0011 5.5" /><circle cx="12" cy="19.5" r="0.6" fill="currentColor" /></></Icon>;
}
export function CheckCircleIcon({ className }) {
  return <Icon className={className}><><circle cx="12" cy="12" r="8.5" /><path d="M8.5 12.3l2.4 2.4 4.6-5" /></></Icon>;
}
export function AlertIcon({ className }) {
  return <Icon className={className}><><path d="M10.3 4.3L2.9 17.5A2 2 0 004.6 20.5h14.8a2 2 0 001.7-3L13.7 4.3a2 2 0 00-3.4 0z" /><path d="M12 9.5v4M12 17h.01" /></></Icon>;
}
export function InfoIcon({ className }) {
  return <Icon className={className}><><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5M12 8h.01" /></></Icon>;
}
export function SearchIcon({ className }) {
  return <Icon className={className}><><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.3-4.3" /></></Icon>;
}
export function CalendarIcon({ className }) {
  return <Icon className={className}><><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17" /></></Icon>;
}
export function PhoneIcon({ className }) {
  return <Icon className={className}><><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M10.5 18.5h3M9.5 8h5M9.5 11h3" /></></Icon>;
}
export function DownloadIcon({ className }) {
  return <Icon className={className}><><path d="M12 4v11M7.5 10.5L12 15l4.5-4.5" /><path d="M4.5 16.5v2A1.5 1.5 0 006 20h12a1.5 1.5 0 001.5-1.5v-2" /></></Icon>;
}
export function PrinterIcon({ className }) {
  return <Icon className={className}><><path d="M7 8V4h10v4" /><rect x="4" y="8" width="16" height="8" rx="2" /><path d="M7 14h10v6H7z" /></></Icon>;
}
export function ArrowLeftIcon({ className }) {
  return <Icon className={className}><path d="M19 12H5M11 6l-6 6 6 6" /></Icon>;
}
export function ArrowRightIcon({ className }) {
  return <Icon className={className}><path d="M5 12h14M13 6l6 6-6 6" /></Icon>;
}
export function MenuIcon({ className }) {
  return <Icon className={className}><path d="M4 7h16M4 12h16M4 17h16" /></Icon>;
}
export function MoreIcon({ className }) {
  return <Icon className={className}><><circle cx="5.5" cy="12" r="1.2" fill="currentColor" /><circle cx="12" cy="12" r="1.2" fill="currentColor" /><circle cx="18.5" cy="12" r="1.2" fill="currentColor" /></></Icon>;
}
export function CloseIcon({ className }) {
  return <Icon className={className}><path d="M6 6l12 12M18 6L6 18" /></Icon>;
}
export function EyeIcon({ className }) {
  return <Icon className={className}><><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="3" /></></Icon>;
}
export function EyeOffIcon({ className }) {
  return <Icon className={className}><><path d="M3 3l18 18" /><path d="M10.6 6.6A9.6 9.6 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 01-2.9 3.6M6.4 6.9C3.9 8.6 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9 9 0 004.5-1.2" /><path d="M9.9 9.9a3 3 0 004.2 4.2" /></></Icon>;
}
export function RefreshIcon({ className }) {
  return <Icon className={className}><><path d="M19.5 12a7.5 7.5 0 01-13 5.1M4.5 12a7.5 7.5 0 0113-5.1" /><path d="M17.5 3.5v3.4h-3.4M6.5 20.5v-3.4h3.4" /></></Icon>;
}
export function LockIcon({ className }) {
  return <Icon className={className}><><rect x="5" y="10.5" width="14" height="10" rx="2.5" /><path d="M8.5 10.5V8a3.5 3.5 0 017 0v2.5" /></></Icon>;
}
export function ChevronIcon({ className }) {
  return <Icon className={className}><path d="M6 9l6 6 6-6" /></Icon>;
}
export function KeyboardIcon({ className }) {
  return <Icon className={className}><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9" /></Icon>;
}
export function ClockIcon({ className }) {
  return <Icon className={className}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Icon>;
}
export function UserIcon({ className }) {
  return <Icon className={className}><circle cx="12" cy="8" r="3.5" /><path d="M5 20c.7-3.8 3.4-6 7-6s6.3 2.2 7 6" /></Icon>;
}
export function PlusIcon({ className }) {
  return <Icon className={className}><path d="M12 5v14M5 12h14" /></Icon>;
}
export function PencilIcon({ className }) {
  return <Icon className={className}><path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></Icon>;
}
export function SpeakerIcon({ className }) {
  return <Icon className={className}><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M15.5 9a4 4 0 010 6M18 6.5a7.5 7.5 0 010 11" /></Icon>;
}
export function SpeakerOffIcon({ className }) {
  return <Icon className={className}><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" /><path d="M16 9.5l5 5M21 9.5l-5 5" /></Icon>;
}
export function BellIcon({ className }) {
  return <Icon className={className}><path d="M6 16.5V11a6 6 0 0112 0v5.5l1.5 2h-15z" /><path d="M10 20.5a2 2 0 004 0" /></Icon>;
}
export function SettingsIcon({ className }) {
  return (
    <Icon className={className}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </Icon>
  );
}
export function SunIcon({ className }) {
  return <Icon className={className}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" /></Icon>;
}
export function MoonIcon({ className }) {
  return <Icon className={className}><path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z" /></Icon>;
}
export function DeviceIcon({ className }) {
  return <Icon className={className}><rect x="3" y="4.5" width="18" height="12" rx="2" /><path d="M8.5 20h7M12 16.5V20" /></Icon>;
}
