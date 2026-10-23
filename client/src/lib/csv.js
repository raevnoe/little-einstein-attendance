// CSV export for staff reports. Built in the browser from report data the server already
// authorized for this user: no extra endpoint, no package.
//
// Spreadsheet formula injection: a cell that starts with = + - @ (or a tab / carriage
// return) can run as a formula when the file is opened in Excel or Sheets. Teacher
// observations are free text, so every such cell is prefixed with an apostrophe (OWASP
// guidance), which makes the spreadsheet treat it as plain text.
const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell as safe CSV text. null/undefined -> empty. */
export function csvCell(value) {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (FORMULA_START.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

/** headers: ['Date', ...]; rows: [[...], ...]. CRLF line endings, as Excel expects. */
export function toCsv(headers, rows) {
  return [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Letters, digits, dots and hyphens only. */
export function csvFileName(...parts) {
  return `${parts.filter(Boolean).join('-').replace(/[^A-Za-z0-9.-]+/g, '-')}.csv`;
}

/** Saves the CSV as a file. The BOM makes Excel read names with ñ, é, etc. correctly. */
export function downloadCsv(fileName, csv) {
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
