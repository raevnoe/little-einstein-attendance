import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from '../../lib/apiClient.js';
import { rangeError } from '../../lib/dateRange.js';

/** Query string for a report: empty filters are left out (the server defaults to today). */
export function reportQuery(filters) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  return params.toString();
}

export const OFFLINE_REPORT_MESSAGE = 'You’re offline — reports need an internet connection.';

/**
 * Loads `endpoint` with the report filters. While a new request runs, the previous report
 * stays on screen (marked as updating). An invalid date range is not sent: `invalid` explains
 * why. `today` is the school date from the server (null until the first answer).
 */
export function useReport(endpoint, filters) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [result, setResult] = useState({ loading: true, data: null, error: null, today: null });
  const invalid = (filters.from || filters.to) && result.today ? rangeError(filters.from, filters.to, result.today) : null;
  const query = reportQuery(filters);

  useEffect(() => {
    if (invalid) return undefined;
    let cancelled = false;
    const timer = setTimeout(() => {
      setResult((r) => ({ ...r, loading: true, error: null }));
      apiRequest(`${endpoint}${query ? `?${query}` : ''}`)
        .then((data) => !cancelled && setResult({ loading: false, data, error: null, today: data.today }))
        .catch((error) => !cancelled && setResult((r) => ({
          ...r,
          loading: false,
          data: null, // never show a report for different filters under an error
          error: typeof navigator !== 'undefined' && !navigator.onLine ? OFFLINE_REPORT_MESSAGE : error.message,
        })));
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [endpoint, query, invalid, refreshKey]);

  const reload = useCallback(() => setRefreshKey((n) => n + 1), []);
  return { ...result, invalid, reload };
}
