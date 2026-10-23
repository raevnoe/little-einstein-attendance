// Firebase Web SDK. Only PUBLIC web-app config lives here (VITE_* variables).
// The client uses Firebase for sign-in only; all data goes through the Express API.
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const REQUIRED_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'];
const missingKeys = REQUIRED_KEYS.filter((key) => !firebaseConfig[key]);

export const firebaseConfigError = missingKeys.length
  ? `Firebase is not configured. Missing: ${missingKeys.join(', ')}. See client/.env.example.`
  : null;

export const auth = firebaseConfigError ? null : getAuth(initializeApp(firebaseConfig));

const emulatorHost = import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_HOST;
if (auth && emulatorHost && import.meta.env.DEV) {
  connectAuthEmulator(auth, `http://${emulatorHost}`, { disableWarnings: true });
}
