// Central place to read and validate environment variables.
// Values are loaded from server/.env by Node's --env-file-if-exists flag.

function parsePort(value, fallback) {
  const port = Number.parseInt(value ?? '', 10);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
}

function parseList(value) {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

// .env files store the private key on one line with literal "\n" sequences.
function parsePrivateKey(value) {
  return value ? value.replace(/\\n/g, '\n') : undefined;
}

// IANA time zone that defines the school day (attendance dates). Fails fast on a typo.
function parseTimeZone(value, fallback) {
  const timeZone = value?.trim() || fallback;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
  } catch {
    throw new Error(`SCHOOL_TIME_ZONE "${timeZone}" is not a valid IANA time zone (e.g. Asia/Manila).`);
  }
  return timeZone;
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
// Error details (stack traces, internal messages) are returned ONLY when NODE_ENV is explicitly
// development or test. An unset NODE_ENV behaves like development otherwise, but never leaks them.
const debugErrors = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';

// "iprog" (real SMS, default), "philsms" (real SMS, legacy) or "mock" (logs instead of
// sending; for development/tests only).
function parseSmsProvider(value) {
  const provider = value?.trim() || 'iprog';
  if (!['iprog', 'philsms', 'mock'].includes(provider)) {
    throw new Error(`SMS_PROVIDER "${provider}" is not supported (use iprog, philsms or mock).`);
  }
  if (provider === 'mock' && nodeEnv === 'production') {
    throw new Error('SMS_PROVIDER=mock is not allowed in production.');
  }
  return provider;
}

export const env = Object.freeze({
  nodeEnv,
  isProduction: nodeEnv === 'production',
  nodeEnvSet: Boolean(process.env.NODE_ENV),
  debugErrors,
  port: parsePort(process.env.PORT, 5000),
  clientOrigins: parseList(process.env.CLIENT_ORIGIN ?? 'http://localhost:5173'),
  schoolTimeZone: parseTimeZone(process.env.SCHOOL_TIME_ZONE, 'Asia/Manila'),
  firebase: Object.freeze({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: parsePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
    // Read automatically by the Admin SDK. Set only for local emulator testing.
    authEmulatorHost: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  }),
  // SECRET: backend only. Never logged, never returned to clients, never stored in Firestore.
  sms: Object.freeze({
    provider: parseSmsProvider(process.env.SMS_PROVIDER),
    iprogApiToken: process.env.IPROG_SMS_API_TOKEN?.trim() || null,
    philsmsApiToken: process.env.PHILSMS_API_TOKEN?.trim() || null,
    philsmsSenderId: process.env.PHILSMS_SENDER_ID?.trim() || null,
  }),
});
