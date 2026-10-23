import { createApp } from './app.js';
import { env } from './config/env.js';

if (!env.nodeEnvSet) {
  console.warn('[server] WARNING: NODE_ENV is not set. Using development defaults (error details hidden). Set NODE_ENV=production when deploying.');
} else if (!env.isProduction) {
  console.warn(`[server] Running with NODE_ENV=${env.nodeEnv}: development settings are active. Never use this for the live school system.`);
}

const app = createApp();

app.listen(env.port, () => {
  console.log(`[server] ${env.nodeEnv} API listening on http://localhost:${env.port}/api`);
});
