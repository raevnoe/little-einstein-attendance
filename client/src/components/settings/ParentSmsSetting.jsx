import { useState } from 'react';
import { apiRequest } from '../../lib/apiClient.js';
import { useApiData } from '../../lib/useApiData.js';
import { maskMobileNumber } from '../../lib/format.js';
import { ErrorMessage } from '../Panel.jsx';
import { Alert, Button, Card, CardHeader, LoadingState } from '../ui/index.js';
import { PhoneIcon } from '../ui/icons.jsx';

/**
 * A parent's own SMS details: the registered number (partly hidden; only the school can change it,
 * because dismissal codes are sent there) and, when the school allows it, arrival/departure SMS on/off.
 */
export default function ParentSmsSetting() {
  const { loading, data, error, reload } = useApiData('/account');
  const [saved, setSaved] = useState(null); // profile after a change
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const profile = saved ?? data?.profile;
  const sms = data?.sms;

  async function toggle() {
    setBusy(true);
    setMessage(null);
    try {
      const next = !profile.attendanceSms;
      const res = await apiRequest('/account/preferences', { method: 'PATCH', body: { attendanceSms: next } });
      setSaved(res.profile);
      setMessage({ tone: 'success', text: next ? 'Arrival and departure SMS are on.' : 'Arrival and departure SMS are off. You will still see them in the app.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  const masked = maskMobileNumber(profile?.mobileNumber);
  const effectiveOn = profile?.attendanceSms || sms?.allowParentSmsOptOut === false;

  return (
    <Card as="section" aria-labelledby="parent-sms-title">
      <CardHeader titleId="parent-sms-title" title="SMS" icon={<PhoneIcon className="h-5 w-5" />} />
      {loading ? (
        <LoadingState className="mt-4" />
      ) : error ? (
        <ErrorMessage message={error} onRetry={reload} />
      ) : (
        <div className="mt-5 space-y-5">
          <div>
            <p className="text-sm font-semibold text-brand-900">Registered mobile number</p>
            <p className="mt-1 text-base text-brand-900">{masked ?? 'No mobile number yet'}</p>
            <p className="mt-1 text-sm text-brand-500">
              Dismissal codes are sent to this number. To change it, please ask the school office.
            </p>
          </div>

          <div className="border-t border-brand-100 pt-4">
            <p className="text-sm font-semibold text-brand-900">Arrival and departure SMS</p>
            {!sms.attendanceSmsEnabled ? (
              <p className="mt-1 text-sm text-brand-500">The school has turned these SMS off. You can still see arrivals and departures in the app.</p>
            ) : (
              <>
                <p className="mt-1 text-sm text-brand-500">
                  {effectiveOn ? 'You receive an SMS when your child arrives and leaves.' : 'Off: you see arrivals and departures in the app only.'}
                  {!sms.allowParentSmsOptOut && ' The school requires these SMS for every parent.'}
                </p>
                {(sms.allowParentSmsOptOut || !profile.attendanceSms) && (
                  <Button variant="secondary" className="mt-3" busy={busy} busyLabel="Saving…" onClick={toggle} aria-pressed={profile.attendanceSms}>
                    {profile.attendanceSms ? 'Turn off arrival and departure SMS' : 'Turn on arrival and departure SMS'}
                  </Button>
                )}
              </>
            )}
            <p className="mt-3 text-sm text-brand-500">Dismissal codes are always sent by SMS.</p>
          </div>
          {message && <Alert tone={message.tone}>{message.text}</Alert>}
        </div>
      )}
    </Card>
  );
}
