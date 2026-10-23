/** Page title row: title, optional description and actions. Hidden when printing unless `printable`. */
export default function PageHeader({ title, description, actions, printable = false, className = '' }) {
  return (
    <div className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${printable ? '' : 'print:hidden'} ${className}`}>
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-brand-900 sm:text-3xl">{title}</h1>
        {description && <p className="mt-1 text-base text-brand-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
