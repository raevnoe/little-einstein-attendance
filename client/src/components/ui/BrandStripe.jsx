/** Thin decorative stripe in the four orbit colours of the school logo (purple, yellow, green, cyan). */
export default function BrandStripe({ className = 'h-1' }) {
  return (
    <div aria-hidden="true" className={`flex w-full ${className}`}>
      <span className="flex-1 bg-grape-500" />
      <span className="flex-1 bg-sun-400" />
      <span className="flex-1 bg-leaf-400" />
      <span className="flex-1 bg-sky-500" />
    </div>
  );
}
