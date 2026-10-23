// Scan buffer for a UHF RFID reader in keyboard-emulation mode (e.g. WYUAN UHF60U).
//
// The reader "types" the card UID very quickly and then presses Enter. This buffer collects
// those keystrokes and reports one scan per Enter. It does NOT validate the UID: the raw
// text goes to the server, where the shared normalizeRfidUid() rule is the only authority.
//
// It never hijacks normal typing:
//   - keys typed into a text field, textarea, select or contenteditable are ignored
//     (that field keeps its normal behavior, e.g. the manual UID form submits itself);
//   - Ctrl/Alt/Meta shortcuts, held-down (auto-repeat) keys and IME composition are ignored;
//   - characters typed slower than a reader would (gap > maxKeyGapMs) are discarded, and an
//     Enter after such a pause is left alone, so a person pressing Enter on a button still
//     activates it. Only an Enter that ends a fast burst is consumed (preventDefault).
//
// Framework-free so it can be tested without a browser.

/** Longest pause between two keystrokes of one scan. Readers type much faster than people. */
export const SCANNER_MAX_KEY_GAP_MS = 250;
const MAX_BUFFER_LENGTH = 256; // memory guard only; the server enforces the real UID rule

const NON_TEXT_INPUT_TYPES = new Set(['button', 'checkbox', 'radio', 'submit', 'reset', 'range', 'color', 'file', 'image']);

/** True when keystrokes on this element are meant for the element itself (typing, date, select). */
export function isTextEntryElement(element) {
  if (!element || typeof element.tagName !== 'string') return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName.toUpperCase();
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  return !NON_TEXT_INPUT_TYPES.has(String(element.type || 'text').toLowerCase());
}

/**
 * Returns { handleKeyDown(event), reset(), pending }. handleKeyDown accepts a DOM KeyboardEvent
 * (or any object with key/target/modifier fields) and returns true when it consumed an Enter
 * as the end of a scan, in which case onScan(uid) has been called exactly once.
 */
export function createKeyboardScanBuffer({ onScan, maxKeyGapMs = SCANNER_MAX_KEY_GAP_MS, now = () => Date.now() }) {
  let buffer = '';
  let lastKeyAt = 0;
  const reset = () => {
    buffer = '';
  };

  function handleKeyDown(event) {
    if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing || isTextEntryElement(event.target)) {
      reset();
      return false;
    }

    const time = now();
    const stale = buffer !== '' && time - lastKeyAt > maxKeyGapMs;

    if (event.key === 'Enter') {
      const uid = stale ? '' : buffer.trim();
      reset();
      if (!uid) return false; // empty or slow input: a normal Enter, left untouched
      event.preventDefault?.(); // don't also activate a focused button/link
      onScan(uid);
      return true;
    }

    if (typeof event.key !== 'string' || event.key.length !== 1) return false; // Shift, Tab, arrows...
    if (event.repeat) {
      reset();
      return false;
    }
    if (stale || buffer.length >= MAX_BUFFER_LENGTH) reset();
    buffer += event.key;
    lastKeyAt = time;
    return false;
  }

  return {
    handleKeyDown,
    reset,
    get pending() {
      return buffer;
    },
  };
}
