import { useState } from 'react';
import { apiRequest } from '../../lib/apiClient.js';
import { useApiData } from '../../lib/useApiData.js';
import { ErrorMessage } from '../Panel.jsx';
import { Alert, Badge, Button, Card, CardHeader, InlineConfirm, LoadingState } from '../ui/index.js';
import { PhoneIcon } from '../ui/icons.jsx';

const NOTICE_BADGES = {
  sent: { tone: 'success', label: 'Parent notified' },
  failed: { tone: 'danger', label: 'SMS failed: please call' },
  'no-number': { tone: 'warning', label: 'No mobile number: please call' },
  'opted-out': { tone: 'neutral', label: 'Parent turned off SMS' },
};

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Today's absent students and the "text their parents" step. Nothing is sent automatically: staff
 * untick anyone who is actually in school (forgotten card, reader problem), then confirm. The server
 * checks the list again when sending. Shown only on today's list when someone is absent.
 */
export default function AbsenceNotices() {
  const { loading, data, error, reload } = useApiData('/attendance/absence-notices');
  if (loading) return <Card><LoadingState /></Card>;
  if (error) return <Card><ErrorMessage message={error} onRetry={reload} /></Card>;
  return <NoticeList initial={data} />;
}

function NoticeList({ initial }) {
  const [list, setList] = useState(initial);
  const [excluded, setExcluded] = useState(() => new Set());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  const pending = list.students.filter((s) => s.notice === 'pending');
  const chosen = pending.filter((s) => !excluded.has(s.studentId));

  function toggle(studentId) {
    setConfirming(false);
    setExcluded((current) => {
      const next = new Set(current);
      if (!next.delete(studentId)) next.add(studentId);
      return next;
    });
  }

  async function send() {
    setBusy(true);
    setMessage(null);
    try {
      const result = await apiRequest('/attendance/absence-notices', { method: 'POST', body: { studentIds: chosen.map((s) => s.studentId) } });
      setList(result);
      setMessage(result.failed
        ? { tone: 'error', text: `Sent for ${plural(result.sent, 'student')}. ${result.failed} could not be sent: please call those parents.` }
        : { tone: 'success', text: `Parents of ${plural(result.sent, 'student')} notified.` });
    } catch (err) {
      setMessage({ tone: 'error', text: err.message });
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  if (list.students.length === 0) return null;

  return (
    <Card as="section" aria-labelledby="absence-notices-title">
      <CardHeader
        titleId="absence-notices-title"
        title="Absence SMS"
        subtitle="Check the list first. Untick any child who is actually in school, for example a forgotten card."
        icon={<PhoneIcon className="h-5 w-5" />}
      />
      {!list.smsEnabled && <Alert tone="info" className="mt-4">Attendance SMS are turned off in School Settings.</Alert>}
      <ul className="mt-4 divide-y divide-brand-50 rounded-xl ring-1 ring-brand-100">
        {list.students.map((s) => {
          const badge = NOTICE_BADGES[s.notice];
          return (
            <li key={s.studentId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
              {s.notice === 'pending' && list.smsEnabled ? (
                <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-brand-900">
                  <input type="checkbox" checked={!excluded.has(s.studentId)} onChange={() => toggle(s.studentId)} className="h-5 w-5" />
                  <span><strong>{s.name}</strong> · {s.section}</span>
                </label>
              ) : (
                <span className="text-sm text-brand-900"><strong>{s.name}</strong> · {s.section}</span>
              )}
              {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
            </li>
          );
        })}
      </ul>
      {list.smsEnabled && pending.length > 0 && (
        <div className="mt-4">
          {confirming ? (
            <InlineConfirm
              tone="brand"
              message={`Text the parents of ${plural(chosen.length, 'student')}? They will read that their child is absent today. This cannot be undone.`}
              confirmLabel="Yes, send SMS"
              busyLabel="Sending…"
              busy={busy}
              onConfirm={send}
              onCancel={() => setConfirming(false)}
            />
          ) : (
            <Button disabled={chosen.length === 0} onClick={() => { setMessage(null); setConfirming(true); }}>
              Send absence SMS ({chosen.length})
            </Button>
          )}
        </div>
      )}
      {message && <Alert tone={message.tone} className="mt-4">{message.text}</Alert>}
    </Card>
  );
}
