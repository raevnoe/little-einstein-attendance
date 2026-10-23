// Application roles. The authoritative role is the Firebase Custom Claim
// verified on the backend; the client only uses these for display/routing.
// Fetchers are intentionally NOT a role: they have no application account
// and are verified by a teacher during dismissal.
export const ROLES = Object.freeze({
  ADMIN: 'admin',
  TEACHER: 'teacher',
  PARENT: 'parent',
});

export const ALL_ROLES = Object.freeze(Object.values(ROLES));
