import Alert from './ui/Alert.jsx';
import { CardHeader } from './ui/Card.jsx';
import { buttonClass, CARD } from './ui/classes.js';

/** Rounded content card with an optional heading row (title, subtitle, actions on the right). */
export default function Panel({ title, titleId, subtitle, actions, script = false, accent, className = '', children }) {
  return (
    <section aria-labelledby={title ? titleId : undefined} className={`${CARD} p-5 sm:p-6 ${className}`}>
      {title && <CardHeader title={title} titleId={titleId} subtitle={subtitle} actions={actions} script={script} accent={accent} />}
      {children}
    </section>
  );
}

/** Inline error message with an optional retry button. */
export function ErrorMessage({ message, onRetry }) {
  return (
    <Alert
      tone="error"
      className="mt-4"
      action={
        onRetry && (
          <button type="button" onClick={onRetry} className={buttonClass({ variant: 'danger', size: 'sm' })}>
            Try again
          </button>
        )
      }
    >
      <p>{message}</p>
    </Alert>
  );
}

/** Secondary button used for "Show more" style controls. */
export function QuietButton({ className = '', ...props }) {
  return <button type="button" {...props} className={buttonClass({ variant: 'secondary', className })} />;
}
