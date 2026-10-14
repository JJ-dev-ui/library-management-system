// CSV writer (RFC 4180), safe to open in Excel.
const { formatManila } = require('../utils/manila');

// CSV / FORMULA INJECTION: Excel and Google Sheets treat a cell that starts with = + - @ (or a tab /
// carriage return) as a FORMULA. A book title or member note like  =HYPERLINK("http://evil",...)
// would then run when a librarian opens the file. Putting an apostrophe in front makes the
// spreadsheet show it as plain text. (OWASP recommendation.) Only TEXT cells are escaped:
// real numbers such as -3 are written as numbers.
const DANGEROUS_START = /^[=+\-@\t\r]/;
const neutralize = (s) => (DANGEROUS_START.test(s) ? `'${s}` : s);

// RFC 4180: a field that contains a comma, a double quote or a line break is wrapped in double
// quotes, and every double quote inside it is doubled ("" ).
const quote = (s) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

function cellText(value, type) {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'date') return formatManila(value, false);
  if (type === 'datetime') return formatManila(value, true);
  if (type === 'percent') return `${Math.round(value * 100)}%`;
  if (typeof value === 'number') return String(value);
  return quote(neutralize(String(value)));
}

// rows + columns -> Buffer. Text cells go through neutralize() + quote(); dates/numbers never need it.
function toCsv(columns, rows) {
  const lines = [columns.map((c) => quote(c.header)).join(',')];
  for (const row of rows) lines.push(columns.map((c) => cellText(c.get(row), c.type)).join(','));
  // ﻿ = UTF-8 "byte order mark": tells Excel the file is UTF-8, so "ñ" and "é" display correctly.
  // RFC 4180 uses CRLF line endings.
  return Buffer.from(`﻿${lines.join('\r\n')}\r\n`, 'utf8');
}

module.exports = { toCsv, neutralize, quote };
