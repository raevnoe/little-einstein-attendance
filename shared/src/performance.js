// Behavioral Evaluation constants shared by client and server (the server is the authority).
// (Code names still say "performance": the feature was renamed on screen after the panel review;
// the collection, API paths and constants keep their original names so nothing breaks.)
// This is a daily kindergarten observation of the child's BEHAVIOR in each subject, with a visual 1-5
// star rating and a comment. It is NOT an academic grade: no percentages, letter grades, GPA or grade
// computation.

// Subjects. Teachers rate the child's behavior during each one. `key` is stored and is part of the
// document ID, so keys must stay lowercase letters and hyphens and must never be renamed once
// records exist. To change the list, edit it here (labels may change freely).
export const PERFORMANCE_AREAS = Object.freeze([
  Object.freeze({ key: 'language', label: 'Language' }),
  Object.freeze({ key: 'mathematics', label: 'Mathematics' }),
  Object.freeze({ key: 'science', label: 'Science' }),
  Object.freeze({ key: 'social-skills', label: 'Social Skills' }),
  Object.freeze({ key: 'motor-skills', label: 'Motor Skills' }),
  Object.freeze({ key: 'classroom-behavior', label: 'Classroom Behavior' }),
]);

export const PERFORMANCE_AREA_KEYS = Object.freeze(PERFORMANCE_AREAS.map((a) => a.key));

// Behavior areas used for a short time (2026-11-02 to 2026-11-06) instead of subjects: records saved
// under them still show a readable name. They can no longer be chosen for new evaluations.
const RETIRED_AREA_LABELS = Object.freeze({
  'following-directions': 'Following Directions',
  'sharing-cooperation': 'Sharing and Cooperation',
  'self-control': 'Self-Control',
  'class-participation': 'Class Participation',
  'manners-respect': 'Good Manners and Respect',
  independence: 'Independence',
});

export const performanceAreaLabel = (key) =>
  PERFORMANCE_AREAS.find((a) => a.key === key)?.label ?? RETIRED_AREA_LABELS[key] ?? key;

export const MIN_STAR_RATING = 1;
export const MAX_STAR_RATING = 5;
export const MAX_OBSERVATION_LENGTH = 500;

/**
 * Daily Average Star Rating: a visual summary of one day's star ratings, rounded to
 * one decimal (e.g. 3.7). It is not a grade. Returns null when there are no ratings.
 */
export function dailyAverageStarRating(ratings) {
  if (!ratings.length) return null;
  return Math.round((ratings.reduce((sum, r) => sum + r, 0) / ratings.length) * 10) / 10;
}

// A word for each star rating, shown next to the stars so teachers rate consistently and parents
// understand them. Still a daily observation, not a grade.
export const STAR_RATING_LABELS = Object.freeze({
  1: 'Needs support',
  2: 'Developing',
  3: 'Good',
  4: 'Very good',
  5: 'Excellent',
});

export const starRatingLabel = (rating) => STAR_RATING_LABELS[rating] ?? '';

// Quick phrases a teacher can tap to add to an observation (they can still type anything).
export const OBSERVATION_PHRASES = Object.freeze({
  positive: Object.freeze([
    'Followed instructions well',
    'Shared and took turns',
    'Stayed calm and patient',
    'Joined activities happily',
    'Was kind and polite',
    'Tidied up on their own',
  ]),
  support: Object.freeze([
    'Needed reminders to listen',
    'Needed help to share',
    'Got upset easily',
    'Was easily distracted',
    'Needed help to finish tasks',
  ]),
});

// ---- School-managed subject list (systemSettings/subjects; admins add, rename, hide and reorder).
// PERFORMANCE_AREAS above is only the STARTING list, used until an admin saves the first change.
// A subject is never deleted (hidden instead), so every saved evaluation keeps its subject.
export const SUBJECT_KEY_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const SUBJECT_KEY_MAX_LENGTH = 40;
export const SUBJECT_LABEL_MAX_LENGTH = 40;
export const MAX_SUBJECTS = 20;

export const DEFAULT_SUBJECTS = Object.freeze(PERFORMANCE_AREAS.map((a) => Object.freeze({ key: a.key, label: a.label, hidden: false })));

/** "Filipino 2" -> "filipino-2" (the stored key; fixed once created). */
export const subjectKeyFromLabel = (label) => String(label ?? '')
  .normalize('NFD').replace(/\p{M}/gu, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  .replace(/^[0-9-]+/, '')
  .slice(0, SUBJECT_KEY_MAX_LENGTH).replace(/-+$/, '');

/** { value } or { error } for a subject name: letters and numbers with spaces, & - . ' ( ). */
export function validateSubjectLabel(value) {
  const label = typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  if (!label) return { error: 'Subject name is required.' };
  if (label.length > SUBJECT_LABEL_MAX_LENGTH) return { error: `Subject name must be ${SUBJECT_LABEL_MAX_LENGTH} characters or fewer.` };
  if (!/^\p{L}[\p{L}\p{N} &.'()-]*$/u.test(label)) {
    return { error: 'Subject name must start with a letter and use only letters, numbers, spaces and & . \' ( ) -' };
  }
  return { value: label };
}

/** The name to show for a subject key, from the school's list (hidden ones included), else a known older name. */
export const subjectLabel = (subjects, key) => subjects?.find((s) => s.key === key)?.label ?? performanceAreaLabel(key);
