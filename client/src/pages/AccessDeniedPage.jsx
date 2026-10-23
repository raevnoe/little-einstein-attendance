import SignOutButton from '../components/SignOutButton.jsx';
import SystemScreen from '../components/SystemScreen.jsx';
import Card from '../components/ui/Card.jsx';
import { LockIcon } from '../components/ui/icons.jsx';

export default function AccessDeniedPage({ reason }) {
  return (
    <SystemScreen>
      <Card className="text-center">
        <span aria-hidden="true" className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-700">
          <LockIcon className="h-6 w-6" />
        </span>
        <h1 className="mt-4 text-xl font-bold text-brand-900">Access denied</h1>
        <p className="mt-2 text-sm text-brand-700">{reason}</p>
        <p className="mt-2 text-sm text-brand-700">Please contact the school administrator.</p>
        <SignOutButton className="mt-6 w-full" confirm={false} />
      </Card>
    </SystemScreen>
  );
}
