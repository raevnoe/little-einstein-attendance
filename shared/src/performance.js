// Behavioral Evaluation constants shared by client and server (the server is the authority).
// (Code names still say "performance": the feature was renamed on screen after the panel review;
// the collection, API paths and constants keep their original names so nothing breaks.)
// This is a daily kindergarten observation of behavior with a visual 1-5 star rating. It is NOT
// an academic grade: no percentages, letter grades, GPA or grade computation.

// Behavior areas. `key` is stored and is part of the document ID, so keys must stay
// lowercase letters and hyphens and must never be renamed once records exist.
// To change the list, edit it here (labels may change freely).
export const PERFORMANCE_AREAS = Object.freeze([
  Object.freeze({ key: 'following-directions', label: 'Following Directions' }),
  Object.freeze({ key: 'sharing-cooperation', label: 'Sharing and Cooperation' }),
  Object.freeze({ key: 'self-control', label: 'Self-Control' }),
  Object.freeze({ key: 'class-participation', label: 'Class Participation' }),
  Object.freeze({ key: 'manners-respect', label: 'Good Manners and Respect' }),
  Object.freeze({ key: 'independence', label: 'Independence' }),
]);

export const PERFORMANCE_AREA_KEYS = Object.freeze(PERFORMANCE_AREAS.map((a) => a.key));

// Areas used before the switch to behavior areas: records saved under them still show a readable
// name. They can no longer be chosen for new evaluations.
const RETIRED_AREA_LABELS = Object.freeze({
  language: 'Language',
  mathematics: 'Mathematics',
  science: 'Science',
  'social-skills': 'Social Skills',
  'motor-skills': 'Motor Skills',
  'classroom-behavior': 'Classroom Behavior',
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
