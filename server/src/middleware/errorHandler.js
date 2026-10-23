import { env } from '../config/env.js';

// Final error handler. Stack traces and internal messages are returned only when NODE_ENV is
// explicitly development or test (never in production, never when NODE_ENV is unset).
// Express identifies error handlers by their 4 parameters, so `next` must stay.
export function errorHandler(err, req, res, next) {
  const status = Number.isInteger(err.status) ? err.status : 500;

  if (status >= 500 && !err.expose) {
    console.error(err);
  }

  // HttpError messages are written for clients; other 5xx messages may contain internals.
  const safeMessage = err.expose || status < 500 ? err.message : 'Internal server error';

  res.status(status).json({
    error: {
      code: err.code && err.expose ? err.code : undefined,
      message: env.debugErrors ? err.message : safeMessage,
      details: err.expose ? err.details : undefined,
      ...(env.debugErrors && !err.expose ? { stack: err.stack } : {}),
    },
  });
}
