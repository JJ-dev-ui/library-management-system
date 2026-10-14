// Reads an uploaded CSV or Excel file into { headers, rows } (rows = arrays of cell values).
const ExcelJS = require('exceljs');

class ImportError extends Error {} // a problem with the FILE itself -> 400 with this message

// Real file type from the first bytes ("magic bytes"), never trusting the name or the browser:
// an .xlsx file is a ZIP archive, and every ZIP file starts with "PK\x03\x04".
const isZip = (buf) => buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;

function detectType(fileName, buf) {
  const ext = (/\.([a-z0-9]+)$/i.exec(fileName || '')?.[1] || '').toLowerCase();
  if (ext === 'xlsx') {
    if (!isZip(buf)) throw new ImportError('This is not a real Excel (.xlsx) file. Save it again from Excel or use the template.');
    return 'xlsx';
  }
  if (ext === 'csv') {
    if (isZip(buf)) throw new ImportError('This file is an Excel workbook renamed to .csv. Upload it as .xlsx, or save it as CSV from Excel.');
    // A text file never contains NUL bytes; programs, images and old .xls files do
    if (buf.subarray(0, 4096).includes(0)) throw new ImportError('This .csv file is not a text file.');
    return 'csv';
  }
  throw new ImportError('Upload a .csv or .xlsx file.');
}

// Text of a CSV file. Excel saves "CSV UTF-8" (with a BOM) or, in older versions, Windows-1252.
function decodeText(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(buf); // e.g. "ñ" saved by an older Excel
  }
}

// Quote-aware CSV parser (RFC 4180): commas and line breaks INSIDE "quoted" cells belong to the cell,
// and "" inside quotes is one " character. Splitting lines by "\n" and cells by "," would break
// descriptions that contain commas or several paragraphs.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } // escaped quote
      else if (ch === '"') quoted = false;                         // closing quote
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;           // opening quote (start of a cell)
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;                 // CRLF counts as one line break
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// exceljs gives different kinds of values: plain values, Dates, rich text, hyperlinks, formulas.
// Formulas are NEVER calculated here: only the result Excel saved in the file is used.
function excelValue(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date || typeof v === 'number' || typeof v === 'string') return v;
  if (typeof v === 'boolean') return String(v);
  if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('');
  if ('result' in v) return excelValue(v.result);
  if ('text' in v) return excelValue(v.text);
  return '';
}

async function readXlsx(buf) {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf);
  } catch {
    throw new ImportError('This Excel file could not be read. It may be damaged or password-protected.');
  }
  // The first sheet that is not the template's "Instructions" sheet
  const ws = wb.worksheets.find((s) => s.name.toLowerCase() !== 'instructions') || wb.worksheets[0];
  if (!ws) throw new ImportError('This Excel file has no sheets.');
  const rows = [];
  ws.eachRow({ includeEmpty: true }, (r, n) => {
    const values = [];
    for (let c = 1; c <= ws.columnCount; c++) values.push(excelValue(r.getCell(c).value));
    rows[n - 1] = values; // keep the real row numbers (row 1 = headers)
  });
  return Array.from(rows, (r) => r || []); // fill gaps left by completely empty rows
}

async function readFile(fileName, buf) {
  const type = detectType(fileName, buf);
  const rows = type === 'xlsx' ? await readXlsx(buf) : parseCsv(decodeText(buf));
  return { type, rows };
}

module.exports = { readFile, parseCsv, ImportError, isZip };
