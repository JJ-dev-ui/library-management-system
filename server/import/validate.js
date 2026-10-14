// Checks the rows of a bulk import with the SAME limits as the "Add book" form (utils/limits.js).
const { BOOK, LANGUAGES, SHELF_RX } = require('../utils/limits');
const { cleanIsbn, isValidIsbn } = require('../utils/isbn');

// The template's columns. key = field name in the Book model; required columns end with * in the file.
const COLUMNS = [
  { header: 'ISBN', key: 'isbn', required: true },
  { header: 'Title', key: 'title', required: true },
  { header: 'Authors', key: 'authors', required: true },
  { header: 'Subtitle', key: 'subtitle' },
  { header: 'Category', key: 'category' },
  { header: 'Publisher', key: 'publisher' },
  { header: 'Published year', key: 'publishedYear' },
  { header: 'Pages', key: 'pages' },
  { header: 'Language', key: 'language' },
  { header: 'Shelf location', key: 'shelfLocation' },
  { header: 'Subjects', key: 'subjects' },
  { header: 'Description', key: 'description' },
  { header: 'Total copies', key: 'totalCopies' },
];
const MAX_ROWS = 1000;

// "Published Year *" -> "publishedyear": headers are compared without case, spaces or *
const normHeader = (h) => String(h ?? '').toLowerCase().replace(/[\s*_]/g, '');
const BY_HEADER = new Map(COLUMNS.map((c) => [normHeader(c.header), c]));

// Finds which column holds which field. Returns { map: {key: columnIndex}, unknown, missingRequired, missingOptional }
function matchHeaders(headerRow) {
  const map = {};
  const unknown = [];
  headerRow.forEach((h, i) => {
    const text = String(h ?? '').trim();
    if (!text) return;
    const col = BY_HEADER.get(normHeader(text));
    if (col && map[col.key] === undefined) map[col.key] = i;
    else unknown.push(text); // unknown or repeated column: ignored
  });
  const missing = COLUMNS.filter((c) => map[c.key] === undefined);
  return {
    map,
    unknown,
    missingRequired: missing.filter((c) => c.required).map((c) => c.header),
    missingOptional: missing.filter((c) => !c.required).map((c) => c.header),
  };
}

const text = (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '')).trim();
// "A; B ;; C" -> ['A', 'B', 'C'] (arrays are accepted too: the commit sends them already split)
const list = (v) => (Array.isArray(v) ? v : text(v).split(';')).map((s) => String(s).trim()).filter(Boolean);

// Whole number from a cell: 250, "250", "250.0" -> 250. NaN when it is not a whole number.
function wholeNumber(v) {
  if (typeof v === 'number') return Number.isInteger(v) ? v : NaN;
  const s = text(v);
  return /^\d+(\.0+)?$/.test(s) ? Number.parseInt(s, 10) : NaN;
}

// Year from a number (2008), a text ("2008", "2008-08-01", "Aug 1, 2008") or an Excel date cell
function yearOf(v) {
  if (v instanceof Date) return v.getUTCFullYear();
  if (typeof v === 'number') return Number.isInteger(v) ? v : NaN;
  const s = text(v);
  if (/^\d{4}$/.test(s)) return Number(s);
  const m = /\b(\d{4})\b/.exec(s);
  return m && !Number.isNaN(Date.parse(s)) ? Number(m[1]) : NaN;
}

// One row -> { data, errors: [..], warnings: [..] }. A row with errors is NOT imported;
// warnings are imported with an automatic fix (e.g. unknown language -> "Other").
// `raw` = { isbn, title, ... } with the cell values (text, numbers or Dates).
function validateRow(raw) {
  const errors = [];
  const warnings = [];
  const data = {};
  const maxLen = (key, label, max, required = false) => {
    const v = text(raw[key]);
    if (!v) { if (required) errors.push(`${label} is required`); return ''; }
    if (v.length > max) errors.push(`${label} is longer than ${max} characters (${v.length})`);
    return v;
  };

  // ISBN: spaces/dashes removed, 10 or 13 characters, and the check digit must be right
  let isbn = cleanIsbn(text(raw.isbn));
  if (typeof raw.isbn === 'number' && isbn.length === 9) {
    // Excel stored the ISBN as a NUMBER and dropped its leading 0 (0132350882 -> 132350882)
    isbn = `0${isbn}`;
    warnings.push('ISBN was a number in Excel; the leading 0 was added back');
  }
  if (!isbn) errors.push('ISBN is required');
  else if (!/^(\d{9}[\dX]|\d{13})$/.test(isbn)) errors.push('ISBN must have 10 or 13 digits');
  else if (!isValidIsbn(isbn)) errors.push('ISBN check digit is wrong (typo?)');
  data.isbn = isbn;

  data.title = maxLen('title', 'Title', BOOK.title, true);
  data.subtitle = maxLen('subtitle', 'Subtitle', BOOK.subtitle);

  const authors = list(raw.authors);
  if (!authors.length) errors.push('At least one author is required');
  if (authors.length > BOOK.authors) errors.push(`At most ${BOOK.authors} authors (found ${authors.length})`);
  if (authors.some((a) => a.length > BOOK.author)) errors.push(`An author name is longer than ${BOOK.author} characters`);
  data.authors = authors;

  const category = maxLen('category', 'Category', 50);
  data.category = category || 'Uncategorized';
  data.publisher = maxLen('publisher', 'Publisher', BOOK.publisher);

  if (text(raw.publishedYear)) {
    const y = yearOf(raw.publishedYear);
    if (!(y >= BOOK.yearMin && y <= BOOK.yearMax)) errors.push(`Published year must be between ${BOOK.yearMin} and ${BOOK.yearMax}`);
    else data.publishedYear = y;
  }
  if (text(raw.pages)) {
    const p = wholeNumber(raw.pages);
    if (!(p >= 1 && p <= BOOK.pagesMax)) errors.push(`Pages must be a whole number from 1 to ${BOOK.pagesMax}`);
    else data.pages = p;
  }

  // Language: matched without case ("filipino" -> "Filipino"); anything else becomes "Other"
  const lang = text(raw.language);
  if (lang) {
    const known = LANGUAGES.find((l) => l.toLowerCase() === lang.toLowerCase());
    if (!known) warnings.push(`Language "${lang.slice(0, 40)}" is not in the list; saved as "Other"`);
    data.language = known || 'Other';
  } else data.language = 'English';

  // Shelf: like PRG-B4. A wrong code is left empty (the book can still be imported)
  const shelf = text(raw.shelfLocation).toUpperCase();
  if (shelf && !SHELF_RX.test(shelf)) {
    warnings.push(`Shelf "${shelf.slice(0, 20)}" does not look like PRG-B4; left empty`);
    data.shelfLocation = '';
  } else data.shelfLocation = shelf;

  const subjects = list(raw.subjects);
  if (subjects.length > BOOK.subjects) errors.push(`At most ${BOOK.subjects} subjects (found ${subjects.length})`);
  if (subjects.some((s) => s.length > BOOK.subject)) errors.push(`A subject is longer than ${BOOK.subject} characters`);
  data.subjects = subjects;

  const description = String(raw.description ?? '').trim(); // line breaks inside are kept
  if (description.length > BOOK.description) errors.push(`Description is longer than ${BOOK.description} characters (${description.length})`);
  data.description = description;

  if (text(raw.totalCopies)) {
    const c = wholeNumber(raw.totalCopies);
    if (!(c >= 1 && c <= BOOK.copiesMax)) errors.push(`Total copies must be a whole number from 1 to ${BOOK.copiesMax}`);
    else data.totalCopies = c;
  } else data.totalCopies = 1; // blank = 1 copy

  return { data, errors, warnings };
}

// File rows (arrays) -> objects keyed by field, skipping completely empty rows.
// rowNumber = the row number in the spreadsheet (headers are row 1).
function rowsToRecords(rows, map) {
  const out = [];
  rows.slice(1).forEach((cells, i) => {
    if (!cells.some((c) => text(c) !== '')) return; // empty line
    const raw = {};
    for (const [key, idx] of Object.entries(map)) raw[key] = cells[idx] ?? '';
    out.push({ rowNumber: i + 2, raw });
  });
  return out;
}

module.exports = { COLUMNS, MAX_ROWS, matchHeaders, validateRow, rowsToRecords };
