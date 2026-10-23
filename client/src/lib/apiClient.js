// Thin fetch wrapper for calling the Express API (request logic: apiCore.js).
// In development, Vite proxies /api to the backend (see vite.config.js).
// When a user is signed in, their Firebase ID token is sent as a Bearer token.
// While the browser is offline, no request is sent: the caller gets OFFLINE_MESSAGE.
import { auth } from './firebase.js';
import { ApiError, createApiRequest } from './apiCore.js';

export { ApiError };

export const apiRequest = createApiRequest({
  baseUrl: import.meta.env.VITE_API_BASE_URL,
  getCurrentUser: () => auth?.currentUser ?? null,
});
