import { useState } from 'react';
import { apiRequest } from '../../lib/apiClient.js';
import { QuietButton } from '../Panel.jsx';

/**
 * DEVELOPMENT ONLY. Rendered only under `import.meta.env.DEV`, so production builds drop it.
 * Shows the code the MOCK SMS provider "texted" to this parent. The server answers only when
 * NODE_ENV != production and SMS_PROVIDER=mock, and only for the parent's own current request.
 */
export default function DevOtpPeek({ studentId, requestNumber }) {
  const [result, setResult] = useState(null); // { otp, requestNumber } | { error }
  const [busy, setBusy] = useState(false);
  const shown = result?.otp && result.requestNumber === requestNumber ? result.otp : null;

  async function peek() {
    setBusy(true);
    try {
      const data = await apiRequest(`/dev/dismissal-otp/${encodeURIComponent(studentId)}`);
      setResult({ otp: data.otp, requestNumber: data.requestNumber });
    } catch (err) {
      setResult({ error: err.status === 404 ? 'No test code available (needs SMS_PROVIDER=mock and an active code).' : err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-dashed border-amber-400 bg-amber-50 p-3 text-sm text-amber-900">
      <p className="text-xs font-semibold uppercase tracking-wide">Development test only (mock SMS)</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <QuietButton onClick={peek} disabled={busy}>{busy ? 'Loading…' : 'Show test code'}</QuietButton>
        {shown && <span className="font-mono text-lg font-bold tracking-widest">{shown}</span>}
      </div>
      {result?.error && <p className="mt-1">{result.error}</p>}
    </div>
  );
}
