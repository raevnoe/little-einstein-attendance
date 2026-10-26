import { useState } from 'react';
import { MAX_OBSERVATION_LENGTH, OBSERVATION_PHRASES } from '@led/shared';
import { OFFLINE_MESSAGE, formatTime } from '../../lib/format.js';
import { hasPhrase, togglePhrase } from '../../lib/observationPhrases.js';
import { saveAreaEvaluation } from '../../lib/performanceEvaluation.js';
import { playSound } from '../../lib/sounds.js';
import { StarInput } from './StarRating.jsx';
import Badge from '../ui/Badge.jsx';
import { FOCUS_RING, buttonClass, inputClass } from '../ui/classes.js';

/** One quick-phrase chip: adds the phrase to the observation, or removes it when already there. */
function PhraseChip({ phrase, tone, pressed, disabled, onToggle }) {
  const colors = pressed
    ? tone === 'positive' ? 'bg-leaf-50 text-leaf-700 ring-leaf-400' : 'bg-sun-50 text-brand-900 ring-sun-400'
    : 'bg-paper text-brand-700 ring-brand-200 hover:bg-canvas';
  return (
    <button
      type="button"
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onToggle}
      className={`min-h-9 rounded-full px-3 text-xs font-semibold ring-1 disabled:cursor-not-allowed disabled:opacity-60 ${colors} ${FOCUS_RING}`}
    >
      {pressed ? '✓ ' : '+ '}{phrase}
    </button>
  );
}

/**
 * One performance area for the selected student and date. Creates the evaluation if
 * there is none yet, otherwise edits the existing one (never a second record).
 * The server records who saved it and when.
 * `onDraftChange(areaKey, draft | null)` tells the screen about unsaved changes, for "Save all".
 */
export default function AreaEvaluationRow({ area, evaluation, studentId, date, timeZone, onSaved, onDraftChange, busy = false }) {
  const [starRating, setStarRating] = useState(evaluation?.starRating ?? null);
  const [observation, setObservation] = useState(evaluation?.observation ?? '');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const isChanged = (rating, text) => rating !== (evaluation?.starRating ?? null) || text.trim() !== (evaluation?.observation ?? '');
  const changed = isChanged(starRating, observation);
  const locked = saving || busy;

  // Every edit goes through here so the screen's "Save all" always knows this area's draft.
  function update({ starRating: rating = starRating, observation: text = observation }) {
    setStarRating(rating);
    setObservation(text);
    setMessage(null);
    onDraftChange?.(area.key, isChanged(rating, text) ? { evaluation, starRating: rating, observation: text } : null);
  }

  async function handleSave() {
    if (!starRating) {
      setMessage({ error: true, text: 'Choose a star rating first.' });
      return;
    }
    if (!navigator.onLine) {
      setMessage({ error: true, text: OFFLINE_MESSAGE });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const saved = await saveAreaEvaluation({ evaluation, studentId, date, areaKey: area.key, starRating, observation });
      playSound('success');
      onSaved(saved, `${area.label} saved.`);
    } catch (error) {
      playSound('error');
      const fields = error.details?.fields;
      setMessage({ error: true, text: fields ? Object.values(fields).join(' ') : error.message });
      setSaving(false);
    }
  }

  const phraseGroups = [
    { tone: 'positive', label: 'Doing well', phrases: OBSERVATION_PHRASES.positive },
    { tone: 'support', label: 'Needs support', phrases: OBSERVATION_PHRASES.support },
  ];

  return (
    <li className="rounded-2xl border border-brand-100 bg-paper p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-base font-semibold text-brand-900">{area.label}</h3>
        {changed ? (
          <Badge tone="warning">Unsaved changes</Badge>
        ) : evaluation ? (
          <Badge tone="success">
            {`Saved${evaluation.teacherName ? ` by ${evaluation.teacherName}` : ''} at ${formatTime(evaluation.updatedAt, timeZone)}`}
          </Badge>
        ) : (
          <Badge>Not yet evaluated</Badge>
        )}
      </div>
      <div className="mt-3 space-y-3">
        <StarInput value={starRating} onChange={(n) => update({ starRating: n })} disabled={locked} label={`${area.label} star rating`} />
        <label htmlFor={`observation-${area.key}`} className="sr-only">{area.label} observation</label>
        <textarea
          id={`observation-${area.key}`}
          value={observation}
          onChange={(e) => update({ observation: e.target.value })}
          disabled={locked}
          rows={2}
          maxLength={MAX_OBSERVATION_LENGTH}
          placeholder="Teacher note / observation (optional)"
          className={inputClass({ className: 'mt-0 text-sm' })}
        />
        {/* Quick phrases: tap to add to the note (tap again to remove). The note stays editable. */}
        <div className="space-y-1.5">
          {phraseGroups.map((group) => (
            <div key={group.tone} role="group" aria-label={`${area.label}: quick phrases, ${group.label.toLowerCase()}`} className="flex flex-wrap items-center gap-1.5">
              <span className="w-full text-xs font-semibold text-brand-500 sm:w-auto sm:pr-1">{group.label}:</span>
              {group.phrases.map((phrase) => (
                <PhraseChip
                  key={phrase}
                  phrase={phrase}
                  tone={group.tone}
                  pressed={hasPhrase(observation, phrase)}
                  disabled={locked}
                  onToggle={() => update({ observation: togglePhrase(observation, phrase, MAX_OBSERVATION_LENGTH) })}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={handleSave} disabled={locked || !changed} className={buttonClass()}>
            {saving ? 'Saving…' : evaluation ? 'Save changes' : 'Save evaluation'}
          </button>
          {message && (
            <p role={message.error ? 'alert' : 'status'} className={`text-sm font-medium ${message.error ? 'text-red-700' : 'text-leaf-700'}`}>
              {message.text}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
