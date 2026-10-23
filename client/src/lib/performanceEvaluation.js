// Helpers for the teacher's Performance Evaluation screen.
import { apiRequest } from './apiClient.js';

/**
 * Saves one area for one student and day: edits the existing evaluation (PATCH) or creates it
 * (POST). Used by each area's own Save button and by "Save all". Returns the saved evaluation.
 */
export async function saveAreaEvaluation({ evaluation, studentId, date, areaKey, starRating, observation }) {
  const { evaluation: saved } = evaluation
    ? await apiRequest(`/performance/${encodeURIComponent(evaluation.id)}`, { method: 'PATCH', body: { starRating, observation } })
    : await apiRequest('/performance', { method: 'POST', body: { studentId, evaluationDate: date, area: areaKey, starRating, observation } });
  return saved;
}
