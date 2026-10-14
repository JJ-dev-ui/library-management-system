// Small CSV writer for files made in the browser (the import error report).
// Same rules as the server's export (server/export/csv.js):
// - a text cell starting with = + - @ (or tab / carriage return) gets a leading apostrophe, so a
//   spreadsheet shows it as text instead of running it as a FORMULA (CSV injection)
// - cells with a comma, a quote or a line break are wrapped in quotes, quotes inside are doubled
const neutralize = (s) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
const quote = (s) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const cell = (v) => (typeof v === 'number' ? String(v) : quote(neutralize(String(v ?? ''))));

// rows: arrays of values (the first one = headers) -> Blob. The BOM makes Excel read it as UTF-8.
export function csvBlob(rows) {
  const text = rows.map((r) => r.map(cell).join(',')).join('\r\n');
  return new Blob([`﻿${text}\r\n`], { type: 'text/csv;charset=utf-8' });
}
