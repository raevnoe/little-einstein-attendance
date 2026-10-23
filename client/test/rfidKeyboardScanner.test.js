// Phase 6B: keyboard-emulation scan buffer (WYUAN UHF60U types the UID, then Enter).
// Pure unit tests: no browser, no server, no Firestore, no SMS.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createKeyboardScanBuffer, isTextEntryElement, SCANNER_MAX_KEY_GAP_MS } from '../src/lib/rfidKeyboardScanner.js';

const READER_UID = '202511060009301106100680'; // what the physical test card produced
const BODY = { tagName: 'BODY' };
const BUTTON = { tagName: 'BUTTON' };
const TEXT_INPUT = { tagName: 'INPUT', type: 'text' };

/** A fake clock plus a buffer that records every scan. */
function setup(options = {}) {
  let time = 1_000;
  const scans = [];
  const buffer = createKeyboardScanBuffer({ onScan: (uid) => scans.push(uid), now: () => time, ...options });
  const advance = (ms) => {
    time += ms;
  };
  return { buffer, scans, advance };
}

/** A keydown event like the browser's; records whether preventDefault was called. */
function key(k, target = BODY, extra = {}) {
  const event = { key: k, target, defaultPrevented: false, ...extra };
  event.preventDefault = () => {
    event.defaultPrevented = true;
  };
  return event;
}

/** Types text the way the reader does: fast, then Enter. Returns the Enter event. */
function readerTypes(ctx, text, { target = BODY, gapMs = 5 } = {}) {
  for (const ch of text) {
    ctx.buffer.handleKeyDown(key(ch, target));
    ctx.advance(gapMs);
  }
  const enter = key('Enter', target);
  ctx.buffer.handleKeyDown(enter);
  return enter;
}

describe('UHF reader keyboard scan buffer', () => {
  it('1. a numeric UID followed by Enter produces exactly one scan', () => {
    const ctx = setup();
    const enter = readerTypes(ctx, READER_UID);
    assert.deepEqual(ctx.scans, [READER_UID]);
    assert.equal(enter.defaultPrevented, true, 'the reader Enter must not also click a focused button');
  });

  it('2. trims surrounding whitespace and passes the rest through unvalidated', () => {
    const ctx = setup();
    readerTypes(ctx, `  ${READER_UID} `);
    readerTypes(ctx, ' 3008 33b2-DDD9 ');
    // Internal formatting is left for the server's normalizeRfidUid() to handle.
    assert.deepEqual(ctx.scans, [READER_UID, '3008 33b2-DDD9']);
  });

  it('3. an empty Enter (or whitespace only) does not produce a scan or block the key', () => {
    const ctx = setup();
    const empty = key('Enter');
    assert.equal(ctx.buffer.handleKeyDown(empty), false);
    readerTypes(ctx, '   ');
    assert.deepEqual(ctx.scans, []);
    assert.equal(empty.defaultPrevented, false);
  });

  it('4. clears the buffer after each scan', () => {
    const ctx = setup();
    readerTypes(ctx, READER_UID);
    assert.equal(ctx.buffer.pending, '');
    ctx.advance(2_000);
    readerTypes(ctx, 'E2801160600002');
    assert.deepEqual(ctx.scans, [READER_UID, 'E2801160600002']);
  });

  it('8. one reader scan is one scan, even if extra Enters follow', () => {
    const ctx = setup();
    readerTypes(ctx, READER_UID);
    ctx.buffer.handleKeyDown(key('Enter'));
    ctx.advance(5);
    ctx.buffer.handleKeyDown(key('Enter'));
    assert.equal(ctx.scans.length, 1);
  });

  it('accepts a reader Enter while a button has focus (no click-through)', () => {
    const ctx = setup();
    const enter = readerTypes(ctx, READER_UID, { target: BUTTON });
    assert.deepEqual(ctx.scans, [READER_UID]);
    assert.equal(enter.defaultPrevented, true);
  });
});

describe('7. normal keyboard use is not hijacked', () => {
  const textTargets = {
    'text input': TEXT_INPUT,
    'search input': { tagName: 'INPUT', type: 'search' },
    'input with no type': { tagName: 'INPUT' },
    'date input': { tagName: 'INPUT', type: 'date' },
    textarea: { tagName: 'TEXTAREA' },
    select: { tagName: 'SELECT' },
    contenteditable: { tagName: 'DIV', isContentEditable: true },
  };

  for (const [name, target] of Object.entries(textTargets)) {
    it(`ignores typing (and Enter) in a ${name}`, () => {
      const ctx = setup();
      const enter = readerTypes(ctx, READER_UID, { target });
      assert.deepEqual(ctx.scans, []);
      assert.equal(enter.defaultPrevented, false, 'the field keeps its normal Enter behavior');
    });
  }

  it('a person typing slowly then pressing Enter on a button is left alone', () => {
    const ctx = setup();
    const enter = readerTypes(ctx, '12', { target: BUTTON, gapMs: SCANNER_MAX_KEY_GAP_MS + 200 });
    assert.deepEqual(ctx.scans, []);
    assert.equal(enter.defaultPrevented, false);
  });

  it('a stray key long before a scan is not glued onto the UID', () => {
    const ctx = setup();
    ctx.buffer.handleKeyDown(key('x'));
    ctx.advance(60_000);
    readerTypes(ctx, READER_UID);
    assert.deepEqual(ctx.scans, [READER_UID]);
  });

  it('ignores Ctrl/Alt/Meta shortcuts and held-down keys', () => {
    const ctx = setup();
    ctx.buffer.handleKeyDown(key('c', BODY, { ctrlKey: true }));
    ctx.buffer.handleKeyDown(key('Enter', BODY, { altKey: true }));
    for (let i = 0; i < 10; i++) ctx.buffer.handleKeyDown(key('7', BODY, { repeat: i > 0 }));
    const enter = key('Enter');
    ctx.buffer.handleKeyDown(enter);
    assert.deepEqual(ctx.scans, []);
    assert.equal(enter.defaultPrevented, false);
  });

  it('ignores non-character keys such as Shift and Tab without breaking a scan', () => {
    const ctx = setup();
    for (const k of ['Shift', 'E', 'Shift', '2', '8', '0', 'Tab']) ctx.buffer.handleKeyDown(key(k));
    ctx.buffer.handleKeyDown(key('Enter'));
    assert.deepEqual(ctx.scans, ['E280']);
  });
});

describe('isTextEntryElement', () => {
  it('treats typing fields as text entry and buttons/checkboxes/page as not', () => {
    assert.equal(isTextEntryElement(TEXT_INPUT), true);
    assert.equal(isTextEntryElement({ tagName: 'input', type: 'NUMBER' }), true);
    assert.equal(isTextEntryElement({ tagName: 'INPUT', type: 'checkbox' }), false);
    assert.equal(isTextEntryElement({ tagName: 'INPUT', type: 'submit' }), false);
    assert.equal(isTextEntryElement(BUTTON), false);
    assert.equal(isTextEntryElement(BODY), false);
    assert.equal(isTextEntryElement(null), false);
  });
});
