// Which students a staff member may work with. Admins: every section. Teachers: only the sections an
// admin assigned to them (users/{uid}.sections), read from the server-side profile that requireRole
// loads on every request - never from the request itself. A teacher with no section sees no students.
// Out-of-scope records answer "not found" (404), the same as a record that does not exist.
import { ROLES } from '@led/shared';
import { sectionKey } from '../models/section.model.js';

export const ALL_SECTIONS = Object.freeze({ all: true, keys: null });

/** The scope of the signed-in staff member (requireRole has set req.user and req.profile). */
export function scopeFor(req) {
  if (req.user?.role === ROLES.ADMIN) return ALL_SECTIONS;
  const sections = Array.isArray(req.profile?.sections) ? req.profile.sections : [];
  return Object.freeze({ all: false, keys: new Set(sections.map(sectionKey)) });
}

/** True when the scope covers this section name. */
export const sectionInScope = (scope, section) => scope.all || scope.keys.has(sectionKey(section));

/** True when the scope covers this student (a missing student is never in scope). */
export const studentInScope = (scope, student) => Boolean(student) && sectionInScope(scope, student.section);
