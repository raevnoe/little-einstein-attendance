// Firebase Admin SDK - server only. Credentials come from the server's environment (server/.env
// locally, the host's secret environment variables when deployed) and never reach the client.
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { env } from './env.js';

function buildAppOptions() {
  const { projectId, clientEmail, privateKey, authEmulatorHost } = env.firebase;

  if (!projectId) {
    throw new Error('FIREBASE_PROJECT_ID is not set. Copy server/.env.example to server/.env and fill it in.');
  }

  if (clientEmail && privateKey) {
    return { credential: cert({ projectId, clientEmail, privateKey }), projectId };
  }

  // The Auth emulator accepts unsigned tokens, so no service account is needed there.
  if (authEmulatorHost && !env.isProduction) {
    return { projectId };
  }

  throw new Error('FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY are required (from a Firebase service account key).');
}

const app = getApps()[0] ?? initializeApp(buildAppOptions());

if (env.firebase.authEmulatorHost) {
  console.warn(`[firebase] Using Auth EMULATOR at ${env.firebase.authEmulatorHost} (development only)`);
}

export const adminAuth = getAuth(app);
export const db = getFirestore(app);
