// Phase 12: a new app version waits until the user presses "Reload"; the page never reloads by itself.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createServiceWorkerUpdates } from '../src/lib/serviceWorkerRegistration.js';

class FakeTarget {
  listeners = {};
  addEventListener(type, listener) {
    (this.listeners[type] ??= []).push(listener);
  }
  emit(type) {
    for (const listener of this.listeners[type] ?? []) listener();
  }
}

class FakeWorker extends FakeTarget {
  state = 'installing';
  messages = [];
  postMessage(message) {
    this.messages.push(message);
  }
}

function setup({ controller = {}, waiting = null } = {}) {
  const registration = new FakeTarget();
  registration.waiting = waiting;
  registration.installing = null;
  const container = new FakeTarget();
  container.controller = controller;
  container.registered = [];
  container.register = async (url, options) => {
    container.registered.push({ url, options });
    return registration;
  };
  const reloads = [];
  const updates = createServiceWorkerUpdates({ container, reload: () => reloads.push(1) });
  return { updates, container, registration, reloads };
}

describe('service worker updates', () => {
  it('registers /sw.js for the whole app without using the HTTP cache for updates', async () => {
    const { updates, container } = setup();
    await updates.register('/sw.js', '/');
    assert.deepEqual(container.registered, [{ url: '/sw.js', options: { scope: '/', updateViaCache: 'none' } }]);
  });

  it('shows no update prompt on the first install (no controlling worker yet)', async () => {
    const { updates, registration } = setup({ controller: null });
    await updates.register('/sw.js', '/');
    const worker = new FakeWorker();
    registration.installing = worker;
    registration.emit('updatefound');
    worker.state = 'installed';
    worker.emit('statechange');
    assert.equal(updates.isUpdateReady(), false);
  });

  it('reports a new version, activates it only on applyUpdate, and reloads once', async () => {
    const { updates, registration, container, reloads } = setup();
    let notified = 0;
    updates.subscribe(() => { notified += 1; });
    await updates.register('/sw.js', '/');

    const worker = new FakeWorker();
    registration.installing = worker;
    registration.emit('updatefound');
    worker.state = 'installed';
    worker.emit('statechange');
    assert.equal(updates.isUpdateReady(), true);
    assert.equal(notified, 1);

    container.emit('controllerchange'); // e.g. another tab - no reload without the user's choice
    assert.equal(reloads.length, 0);
    assert.deepEqual(worker.messages, []);

    assert.equal(updates.applyUpdate(), true);
    assert.deepEqual(worker.messages, [{ type: 'SKIP_WAITING' }]);
    container.emit('controllerchange');
    container.emit('controllerchange');
    assert.equal(reloads.length, 1);
  });

  it('picks up a version that was already waiting when the page loaded', async () => {
    const waiting = new FakeWorker();
    const { updates } = setup({ waiting });
    await updates.register('/sw.js', '/');
    assert.equal(updates.isUpdateReady(), true);
  });

  it('does nothing on applyUpdate when no version is waiting, and survives a failed registration', async () => {
    const { updates, reloads } = setup();
    assert.equal(updates.applyUpdate(), false);
    assert.equal(reloads.length, 0);

    const errors = [];
    const failing = createServiceWorkerUpdates({
      container: { register: async () => { throw new Error('blocked'); } },
      reload: () => {},
      onError: (e) => errors.push(e.message),
    });
    assert.equal(await failing.register('/sw.js', '/'), null);
    assert.deepEqual(errors, ['blocked']);
  });
});
