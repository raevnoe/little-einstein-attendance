import { PASSWORD_RULES, PASSWORD_STRENGTH_LABELS, passwordProblems, passwordStrength } from '@led/shared';
import { CheckCircleIcon } from './ui/icons.jsx';

const BAR = ['bg-brand-100', 'bg-red-600', 'bg-amber-500', 'bg-leaf-400', 'bg-leaf-700'];

/**
 * Live password requirements (shared PASSWORD_RULES) with a strength meter, shown under a new-password
 * field. `context` = { email, names } so the password cannot be the person's own name or email.
 */
export default function PasswordChecklist({ password, context, id }) {
  const strength = passwordStrength(password, context);
  const extra = passwordProblems(password, context).filter((p) => !PASSWORD_RULES.some((r) => r.label === p));
  return (
    <div id={id} className="mt-2 space-y-2" aria-live="polite">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden="true">
          {[1, 2, 3, 4].map((n) => (
            <span key={n} className={`h-1.5 flex-1 rounded-full ${n <= strength ? BAR[strength] : 'bg-brand-100'}`} />
          ))}
        </div>
        <span className="w-24 text-right text-xs font-semibold text-brand-700">{PASSWORD_STRENGTH_LABELS[strength] || 'Strength'}</span>
      </div>
      <ul className="grid gap-1 text-sm sm:grid-cols-2">
        {PASSWORD_RULES.map((rule) => {
          const ok = rule.test(password);
          return (
            <li key={rule.id} className={`flex items-center gap-1.5 ${ok ? 'text-leaf-700' : 'text-brand-500'}`}>
              {ok ? <CheckCircleIcon className="h-4 w-4 shrink-0" /> : <span aria-hidden="true" className="ml-1 mr-0.5 h-2 w-2 shrink-0 rounded-full bg-brand-200" />}
              <span>{rule.label}<span className="sr-only">{ok ? ' (done)' : ' (needed)'}</span></span>
            </li>
          );
        })}
      </ul>
      {password && extra.length > 0 && (
        <ul className="text-sm font-medium text-red-700">
          {extra.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}
    </div>
  );
}
