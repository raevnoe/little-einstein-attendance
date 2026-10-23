import { buttonClass } from './classes.js';

/**
 * Standard button. variant: primary | secondary | danger | danger-solid | quiet; size: sm | md | lg.
 * `busy` disables it and shows `busyLabel` (e.g. "Saving…") so a request cannot be sent twice.
 */
export default function Button({ variant, size, block, busy = false, busyLabel, disabled, className, type = 'button', children, ...props }) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={buttonClass({ variant, size, block, className })}
      {...props}
    >
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
}
