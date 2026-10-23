import Button from './Button.jsx';

/**
 * The app's two-step confirmation for destructive or irreversible actions, shown in place
 * (no pop-up dialog). The first button the user pressed is replaced by this box.
 */
export default function InlineConfirm({ message, confirmLabel, busyLabel = 'Saving…', cancelLabel = 'Cancel', tone = 'danger', busy = false, onConfirm, onCancel, className = '' }) {
  const danger = tone === 'danger';
  return (
    <div role="group" aria-label="Confirm action" className={`rounded-2xl border px-4 py-3 ${danger ? 'border-red-200 bg-red-50' : 'border-brand-100 bg-brand-50'} ${className}`}>
      <p className={`text-sm font-medium ${danger ? 'text-red-800' : 'text-brand-900'}`}>{message}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant={danger ? 'danger-solid' : 'primary'} size="sm" busy={busy} busyLabel={busyLabel} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="secondary" size="sm" disabled={busy} onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </div>
  );
}
