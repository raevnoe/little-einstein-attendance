// Student Performance Evaluation constants shared by client and server (the server is the authority).
// This is a daily kindergarten observation with a visual 1-5 star rating. It is NOT
// an academic grade: no percentages, letter grades, GPA or grade computation.

// Performance areas. `key` is stored and is part of the document ID, so keys must stay
// lowercase letters and hyphens and must never be renamed once records exist.
// To change the list, edit it here (labels may change freely).
export const PERFORMANCE_AREAS = Object.freeze([
  Object.freeze({ key: 'language', label: 'Language' }),
  Object.freeze({ key: 'mathematics', label: 'Mathematics' }),
  Object.freeze({ key: 'science', label: 'Science' }),
  Object.freeze({ key: 'social-skills', label: 'Social Skills' }),
  Object.freeze({ key: 'motor-skills', label: 'Motor Skills' }),
  Object.freeze({ key: 'classroom-behavior', label: 'Classroom Behavior' }),
]);

export const PERFORMANCE_AREA_KEYS = Object.freeze(PERFORMANCE_AREAS.map((a) => a.key));

export const performanceAreaLabel = (key) => PERFORMANCE_AREAS.find((a) => a.key === key)?.label ?? key;

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
    'Participated actively',
    'Followed instructions',
    'Worked well with classmates',
    'Showed improvement',
    'Completed the activity',
  ]),
  support: Object.freeze([
    'Needs more practice',
    'Needed reminders',
    'Needed help to finish',
    'Was easily distracted',
  ]),
});
