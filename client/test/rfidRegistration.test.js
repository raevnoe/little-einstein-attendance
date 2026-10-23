import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyRegistrationScan } from '../src/lib/rfidRegistration.js';
import { createKeyboardScanBuffer } from '../src/lib/rfidKeyboardScanner.js';

const A = 'E2000017221101441890C001';
const B = 'E2000017221101441890C002';

describe('classifyRegistrationScan', () => {
  it('a valid card while waiting is new (normalized like the server)', () => {
    assert.deepEqual(classifyRegistrationScan({}, ' e200 0017 2211 0144 1890 c001 '), { kind: 'new', uid: A });
  });

  it('garbage while waiting is invalid; garbage while a card is shown is ignored', () => {
    assert.equal(classifyRegistrationScan({}, 'hello!').kind, 'invalid');
    assert.equal(classifyRegistrationScan({}, '').kind, 'invalid');
    assert.equal(classifyRegistrationScan({ current: A }, 'hello!').kind, 'ignore');
  });

  it('the same card read again is ignored (UHF readers repeat)', () => {
    assert.equal(classifyRegistrationScan({ current: A }, A).kind, 'ignore');
    assert.equal(classifyRegistrationScan({ current: A }, A.toLowerCase()).kind, 'ignore');
  });

  it('a DIFFERENT card while one is on screen is "multiple", never a silent swap', () => {
    assert.deepEqual(classifyRegistrationScan({ current: A }, B), { kind: 'multiple', uid: B });
  });

  it('the card just registered is ignored until another card is scanned', () => {
    assert.equal(classifyRegistrationScan({ lastSaved: A }, A).kind, 'ignore');
    assert.deepEqual(classifyRegistrationScan({ lastSaved: A }, B), { kind: 'new', uid: B });
  });

  it('works with the reader keyboard buffer: two fast bursts from two cards', () => {
    let time = 0;
    const kinds = [];
    let state = { current: null, lastSaved: null };
    const buffer = createKeyboardScanBuffer({
      now: () => time,
      onScan: (raw) => {
        const result = classifyRegistrationScan(state, raw);
        kinds.push(result.kind);
        if (result.kind === 'new') state = { ...state, current: result.uid };
      },
    });
    const type = (text) => {
      for (const key of [...text, 'Enter']) {
        time += 5;
        buffer.handleKeyDown({ key, target: null });
      }
    };
    type(A);
    type(A);
    type(B);
    assert.deepEqual(kinds, ['new', 'ignore', 'multiple']);
  });
});
