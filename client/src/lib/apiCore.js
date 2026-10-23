// The API request logic used by apiClient.js. It has no Firebase or Vite imports, so it can be
// tested with Node's built-in test runner (client/test/apiClient.test.js).
import { OFFLINE_MESSAGE } from './format.js';

const SERVER_UNAVAILABLE = 'Cannot reach the server. Please try again in a moment.';

export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    // e.g. { fields: { firstName: 'First name is required.' } } for validation errors.
    this.details = details;
  }
}

const browserIsOffline = () => globalThis.navigator?.onLine === false;
const offlineError = () => new ApiError(OFFLINE_MESSAGE, 0, 'network/offline');

/**
 * Returns apiRequest(path, options). `getCurrentUser` returns the signed-in Firebase user (or null).
 * Offline (Phase 12): nothing is sent and the caller gets OFFLINE_MESSAGE. Requests are never
 * queued or retried later - the user repeats the action once they are back online.
 */
export function createApiRequest({ baseUrl, getCurrentUser, fetchImpl = (...args) => globalThis.fetch(...args), isOffline = browserIsOffline }) {
  const apiBaseUrl = (baseUrl || '/api').replace(/\/$/, '');

  async function authHeader(forceRefresh) {
    const user = getCurrentUser();
    // getIdToken() transparently refreshes the token when it is about to expire.
    return user ? { Authorization: `Bearer ${await user.getIdToken(forceRefresh)}` } : {};
  }

  async function sendRequest(path, { method = 'GET', body, headers } = {}, forceRefresh) {
    if (isOffline()) throw offlineError();

    let response;
    try {
      response = await fetchImpl(`${apiBaseUrl}${path}`, {
        method,
        headers: {
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...(await authHeader(forceRefresh)),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw isOffline() ? offlineError() : new ApiError(SERVER_UNAVAILABLE, 0, 'network/unavailable');
    }

    const isJson = response.headers.get('content-type')?.includes('application/json');
    const data = isJson ? await response.json().catch(() => null) : null;

    if (!response.ok) {
      // A non-JSON error means the API itself did not answer (e.g. dev proxy with the server down).
      if (!data?.error) {
        throw new ApiError(SERVER_UNAVAILABLE, response.status, 'network/unavailable');
      }
      throw new ApiError(data.error.message, response.status, data.error.code, data.error.details);
    }

    // Every API answer is a JSON object. Anything else came from something that is not the API,
    // e.g. static hosting answering /api/* with index.html when no backend is deployed behind it.
    if (!data || typeof data !== 'object') {
      throw new ApiError(SERVER_UNAVAILABLE, response.status, 'network/unavailable');
    }

    return data;
  }

  return async function apiRequest(path, options = {}) {
    try {
      return await sendRequest(path, options, false);
    } catch (error) {
      // The server saw a token issued before the user's role changed.
      // Get a fresh token (with the current role claim) and try exactly once more.
      if (error.code === 'auth/claims-stale' && getCurrentUser()) {
        return sendRequest(path, options, true);
      }
      throw error;
    }
  };
}
