// IPROG SMS provider tests. Every HTTP call goes to a fake fetch: no real SMS is ever sent
// and no real token is needed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IPROG_SEND_URL, createIprogSmsProvider } from '../src/services/sms/iprog.provider.js';

const TOKEN = 'test-iprog-token-0123456789abcdef0123456789';
const TO = '+639171234567';

/** Fake fetch that records each call and replies with `status` + `body` (object or raw string). */
function fakeFetch(status, body) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    return { ok: status >= 200 && status < 300, status, text: async () => text };
  };
  return { impl, calls };
}

const provider = (fetchImpl, extra = {}) => createIprogSmsProvider({ apiToken: TOKEN, fetchImpl, ...extra });

test('successful IPROG response returns ok with the message_id', async () => {
  const { impl } = fakeFetch(200, { status: 200, message: 'Your SMS message has been successfully added to the queue.', message_id: 'iSms-XHYBk' });
  const result = await provider(impl).send({ to: TO, message: 'Hello' });
  assert.deepEqual(result, { ok: true, providerMessageId: 'iSms-XHYBk', error: null });
});

test('sends a JSON POST with api_token, phone_number (639XXXXXXXXX) and message', async () => {
  const { impl, calls } = fakeFetch(200, { status: 200, message_id: 'iSms-1' });
  await provider(impl).send({ to: TO, message: 'Juan arrived at 7:45 AM.' });
  assert.equal(calls.length, 1);
  const { url, init } = calls[0];
  assert.equal(url, IPROG_SEND_URL);
  assert.equal(url, 'https://www.iprogsms.com/api/v1/sms_messages');
  assert.ok(!url.includes(TOKEN), 'token must not be in the URL');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers['Content-Type'], 'application/json');
  assert.ok(init.signal instanceof AbortSignal, 'request must have a timeout signal');
  const body = JSON.parse(init.body);
  assert.deepEqual(body, { api_token: TOKEN, phone_number: '639171234567', message: 'Juan arrived at 7:45 AM.' });
  assert.match(body.phone_number, /^639\d{9}$/);
});

test('rejects recipients not in +639XXXXXXXXX form without calling IPROG', async () => {
  for (const to of ['09171234567', '639171234567', '+63917123456', '+1234567890123', null]) {
    const { impl, calls } = fakeFetch(200, { status: 200 });
    const result = await provider(impl).send({ to, message: 'x' });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'invalid-recipient');
    assert.equal(calls.length, 0);
  }
});

test('missing API token is a not-configured failure and makes no request', async () => {
  for (const apiToken of [null, undefined, '']) {
    const { impl, calls } = fakeFetch(200, { status: 200 });
    const result = await createIprogSmsProvider({ apiToken, fetchImpl: impl }).send({ to: TO, message: 'x' });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'not-configured');
    assert.match(result.error.message, /IPROG_SMS_API_TOKEN/);
    assert.equal(calls.length, 0);
  }
});

test('non-2xx HTTP response is an http-error with IPROG\'s reason and status', async () => {
  const { impl } = fakeFetch(401, { status: 401, message: 'Invalid api token' });
  const result = await provider(impl).send({ to: TO, message: 'x' });
  assert.equal(result.ok, false);
  assert.equal(result.providerMessageId, null);
  assert.equal(result.error.code, 'http-error');
  assert.equal(result.error.httpStatus, 401);
  assert.equal(result.error.message, 'IPROG error (HTTP 401): Invalid api token');
});

test('HTTP 200 with a non-200 body status is a provider-error (message list supported)', async () => {
  const { impl } = fakeFetch(200, { status: 500, message: ['Insufficient credits', 'Try again later'] });
  const result = await provider(impl).send({ to: TO, message: 'x' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'provider-error');
  assert.equal(result.error.message, 'IPROG error (HTTP 200): Insufficient credits; Try again later');
});

test('non-JSON response is reported safely', async () => {
  const { impl } = fakeFetch(502, '<html>Bad Gateway</html>');
  const result = await provider(impl).send({ to: TO, message: 'x' });
  assert.equal(result.error.code, 'http-error');
  assert.equal(result.error.message, 'IPROG error (HTTP 502): the response was not JSON.');
});

test('provider error text never carries the API token', async () => {
  const { impl } = fakeFetch(422, { status: 422, message: `Invalid api_token=${TOKEN} for ${TOKEN}` });
  const result = await provider(impl).send({ to: TO, message: 'x' });
  assert.equal(result.ok, false);
  assert.ok(!JSON.stringify(result).includes(TOKEN));
});

test('network failure is a network-error and never throws', async () => {
  const impl = async () => { throw new TypeError('fetch failed'); };
  const result = await provider(impl).send({ to: TO, message: 'x' });
  assert.deepEqual(result.error, { code: 'network-error', message: 'Could not reach IPROG.' });
});

test('timeout is a timeout failure', async () => {
  // Never resolves on its own; rejects when the provider's timeout signal aborts.
  const impl = (url, init) => new Promise((resolve, reject) => {
    init.signal.addEventListener('abort', () => reject(init.signal.reason));
  });
  const result = await provider(impl, { timeoutMs: 20 }).send({ to: TO, message: 'x' });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, 'timeout');
});

test('provider never logs the token', async () => {
  const logged = [];
  const originals = {};
  for (const level of ['log', 'info', 'warn', 'error']) {
    originals[level] = console[level];
    console[level] = (...args) => logged.push(args.join(' '));
  }
  try {
    await provider(fakeFetch(200, { status: 200, message_id: 'a' }).impl).send({ to: TO, message: 'x' });
    await provider(fakeFetch(500, { message: TOKEN }).impl).send({ to: TO, message: 'x' });
  } finally {
    Object.assign(console, originals);
  }
  assert.ok(!logged.join('\n').includes(TOKEN));
});

// --- the token must never reach the React client --------------------------------------
const clientDir = fileURLToPath(new URL('../../client/', import.meta.url));

function filesUnder(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules') return [];
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

/** The real token from server/.env, if one is set (never printed). */
function realToken() {
  const envFile = fileURLToPath(new URL('../.env', import.meta.url));
  if (!existsSync(envFile)) return null;
  const match = readFileSync(envFile, 'utf8').match(/^\s*IPROG_SMS_API_TOKEN\s*=\s*"?([^"\r\n]*)"?/m);
  return match?.[1].trim() || null;
}

test('IPROG token is not exposed in client code, client env files, or the client build', () => {
  const token = realToken();
  const files = [
    ...filesUnder(join(clientDir, 'src')),
    ...filesUnder(join(clientDir, 'dist')),
    ...readdirSync(clientDir).filter((n) => n.startsWith('.env')).map((n) => join(clientDir, n)),
  ];
  assert.ok(files.length > 0, 'client files were found');
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    assert.ok(!/IPROG_SMS_API_TOKEN|VITE_[A-Z_]*IPROG/i.test(text), `${file} references the IPROG token variable`);
    if (token) assert.ok(!text.includes(token), `${file} contains the IPROG API token`);
  }
});
