// Input rules shared by client and server. The server is the authority for everything it stores;
// passwords never reach our server (Firebase Authentication handles them), so the PASSWORD rules are
// applied by every screen where a password is chosen (Settings -> Change password, and the set/reset
// password page that the setup email opens).

// ---- person names (students, accounts, pick-up people)
export const PERSON_NAME_MAX_LENGTH = 60;

// Letters (any language, e.g. "Ñ", "É"), joined by single spaces, hyphens or apostrophes; a period may
// follow a word ("Ma. Clara", "Jr."). No digits, no symbols, no doubled punctuation ("--", "..").
const WORD = "\\p{L}[\\p{L}\\p{M}]*";
export const PERSON_NAME_PATTERN = new RegExp(`^${WORD}(?:(?:\\. ?|[ '-])${WORD})*\\.?$`, 'u');

/** Trims and collapses spaces. */
export const cleanName = (value) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '');

/** { value } or { error } for a person's name. `required: false` allows an empty value (''). */
export function validatePersonName(value, { label, required = true, max = PERSON_NAME_MAX_LENGTH } = {}) {
  const name = cleanName(value);
  if (!name) return required ? { error: `${label} is required.` } : { value: '' };
  if (name.length > max) return { error: `${label} must be ${max} characters or fewer.` };
  if (/\p{N}/u.test(name)) return { error: `${label} cannot contain numbers.` };
  if (!PERSON_NAME_PATTERN.test(name)) {
    return { error: `${label} may only contain letters, with single spaces, hyphens, apostrophes or periods between them.` };
  }
  return { value: name };
}

// ---- passwords
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;

// Passwords people often try first; a strong-looking variant of these is still easy to guess.
const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', 'p@ssw0rd', 'passw0rd', 'qwerty123', 'qwertyuiop', 'abcd1234', 'abc12345',
  '12345678', '123456789', '1234567890', 'iloveyou', 'welcome1', 'welcome123', 'admin123', 'teacher123', 'parent123',
  'littleeinstein', 'einstein123', 'kindergarten',
]);

// Each rule: { id, label, test(password) }. The screen shows them as a checklist.
export const PASSWORD_RULES = Object.freeze([
  Object.freeze({ id: 'length', label: `At least ${MIN_PASSWORD_LENGTH} characters`, test: (p) => p.length >= MIN_PASSWORD_LENGTH }),
  Object.freeze({ id: 'upper', label: 'An uppercase letter (A-Z)', test: (p) => /\p{Lu}/u.test(p) }),
  Object.freeze({ id: 'lower', label: 'A lowercase letter (a-z)', test: (p) => /\p{Ll}/u.test(p) }),
  Object.freeze({ id: 'number', label: 'A number (0-9)', test: (p) => /\p{N}/u.test(p) }),
  Object.freeze({ id: 'special', label: 'A special character (e.g. ! @ # $ %)', test: (p) => /[^\p{L}\p{N}\s]/u.test(p) }),
]);

/**
 * Problems with a new password, as sentences ([] = acceptable): every rule above, plus not too long,
 * not a common password, and not containing the person's email name or first/last name.
 */
export function passwordProblems(password, { email = '', names = [] } = {}) {
  const p = typeof password === 'string' ? password : '';
  const problems = PASSWORD_RULES.filter((rule) => !rule.test(p)).map((rule) => rule.label);
  if (p.length > MAX_PASSWORD_LENGTH) problems.push(`At most ${MAX_PASSWORD_LENGTH} characters`);
  const lower = p.toLowerCase();
  const plain = lower.replace(/[^a-z0-9]/g, '');
  if (COMMON_PASSWORDS.has(lower) || COMMON_PASSWORDS.has(plain)) problems.push('Not a common password');
  const personal = [String(email).split('@')[0], ...names]
    .map((s) => String(s ?? '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((s) => s.length >= 3);
  if (personal.some((s) => lower.replace(/[^\p{L}\p{N}]/gu, '').includes(s))) problems.push('Does not contain your name or email');
  return problems;
}

/** 0-4 for a strength meter: rules met, plus length beyond the minimum. Problems keep it at most 2. */
export function passwordStrength(password, context) {
  const p = typeof password === 'string' ? password : '';
  if (!p) return 0;
  const met = PASSWORD_RULES.filter((rule) => rule.test(p)).length; // 0-5
  let score = met <= 2 ? 1 : met <= 4 ? 2 : 3;
  if (met === PASSWORD_RULES.length && p.length >= 12) score = 4;
  return passwordProblems(p, context).length ? Math.min(score, 2) : score;
}

export const PASSWORD_STRENGTH_LABELS = Object.freeze(['', 'Weak', 'Fair', 'Strong', 'Very strong']);

// ---- free text that must say something (reasons, notes)
/** True when the text has at least one letter (rejects "...", "123", "!!!"). */
export const hasLetters = (text) => /\p{L}/u.test(String(text ?? ''));
