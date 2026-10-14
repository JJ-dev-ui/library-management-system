const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const ExcelJS = require('exceljs');
const { body, matchedData } = require('express-validator');
const Book = require('../models/Book');
const { protect, adminOnly } = require('../middleware/auth');
const { validate } = require('../middleware/error');
const { logActivity } = require('../utils/activity');
const { BOOK, LANGUAGES } = require('../utils/limits');
const { isbnVariants, toIsbn13 } = require('../utils/isbn');
const { readFile, ImportError } = require('../import/parse');
const { COLUMNS, MAX_ROWS, matchHeaders, validateRow, rowsToRecords } = require('../import/validate');
const { clearFacetsCache } = require('./books');

// Bulk upload of books from a CSV or Excel file (admin only), in two steps:
//   1. POST /preview  the file is read and checked; NOTHING is saved. The librarian sees what will happen.
//   2. POST /commit   the ready rows are sent back, checked AGAIN (never trust the browser), and saved.
const router = express.Router();
router.use(protect, adminOnly);

const MAX_FILE_BYTES = 2 * 1024 * 1024; // 2 MB

// 10 previews and 10 imports per 10 minutes PER LIBRARIAN (reading files and saving 1,000 books is heavy)
const limiter = (what) => rateLimit({
  windowMs: 10 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `${what}:${req.user._id}`,
  message: { message: 'Too many imports. Please wait a few minutes and try again.' },
});

// ---------------------------------------------------------------------------
// GET /api/books/import/template?format=csv|xlsx — an empty file with the right columns
// ---------------------------------------------------------------------------
const headerText = (c) => (c.required ? `${c.header}*` : c.header);
const EXAMPLES = [
  ['9780262033848', 'Introduction to Algorithms', 'Thomas H. Cormen; Charles E. Leiserson; Ronald L. Rivest; Clifford Stein', 'Third Edition',
    'Computer Science', 'MIT Press', 2009, 1312, 'English', 'CSC-A1', 'Algorithms; Data structures', 'A comprehensive introduction to the modern study of computer algorithms.', 3],
  ['9780143039693', 'Noli Me Tángere', 'José Rizal', '', 'Filipino Literature', 'Penguin Classics', 2006, 480, 'English', 'FIL-B2',
    'Philippines; Spanish colonial period', 'Rizal\'s novel about society in the Philippines under Spanish rule.', 2],
];
const RULES = {
  isbn: 'Required. 10 or 13 digits; dashes and spaces are fine. The check digit must be right.',
  title: `Required. Up to ${BOOK.title} characters.`,
  authors: `Required. Up to ${BOOK.authors} authors, separated by ";" (each up to ${BOOK.author} characters).`,
  subtitle: `Up to ${BOOK.subtitle} characters.`,
  category: 'Up to 50 characters. Empty = "Uncategorized".',
  publisher: `Up to ${BOOK.publisher} characters.`,
  publishedYear: `A year from ${BOOK.yearMin} to ${BOOK.yearMax} (a full date also works; only the year is kept).`,
  pages: `A whole number from 1 to ${BOOK.pagesMax}.`,
  language: `One of: ${LANGUAGES.join(', ')}. Anything else is saved as "Other". Empty = English.`,
  shelfLocation: 'Like PRG-B4 (2–4 letters, a dash, a letter and 1–2 digits). A wrong code is left empty.',
  subjects: `Up to ${BOOK.subjects} subjects, separated by ";" (each up to ${BOOK.subject} characters).`,
  description: `Up to ${BOOK.description} characters.`,
  totalCopies: `A whole number from 1 to ${BOOK.copiesMax}. Empty = 1.`,
};

router.get('/template', async (req, res, next) => {
  try {
    const format = req.query.format === 'csv' ? 'csv' : 'xlsx'; // whitelist: anything else = xlsx
    if (format === 'csv') {
      res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="stacks-books-import-template.csv"' });
      return res.send(`﻿${COLUMNS.map(headerText).join(',')}\r\n`); // BOM so Excel reads it as UTF-8
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Books', { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = COLUMNS.map((c) => ({ header: headerText(c), width: { title: 34, authors: 34, description: 50, subjects: 30, isbn: 17 }[c.key] || 15 }));
    // ISBN column as TEXT: otherwise Excel turns ISBNs into numbers and drops leading zeros
    ws.getColumn(1).numFmt = '@';
    EXAMPLES.forEach((r) => ws.addRow(r));
    ws.getRow(1).eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF3D398C' } };
    });
    [2, 3].forEach((n) => { ws.getRow(n).font = { italic: true, color: { argb: 'FF5F6577' } }; });

    const help = wb.addWorksheet('Instructions');
    help.columns = [{ width: 18 }, { width: 12 }, { width: 90 }];
    help.addRow(['How to use this template']).font = { bold: true, size: 13 };
    help.addRow(['1. Replace the 2 example rows (in grey) with your books, one book per row.']);
    help.addRow(['2. Columns with * are required. Use ";" between several authors or subjects.']);
    help.addRow([`3. Up to ${MAX_ROWS.toLocaleString('en-US')} books and 2 MB per file. Books already in the library are skipped.`]);
    help.addRow(['4. In Stacks: Books → Add book → Bulk upload, choose this file and check the preview.']);
    help.addRow([]);
    const head = help.addRow(['Column', 'Required', 'Rules']);
    head.font = { bold: true };
    COLUMNS.forEach((c) => {
      const r = help.addRow([c.header, c.required ? 'Yes' : '', RULES[c.key]]);
      r.getCell(3).alignment = { wrapText: true, vertical: 'top' };
    });

    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="stacks-books-import-template.xlsx"',
    });
    res.send(Buffer.from(await wb.xlsx.writeBuffer()));
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Shared checks for preview AND commit
// ---------------------------------------------------------------------------

// records = [{ rowNumber, raw }] -> rows grouped by what will happen to them
async function classify(records) {
  const ready = [];
  const errors = [];
  const duplicatesInFile = [];
  const alreadyInLibrary = [];
  const seen = new Map(); // ISBN-13 -> first row number with it

  const valid = [];
  for (const { rowNumber, raw } of records) {
    const { data, errors: problems, warnings } = validateRow(raw);
    const summary = { row: rowNumber, isbn: data.isbn, title: data.title };
    if (problems.length) { errors.push({ ...summary, reasons: problems }); continue; }
    // The same book can be written as ISBN-10 or ISBN-13: compare the ISBN-13 form
    const key = toIsbn13(data.isbn);
    if (seen.has(key)) { duplicatesInFile.push({ ...summary, firstRow: seen.get(key) }); continue; }
    seen.set(key, rowNumber);
    valid.push({ row: rowNumber, data, warnings });
  }

  // ONE query for every ISBN of the file (in all its forms) instead of one query per row
  const variants = valid.flatMap((v) => isbnVariants(v.data.isbn));
  // Archived books count too: their ISBN is still taken (the reason then says "Archived in library")
  const existing = await Book.find({ isbn: { $in: variants } }).select('isbn title isArchived').lean();
  const byIsbn = new Map(existing.map((b) => [b.isbn, b]));
  for (const v of valid) {
    const found = isbnVariants(v.data.isbn).map((i) => byIsbn.get(i)).find(Boolean);
    if (found) {
      alreadyInLibrary.push({
        row: v.row, isbn: v.data.isbn, title: v.data.title, existingTitle: found.title,
        archived: !!found.isArchived,
        reason: found.isArchived ? 'Archived in library' : 'Already in library',
      });
    }
    else ready.push(v);
  }
  return { ready, errors, duplicatesInFile, alreadyInLibrary };
}

// ---------------------------------------------------------------------------
// POST /api/books/import/preview  (multipart: file) — read + check, save nothing
// ---------------------------------------------------------------------------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_BYTES, files: 1, fields: 5 } }).single('file');
const receiveFile = (req, res, next) => upload(req, res, (err) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'The file is larger than 2 MB. Split it into smaller files.' });
  if (err) return res.status(400).json({ message: 'Upload one file in the "file" field' });
  next();
});

router.post('/preview', limiter('preview'), receiveFile, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Choose a .csv or .xlsx file' });
    // The file name is only displayed: keep it short and printable
    const fileName = String(req.file.originalname || 'file').replace(/[^\w.\- ()]/g, '_').slice(0, 120);
    const { rows } = await readFile(fileName, req.file.buffer);

    if (!rows.some((r) => r.some((c) => String(c ?? '').trim() !== ''))) return res.status(400).json({ message: 'The file is empty.' });
    const headers = matchHeaders(rows[0]); // the column names must be in the first row
    if (headers.missingRequired.length) {
      return res.status(400).json({
        message: `Missing required column${headers.missingRequired.length > 1 ? 's' : ''}: ${headers.missingRequired.join(', ')}. Download the template to see the expected columns.`,
        unknownHeaders: headers.unknown,
      });
    }
    const records = rowsToRecords(rows, headers.map);
    if (!records.length) return res.status(400).json({ message: 'The file has headers but no books.' });
    if (records.length > MAX_ROWS) {
      return res.status(400).json({ message: `The file has ${records.length.toLocaleString('en-US')} books; the limit is ${MAX_ROWS.toLocaleString('en-US')} per file. Split it into smaller files.` });
    }

    const result = await classify(records);
    const warnings = result.ready.filter((r) => r.warnings.length).map((r) => ({ row: r.row, isbn: r.data.isbn, title: r.data.title, messages: r.warnings }));
    res.json({
      fileName,
      totalRows: records.length,
      counts: {
        ready: result.ready.length,
        alreadyInLibrary: result.alreadyInLibrary.length,
        duplicatesInFile: result.duplicatesInFile.length,
        errors: result.errors.length,
        warnings: warnings.length,
      },
      ready: result.ready.map((r) => ({ row: r.row, ...r.data, warnings: r.warnings })),
      alreadyInLibrary: result.alreadyInLibrary,
      duplicatesInFile: result.duplicatesInFile,
      errors: result.errors,
      warnings,
      unknownHeaders: headers.unknown,      // columns that were ignored
      missingOptional: headers.missingOptional, // optional columns not in the file (left empty)
    });
  } catch (err) {
    if (err instanceof ImportError) return res.status(400).json({ message: err.message });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/books/import/commit  { fileName, rows: [...ready rows from the preview], previewSkipped, previewErrors }
// ---------------------------------------------------------------------------

// Covers: the 1,000 books of data/books.json come with a cover file (client/public/covers/<isbn>.jpg).
// If an imported ISBN is one of them, the book gets that cover. Loaded once, then kept in memory.
let coverMap = null;
function coverFor(isbn) {
  if (!coverMap) {
    coverMap = new Map();
    try {
      const list = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'books.json'), 'utf8'));
      list.forEach((b) => { if (b.isbn && b.coverUrl) isbnVariants(b.isbn).forEach((v) => coverMap.set(v, b.coverUrl)); });
    } catch { /* no books.json: imported books simply have no cover */ }
  }
  return coverMap.get(isbn) || '';
}

const optStr = (name, max) => body(`rows.*.${name}`).optional({ values: 'null' }).isString().isLength({ max }).withMessage(`Invalid ${name}`);
const optInt = (name) => body(`rows.*.${name}`).optional({ values: 'null' }).isInt().withMessage(`Invalid ${name}`).toInt();
// Basic TYPE checks with express-validator; the real rules (same as the preview) run in validateRow()
const commitRules = [
  body('fileName').optional().isString().isLength({ max: 255 }).withMessage('Invalid file name'),
  body('previewSkipped').optional().isInt({ min: 0, max: MAX_ROWS }).toInt(),
  body('previewErrors').optional().isInt({ min: 0, max: MAX_ROWS }).toInt(),
  body('rows').isArray({ min: 1, max: MAX_ROWS }).withMessage(`Send between 1 and ${MAX_ROWS} books`),
  body('rows.*').isObject().withMessage('Invalid row'),
  body('rows.*.row').isInt({ min: 2, max: 1000000 }).withMessage('Invalid row number').toInt(),
  optStr('isbn', 20), optStr('title', 1000), optStr('subtitle', 1000), optStr('category', 200), optStr('publisher', 500),
  optStr('language', 100), optStr('shelfLocation', 50), optStr('description', 5000),
  body('rows.*.authors').isArray({ max: 50 }).withMessage('Invalid authors'),
  body('rows.*.authors.*').isString().isLength({ max: 500 }).withMessage('Invalid author'),
  body('rows.*.subjects').optional().isArray({ max: 50 }).withMessage('Invalid subjects'),
  body('rows.*.subjects.*').isString().isLength({ max: 500 }).withMessage('Invalid subject'),
  optInt('publishedYear'), optInt('pages'), optInt('totalCopies'),
];

router.post('/commit', limiter('commit'), express.json({ limit: '3mb' }), commitRules, validate, async (req, res, next) => {
  try {
    // matchedData: only the fields listed above (availableCopies, timesBorrowed, _id... are dropped)
    const { rows, fileName = '', previewSkipped = 0, previewErrors = 0 } = matchedData(req, { locations: ['body'] });

    // Check EVERYTHING again: the rows come from the browser and could have been changed
    const records = rows.map(({ row, ...raw }) => ({ rowNumber: row, raw }));
    const { ready, errors, duplicatesInFile, alreadyInLibrary } = await classify(records);

    const docs = ready.map(({ data }) => ({ ...data, availableCopies: data.totalCopies, coverUrl: coverFor(data.isbn) }));
    let imported = 0;
    let raced = 0;
    if (docs.length) {
      try {
        // ordered: false -> one failing book does not stop the others
        const saved = await Book.insertMany(docs, { ordered: false });
        imported = saved.length;
      } catch (err) {
        // Another librarian added one of these ISBNs between the check and the save (unique index -> 11000)
        if (!err.writeErrors && err.code !== 11000) throw err;
        imported = err.insertedDocs?.length ?? err.result?.insertedCount ?? 0;
        raced = docs.length - imported;
      }
    }
    if (imported) clearFacetsCache(); // new categories/languages/shelves for the filter panel

    const skipped = alreadyInLibrary.length + duplicatesInFile.length + raced;
    await logActivity({
      type: 'books_imported', actor: req.user,
      meta: { imported, skipped: skipped + previewSkipped, errors: errors.length + previewErrors, fileName: String(fileName).slice(0, 120) },
    });
    res.status(imported ? 201 : 200).json({
      imported,
      skipped,
      invalid: errors.length,
      details: { alreadyInLibrary, duplicatesInFile, errors },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
