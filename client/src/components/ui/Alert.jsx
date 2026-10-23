import { AlertIcon, CheckCircleIcon, InfoIcon, WifiOffIcon } from './icons.jsx';

const TONES = {
  info: { box: 'border-sky-100 bg-sky-50 text-sky-700', icon: InfoIcon },
  success: { box: 'border-leaf-100 bg-leaf-50 text-leaf-700', icon: CheckCircleIcon },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: AlertIcon },
  error: { box: 'border-red-200 bg-red-50 text-red-800', icon: AlertIcon },
  offline: { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: WifiOffIcon },
};

/**
 * Message box. Errors are announced immediately (role="alert"); other tones politely (role="status").
 * Pass `role={null}` for static text that must not be announced.
 */
export default function Alert({ tone = 'info', title, action, role, className = '', children }) {
  const { box, icon: Icon } = TONES[tone] ?? TONES.info;
  const ariaRole = role === null ? undefined : (role ?? (tone === 'error' ? 'alert' : 'status'));

  return (
    <div role={ariaRole} className={`flex flex-wrap items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${box} ${className}`}>
      <Icon className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
