import { SchoolLogo } from './landing/SchoolMark.jsx';
import BrandStripe from './ui/BrandStripe.jsx';

/** Full-page centred layout for loading, account problems and access denied (no navigation). */
export default function SystemScreen({ children }) {
  return (
    <main className="flex min-h-screen flex-col bg-paper">
      <BrandStripe />
      <div className="flex flex-1 flex-col items-center justify-center px-4 py-10">
        <SchoolLogo className="h-24 w-auto sm:h-28" />
        <div className="mt-6 w-full max-w-md">{children}</div>
      </div>
    </main>
  );
}
