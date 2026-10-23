// Error details per NODE_ENV. Each case runs a tiny script in a separate Node process, because
// config/env.js reads NODE_ENV once at start-up.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

const errorHandlerUrl = new URL('../src/middleware/errorHandler.js', import.meta.url).href;

/** Runs errorHandler on an unexpected error under the given NODE_ENV; returns the JSON body. */
function errorBodyUnder(nodeEnv) {
  const script = `
    console.error = () => {};
    const { errorHandler } = await import(${JSON.stringify(errorHandlerUrl)});
    let body;
    const res = { status() { return this; }, json(b) { body = b; } };
    errorHandler(new Error('db path users/x failed'), {}, res, () => {});
    process.stdout.write(JSON.stringify(body));
  `;
  const env = { ...process.env, SMS_PROVIDER: nodeEnv === 'production' ? 'iprog' : 'mock' };
  if (nodeEnv === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = nodeEnv;
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', script], { env, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return JSON.parse(run.stdout).error;
}

describe('error details by environment', () => {
  test('production: generic message, no stack', () => {
    assert.deepEqual(errorBodyUnder('production'), { message: 'Internal server error' });
  });

  test('NODE_ENV not set: generic message, no stack', () => {
    assert.deepEqual(errorBodyUnder(undefined), { message: 'Internal server error' });
  });

  test('development: full message and stack (local debugging unchanged)', () => {
    const body = errorBodyUnder('development');
    assert.equal(body.message, 'db path users/x failed');
    assert.match(body.stack, /db path users\/x failed/);
  });
});
