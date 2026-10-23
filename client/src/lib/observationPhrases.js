// Quick phrases in a teacher's observation (pure functions, tested without a browser).

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const phrasePattern = (phrase) => new RegExp(`(^|\\s)${escapeRegExp(phrase)}\\.?(?=\\s|$)`, 'i');

/** True when the observation already contains the quick phrase. */
export function hasPhrase(text, phrase) {
  return phrasePattern(phrase).test(text ?? '');
}

/**
 * Adds the quick phrase as a sentence ("… Followed instructions."), or removes it when it is
 * already there. Returns the text unchanged if adding it would pass `maxLength`.
 */
export function togglePhrase(text, phrase, maxLength = Infinity) {
  const current = text ?? '';
  if (hasPhrase(current, phrase)) {
    return current.replace(phrasePattern(phrase), '$1').replace(/\s{2,}/g, ' ').trim();
  }
  let base = current.trim();
  if (base && !/[.!?]$/.test(base)) base += '.';
  const next = `${base ? `${base} ` : ''}${phrase}.`;
  return next.length > maxLength ? current : next;
}
