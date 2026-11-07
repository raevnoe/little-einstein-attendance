import { useEffect, useState } from 'react';
import { DEFAULT_SUBJECTS, subjectLabel } from '@led/shared';
import { apiRequest } from './apiClient.js';

// The school's subject list (GET /api/subjects), loaded once per page visit and shared by every
// screen. Until it arrives (or if it cannot be loaded) the starting list is used, so screens never
// wait for it. The admin Subjects panel calls setSubjects() after a change so open screens follow.
let current = DEFAULT_SUBJECTS;
let request = null;
const listeners = new Set();

export function setSubjects(subjects) {
  current = subjects;
  for (const listener of listeners) listener(subjects);
}

function load() {
  request ??= apiRequest('/subjects')
    .then(({ subjects }) => setSubjects(subjects))
    .catch(() => {
      request = null; // try again on the next screen that needs it
    });
  return request;
}

/**
 * { subjects, visible, label(key) }: `subjects` includes hidden ones (for filters and past records),
 * `visible` is what can get new evaluations.
 */
export function useSubjects() {
  const [subjects, setState] = useState(current);
  useEffect(() => {
    listeners.add(setState);
    load();
    return () => listeners.delete(setState);
  }, []);
  return {
    subjects,
    visible: subjects.filter((s) => !s.hidden),
    label: (key) => subjectLabel(subjects, key),
  };
}
