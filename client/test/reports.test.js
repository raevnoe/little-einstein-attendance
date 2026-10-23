// Phase 10: CSV export (incl. spreadsheet formula injection) and report date ranges.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { csvCell, csvFileName, toCsv } from '../src/lib/csv.js';
import { addDays, daysInRange, presetRange, rangeError } from '../src/lib/dateRange.js';

describe('csvCell', () => {
  it('leaves plain text and numbers alone', () => {
    assert.equal(csvCell('Ana Cruz'), 'Ana Cruz');
    assert.equal(csvCell(4), '4');
    assert.equal(csvCell(0), '0');
    assert.equal(csvCell(null), '');
    assert.equal(csvCell(undefined), '');
  });

  it('quotes commas, quotes and line breaks', () => {
    assert.equal(csvCell('Cruz, Ana'), '"Cruz, Ana"');
    assert.equal(csvCell('said "hi"'), '"said ""hi"""');
    assert.equal(csvCell('line 1\nline 2'), '"line 1\nline 2"');
    assert.equal(csvCell('a\r\nb'), '"a\r\nb"');
    assert.equal(csvCell(' padded '), '" padded "');
  });

  it('neutralizes spreadsheet formulas', () => {
    assert.equal(csvCell('=1+1'), "'=1+1");
    assert.equal(csvCell('+639171234567'), "'+639171234567");
    assert.equal(csvCell('-2+3'), "'-2+3");
    assert.equal(csvCell('@SUM(A1)'), "'@SUM(A1)");
    assert.equal(csvCell('\t=cmd'), "'\t=cmd");
    assert.equal(csvCell('\r=cmd'), "\"'\r=cmd\"");
    assert.equal(csvCell('=HYPERLINK("http://x","y")'), '"\'=HYPERLINK(""http://x"",""y"")"');
    assert.equal(csvCell('Counts = 20'), 'Counts = 20', 'only a leading character matters');
  });
});

describe('toCsv', () => {
  it('builds CRLF rows with a header', () => {
    assert.equal(
      toCsv(['Date', 'Note'], [['2026-10-01', '=bad'], ['2026-10-02', 'ok, fine']]),
      'Date,Note\r\n2026-10-01,\'=bad\r\n2026-10-02,"ok, fine"\r\n',
    );
  });

  it('makes safe file names', () => {
    assert.equal(csvFileName('attendance', '2026-10-01', 'to', '2026-10-07', 'K1 / A'), 'attendance-2026-10-01-to-2026-10-07-K1-A.csv');
  });
});

describe('date ranges', () => {
  const today = '2026-10-10';

  it('adds days across months and years', () => {
    assert.equal(addDays('2026-03-01', -1), '2026-02-28');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(daysInRange('2026-10-01', '2026-10-31'), 31);
  });

  it('accepts valid ranges up to 31 days', () => {
    assert.equal(rangeError(today, today, today), null);
    assert.equal(rangeError('2026-09-10', today, today), null);
  });

  it('rejects invalid, future, reversed and too-long ranges', () => {
    assert.match(rangeError('', today, today), /start date and an end date/);
    assert.match(rangeError('2026-02-30', today, today), /start date and an end date/);
    assert.match(rangeError(today, '2026-10-11', today), /future/);
    assert.match(rangeError('2026-10-09', '2026-10-08', today), /on or before/);
    assert.match(rangeError('2026-09-09', today, today), /at most 31 days/);
  });

  it('presets end today and stay within 31 days', () => {
    assert.deepEqual(presetRange('today', today), { from: today, to: today });
    assert.deepEqual(presetRange('last7', today), { from: '2026-10-04', to: today });
    assert.deepEqual(presetRange('month', today), { from: '2026-10-01', to: today });
    assert.deepEqual(presetRange('last31', today), { from: '2026-09-10', to: today });
    for (const key of ['today', 'last7', 'month', 'last31']) {
      const { from, to } = presetRange(key, '2026-12-31');
      assert.equal(rangeError(from, to, '2026-12-31'), null, key);
    }
  });
});

describe('parent SMS contact (Phase 11: contact details are admin-only)', () => {
  it('shows the number to admins, and only "on file" to teachers', async () => {
    const { parentSmsContact } = await import('../src/lib/format.js');
    assert.deepEqual(parentSmsContact({ mobileNumber: '+639171234567', hasMobileNumber: true }), { kind: 'number', text: '+639171234567' });
    assert.deepEqual(parentSmsContact({ hasMobileNumber: true }), { kind: 'on-file', text: 'number on file' });
    assert.deepEqual(parentSmsContact({ hasMobileNumber: false }), { kind: 'none', text: 'no mobile number' });
    assert.deepEqual(parentSmsContact({}), { kind: 'none', text: 'no mobile number' });
  });
});
