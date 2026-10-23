import { cloneElement } from 'react';
import { FIELD_ERROR, HINT, LABEL } from './classes.js';

/**
 * Label + one control + optional hint and error, linked for screen readers.
 * The child (an <input>, <select> or <textarea>) gets `id`, `aria-describedby` and `aria-invalid`.
 *   <Field id="email" label="Email" error={errors.email}><input className={inputClass()} … /></Field>
 */
export default function Field({ id, label, hint, error, optional = false, className = '', children }) {
  const hintId = hint ? `${id}-hint` : null;
  const errorId = error ? `${id}-error` : null;
  const describedBy = [children.props['aria-describedby'], hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={className}>
      <label htmlFor={id} className={LABEL}>
        {label}
        {optional && <span className="ml-1 font-normal text-brand-500">(optional)</span>}
      </label>
      {cloneElement(children, { id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      {hint && <p id={hintId} className={HINT}>{hint}</p>}
      {error && <p id={errorId} className={FIELD_ERROR}>{error}</p>}
    </div>
  );
}
