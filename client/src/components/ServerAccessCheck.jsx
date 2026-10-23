import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/apiClient.js';

// Calls a role-protected test endpoint so the dashboard shows what the SERVER
// decided, not just what the client rendered. Temporary Phase 3 verification aid.
export default function ServerAccessCheck({ endpoint }) {
  const [result, setResult] = useState({ state: 'checking', text: 'Checking server access…' });

  useEffect(() => {
    apiRequest(endpoint)
      .then((data) => setResult({ state: 'ok', text: data.message }))
      .catch((error) => setResult({ state: 'error', text: error.message }));
  }, [endpoint]);

  const color = { checking: 'text-slate-500', ok: 'text-emerald-700', error: 'text-red-700' }[result.state];

  return (
    <p className="text-sm">
      <span className="text-slate-500">Server access check ({endpoint}): </span>
      <span className={`font-medium ${color}`}>{result.text}</span>
    </p>
  );
}
