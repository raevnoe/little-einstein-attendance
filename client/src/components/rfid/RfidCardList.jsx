import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/apiClient.js';
import RfidStatusBadge from './RfidStatusBadge.jsx';
import { Alert, Card, EmptyState, Field, LoadingState, ResponsiveTable, buttonClass, inputClass, TABLE, TD, TH, TR, UID_CHIP } from '../ui/index.js';
import { PlusIcon, RfidCardIcon } from '../ui/icons.jsx';

const SEARCH_DELAY_MS = 300;
const SELECT_CLASS = inputClass({ className: 'w-auto' });

export default function RfidCardList({ canManage, onView, onAdd }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [assignment, setAssignment] = useState('all');
  const [result, setResult] = useState({ loading: true, cards: [], error: null });

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      const params = new URLSearchParams({ status, assignment });
      if (search.trim()) params.set('q', search.trim());
      setResult((r) => ({ ...r, loading: true, error: null }));
      apiRequest(`/rfid-cards?${params}`)
        .then((data) => !cancelled && setResult({ loading: false, cards: data.cards, error: null }))
        .catch((error) => !cancelled && setResult({ loading: false, cards: [], error: error.message }));
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, status, assignment]);

  const cards = result.cards;

  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-end gap-3 border-b border-brand-100 p-4 sm:p-5">
        <Field id="rfid-search" label="Search" className="min-w-48 flex-1">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="RFID UID, Student ID, or name"
            className={inputClass()}
          />
        </Field>
        <Field id="rfid-status" label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={SELECT_CLASS}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="all">All</option>
          </select>
        </Field>
        <Field id="rfid-assignment" label="Assignment">
          <select value={assignment} onChange={(e) => setAssignment(e.target.value)} className={SELECT_CLASS}>
            <option value="all">All</option>
            <option value="assigned">Assigned</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </Field>
        {canManage && (
          <button type="button" onClick={onAdd} className={buttonClass()}>
            <PlusIcon className="h-4 w-4" />
            Register Cards
          </button>
        )}
      </div>

      <div className="p-4 sm:p-5">
        {result.error && <Alert tone="error" className="mb-4">{result.error}</Alert>}

        {cards.length > 0 && (
          <ResponsiveTable label="RFID cards" className="hidden sm:block">
            <table className={`${TABLE} min-w-[640px]`}>
              <thead>
                <tr>
                  <th scope="col" className={TH}>RFID UID</th>
                  <th scope="col" className={TH}>Student ID</th>
                  <th scope="col" className={TH}>Student Name</th>
                  <th scope="col" className={TH}>Status</th>
                  <th scope="col" className={TH}><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {cards.map((c) => (
                  <tr key={c.uid} className={TR}>
                    <td className={TD}><span className={UID_CHIP}>{c.uid}</span></td>
                    <td className={`${TD} font-mono text-brand-700`}>{c.studentId ?? '—'}</td>
                    <td className={`${TD} font-medium`}>{c.student?.name ?? '—'}</td>
                    <td className={TD}><RfidStatusBadge status={c.status} /></td>
                    <td className={`${TD} text-right`}>
                      <button type="button" onClick={() => onView(c.uid)} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ResponsiveTable>
        )}

        {cards.length > 0 && (
          <ul className="space-y-3 sm:hidden" aria-label="RFID cards">
            {cards.map((c) => (
              <li key={c.uid} className="rounded-2xl border border-brand-100 p-4">
                <div className="flex items-start justify-between gap-3">
                  <span className={`${UID_CHIP} break-all`}>{c.uid}</span>
                  <RfidStatusBadge status={c.status} />
                </div>
                <p className="mt-2 text-sm text-brand-900">
                  {c.student?.name ?? '—'}
                  {c.studentId && <span className="text-brand-500"> · <span className="font-mono">{c.studentId}</span></span>}
                </p>
                <button type="button" onClick={() => onView(c.uid)} className={buttonClass({ variant: 'secondary', size: 'sm', block: true, className: 'mt-3' })}>
                  View
                </button>
              </li>
            ))}
          </ul>
        )}

        {!result.loading && !result.error && cards.length === 0 && (
          <EmptyState icon={<RfidCardIcon className="h-6 w-6" />} title="No RFID cards found." />
        )}
        {result.loading && <LoadingState className="justify-center py-6">Loading RFID cards…</LoadingState>}
      </div>
    </Card>
  );
}
