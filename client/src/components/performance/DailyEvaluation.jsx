import { useCallback, useEffect, useState } from 'react';
import { PERFORMANCE_AREAS, dailyAverageStarRating } from '@led/shared';
import { apiRequest } from '../../lib/apiClient.js';
import { OFFLINE_MESSAGE, formatDate, studentFullName } from '../../lib/format.js';
import { saveAreaEvaluation } from '../../lib/performanceEvaluation.js';
import { playSound } from '../../lib/sounds.js';
import AreaEvaluationRow from './AreaEvaluationRow.jsx';
import { StarDisplay } from './StarRating.jsx';
import { Alert, Card, EmptyState, Field, LoadingState, buttonClass, inputClass } from '../ui/index.js';
import { StarIcon } from '../ui/icons.jsx';

/**
 * Teacher workflow: select student -> select date -> rate each performance area -> save, one area
 * at a time or every changed area at once ("Save all").
 */
export default function DailyEvaluation() {
  const [setup, setSetup] = useState({ loading: true, students: [], today: null, timeZone: null, error: null });
  const [studentId, setStudentId] = useState('');
  const [date, setDate] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  // forKey = the student|date the evaluations belong to, so rows never show another student's data.
  const [result, setResult] = useState({ forKey: null, evaluations: [], error: null });
  const [notice, setNotice] = useState(null);
  // Unsaved areas reported by the rows: { [areaKey]: { evaluation, starRating, observation } }.
  const [drafts, setDrafts] = useState({});
  const [savingAll, setSavingAll] = useState(false);
  const [bulkError, setBulkError] = useState(null);

  const resetDrafts = () => {
    setDrafts({});
    setBulkError(null);
  };
  const handleDraftChange = useCallback((areaKey, draft) => {
    setDrafts((d) => {
      const next = { ...d };
      if (draft) next[areaKey] = draft;
      else delete next[areaKey];
      return next;
    });
  }, []);

  useEffect(() => {
    // GET /performance (no filters) also tells us "today" in the school's time zone.
    Promise.all([apiRequest('/students?status=active'), apiRequest('/performance')])
      .then(([{ students }, { today, timeZone }]) => {
        students.sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName));
        setSetup({ loading: false, students, today, timeZone, error: null });
        setDate(today);
      })
      .catch((error) => setSetup((s) => ({ ...s, loading: false, error: error.message })));
  }, []);

  useEffect(() => {
    if (!studentId || !date) return undefined;
    let cancelled = false;
    const forKey = `${studentId}|${date}`;
    apiRequest(`/performance?${new URLSearchParams({ studentId, date })}`)
      .then((data) => !cancelled && setResult({ forKey, evaluations: data.evaluations, error: null }))
      .catch((error) => !cancelled && setResult({ forKey, evaluations: [], error: error.message }));
    return () => {
      cancelled = true;
    };
  }, [studentId, date, reloadKey]);

  const handleSaved = useCallback((saved, text) => {
    setNotice(text);
    setBulkError(null);
    handleDraftChange(saved.area, null);
    setReloadKey((n) => n + 1);
  }, [handleDraftChange]);

  // Saves every changed area that has a star rating, one after another; one sound at the end.
  async function saveAll() {
    const changedAreas = PERFORMANCE_AREAS.filter((a) => drafts[a.key]);
    const unrated = changedAreas.filter((a) => !drafts[a.key].starRating);
    const toSave = changedAreas.filter((a) => drafts[a.key].starRating);
    setNotice(null);
    const problems = unrated.length ? [`Choose a star rating first: ${unrated.map((a) => a.label).join(', ')}.`] : [];
    if (toSave.length === 0) {
      setBulkError(problems.join(' ') || 'There are no changes to save.');
      return;
    }
    if (!navigator.onLine) {
      setBulkError(OFFLINE_MESSAGE);
      return;
    }
    setSavingAll(true);
    setBulkError(null);
    const saved = [];
    for (const area of toSave) {
      const draft = drafts[area.key];
      try {
        await saveAreaEvaluation({ evaluation: draft.evaluation, studentId, date, areaKey: area.key, starRating: draft.starRating, observation: draft.observation });
        saved.push(area);
      } catch (error) {
        const fields = error.details?.fields;
        problems.push(`${area.label} was not saved: ${fields ? Object.values(fields).join(' ') : error.message}`);
      }
    }
    setDrafts((d) => {
      const next = { ...d };
      for (const area of saved) delete next[area.key];
      return next;
    });
    setSavingAll(false);
    setReloadKey((n) => n + 1);
    playSound(problems.length ? 'error' : 'success');
    if (saved.length) setNotice(`Saved ${saved.length} ${saved.length === 1 ? 'area' : 'areas'}: ${saved.map((a) => a.label).join(', ')}.`);
    if (problems.length) setBulkError(problems.join(' '));
  }

  if (setup.loading) return <LoadingState>Loading…</LoadingState>;
  if (setup.error) return <Alert tone="error">{setup.error}</Alert>;

  const student = setup.students.find((s) => s.studentId === studentId);
  const ready = result.forKey === `${studentId}|${date}`;
  const evaluations = ready ? result.evaluations : [];
  const byArea = new Map(evaluations.map((e) => [e.area, e]));
  const average = dailyAverageStarRating(evaluations.map((e) => e.starRating));
  const draftCount = Object.keys(drafts).length;
  const saveAllButton = (
    <button type="button" onClick={saveAll} disabled={savingAll || draftCount === 0} className={buttonClass()}>
      {savingAll ? 'Saving…' : `Save all changes${draftCount ? ` (${draftCount})` : ''}`}
    </button>
  );

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <Field id="performance-student" label="Student" className="min-w-64 flex-1">
            <select
              value={studentId}
              onChange={(e) => {
                setStudentId(e.target.value);
                setNotice(null);
                resetDrafts();
              }}
              className={inputClass()}
            >
              <option value="">Select a student…</option>
              {setup.students.map((s) => (
                <option key={s.studentId} value={s.studentId}>
                  {s.lastName}, {s.firstName} — {s.studentId} ({s.section})
                </option>
              ))}
            </select>
          </Field>
          <Field id="performance-date" label="Evaluation date">
            <input
              type="date"
              value={date}
              max={setup.today}
              onChange={(e) => {
                if (e.target.value) setDate(e.target.value);
                setNotice(null);
                resetDrafts();
              }}
              className={inputClass({ className: 'w-auto' })}
            />
          </Field>
        </div>
      </Card>

      {!student && (
        <EmptyState icon={<StarIcon className="h-6 w-6" />} title="Select a student to see and record their performance." />
      )}

      {student && (
        <div className="space-y-4">
          <Card className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-grape-50 text-base font-bold text-grape-700">
                {`${student.firstName?.[0] ?? ''}${student.lastName?.[0] ?? ''}`.toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="text-lg font-semibold text-brand-900">{studentFullName(student)}</p>
                <p className="text-sm text-brand-500">{formatDate(date)}{date === setup.today && ' (today)'}</p>
              </div>
            </div>
            <div className="rounded-xl bg-sun-50 px-4 py-2 sm:text-right">
              <p className="text-xs font-semibold uppercase tracking-wide text-sun-700">Daily Average Star Rating</p>
              {average === null ? (
                <p className="text-sm font-medium text-brand-700">No ratings yet</p>
              ) : (
                <p className="flex items-center gap-2 sm:justify-end"><StarDisplay value={average} /><span className="text-sm font-semibold text-brand-900">{average} of 5</span></p>
              )}
            </div>
          </Card>

          {notice && <Alert tone="success">{notice}</Alert>}
          {bulkError && <Alert tone="error" role="alert">{bulkError}</Alert>}
          {ready && !result.error && (
            <div className="flex flex-wrap items-center gap-3">
              {saveAllButton}
              <p className="text-sm text-brand-500">Saves every area you changed. Each area can also be saved on its own.</p>
            </div>
          )}
          {ready && result.error && <Alert tone="error">{result.error}</Alert>}

          {!ready ? (
            <LoadingState className="py-6">Loading evaluations…</LoadingState>
          ) : result.error ? null : (
            <ul className="grid gap-4 lg:grid-cols-2" aria-label={`Performance areas for ${studentFullName(student)}`}>
              {PERFORMANCE_AREAS.map((area) => {
                const evaluation = byArea.get(area.key) ?? null;
                return (
                  <AreaEvaluationRow
                    // Remount after each save/reload so the row shows the saved values.
                    key={`${studentId}-${date}-${area.key}-${evaluation?.updatedAt ?? 'new'}`}
                    area={area}
                    evaluation={evaluation}
                    studentId={studentId}
                    date={date}
                    timeZone={setup.timeZone}
                    onSaved={handleSaved}
                    onDraftChange={handleDraftChange}
                    busy={savingAll}
                  />
                );
              })}
            </ul>
          )}
          {ready && !result.error && draftCount > 0 && <div className="flex justify-end">{saveAllButton}</div>}
        </div>
      )}
    </div>
  );
}
