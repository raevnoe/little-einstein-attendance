// Vercel serverless entry for the Express API (deployment only; local development runs
// server/src/index.js). vercel.json sends every /api/* request here and Express still sees the
// original path, so all routes, middleware and authorization are exactly the same as locally.
import { createApp } from '../server/src/app.js';

export default createApp();
