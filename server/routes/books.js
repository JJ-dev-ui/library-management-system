const express = require('express');
const { body, matchedData, param, query } = require('express-validator');
const Book = require('../models/Book');
const Borrow = require('../models/Borrow');
const { protect, adminOnly } = require('../middleware/auth');
const helmet = require('helmet');
const multer = require('multer');
const { validate } = require('../middleware/error');
const BookCover = require('../models/BookCover');
const { imageInfo } = require('../utils/imageInfo');
const { BOOK, LANGUAGES, SHELF_RX } = require('../utils/limits');
const { logActivity, bookSnap } = require('../utils/activity');
const { containsRx } = require('../utils/escapeRegex');
const { bookFilterRules, buildBookFilter, bookSort } = require('../queries/books');
const { NOT_ARCHIVED } = require('../utils/libraryStats');
const { MESSAGES } = require('../utils/labels');
const { memberBook } = require('../utils/memberBook');

const router = express.Router();

// Filters, sorts and their validation live in queries/books.js, shared with the export
// (so "export all matching" returns exactly what this list shows).
// Fields sent for each row of the books LIST (the details endpoint still sends everything)
const LIST_FIELDS = {
  title: 1, subtitle: 1, authors: 1, isbn: 1, category: 1, publisher: 1, publishedYear: 1, pages: 1,
  language: 1, shelfLocation: 1, coverUrl: 1, totalCopies: 1, availableCopies: 1, timesBorrowed: 1,
  createdAt: 1, hasCustomCover: 1, coverVersion: 1, isArchived: 1,
  // $substrCP cuts by characters (code points), so accented letters like "ñ" are never split in half
  descriptionPreview: { $substrCP: [{ $ifNull: ['$description', ''] }, 0, 160] },
  descriptionLength: { $strLenCP: { $ifNull: ['$description', ''] } }, // client adds "…" when longer than the preview
};

// Small in-memory cache for /facets. clearFacetsCache() is called after every create/update/delete.
// (With several server instances each one keeps its own copy; the 5-minute limit keeps them close.)
const FACETS_TTL_MS = 5 * 60 * 1000;
const facetsCache = { data: null, at: 0 };
const clearFacetsCache = () => { facetsCache.data = null; };

// Validation for every query parameter of GET /api/books
const listRules = [
  ...bookFilterRules(query, (req) => req.query),
  query('page').optional().isInt({ min: 1, max: 100000 }).withMessage('Invalid page').toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit').toInt(),
];

// GET /api/books  (logged-in users) — search, filters, sorting and pagination
router.get('/', protect, listRules, validate, async (req, res, next) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    // Only librarians may list archived books; for anyone else the switch is ignored
    const q = req.user.role === 'admin' ? req.query : { ...req.query, archived: undefined };
    const filter = buildBookFilter(q);

    // Promise.all runs the page query and the count at the same time (not one after the other).
    // aggregate() returns plain objects (like .lean()) and $project sends ONLY the fields the
    // table/cards need. Instead of the full description (up to 2,000 characters) each row gets a
    // 160-character preview, so the response stays small.
    const [books, total] = await Promise.all([
      Book.aggregate([
        { $match: filter },
        { $sort: bookSort(req.query.sort) },
        { $skip: (page - 1) * limit },
        { $limit: limit },
        { $project: LIST_FIELDS },
      ]),
      Book.countDocuments(filter),
    ]);

    res.json({ books, total, page, pages: Math.ceil(total / limit) || 1 });
  } catch (err) {
    next(err);
  }
});

// GET /api/books/facets  (logged-in users) — the options for the filter UI, with counts.
// $facet runs several groupings over the books collection in ONE aggregation.
// The result is cached in memory for 5 minutes (and cleared when a book changes), so the
// grouping over every book is NOT recomputed for each visitor.
router.get('/facets', protect, async (req, res, next) => {
  try {
    if (facetsCache.data && Date.now() - facetsCache.at < FACETS_TTL_MS) return res.json(facetsCache.data);
    const [result] = await Book.aggregate([
      { $match: NOT_ARCHIVED }, // archived books add no categories, languages or counts
      {
        $facet: {
          categories: [{ $group: { _id: '$category', count: { $sum: 1 } } }, { $sort: { _id: 1 } }],
          languages: [{ $group: { _id: '$language', count: { $sum: 1 } } }, { $sort: { count: -1, _id: 1 } }],
          // "PRG-B4" -> "PRG": split on "-" and keep the first part
          shelves: [
            { $match: { shelfLocation: { $nin: ['', null] } } },
            { $group: { _id: { $arrayElemAt: [{ $split: ['$shelfLocation', '-'] }, 0] }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
          years: [{ $group: { _id: null, min: { $min: '$publishedYear' }, max: { $max: '$publishedYear' } } }],
        },
      },
    ]);

    const toList = (arr) => arr.filter((x) => x._id).map((x) => ({ name: x._id, count: x.count }));
    const data = {
      categories: toList(result.categories),
      languages: toList(result.languages),
      shelves: toList(result.shelves),
      minYear: result.years[0]?.min ?? null,
      maxYear: result.years[0]?.max ?? null,
    };
    facetsCache.data = data;
    facetsCache.at = Date.now();
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// GET /api/books/authors?q=riz  (logged-in users) — up to 10 author names for the autocomplete
router.get(
  '/authors',
  protect,
  [query('q').isString().trim().isLength({ min: 2, max: 100 }).withMessage('Type at least 2 characters')],
  validate,
  async (req, res, next) => {
    try {
      const rx = containsRx(req.query.q);
      const rows = await Book.aggregate([
        { $match: { authors: rx, ...NOT_ARCHIVED } }, // books with a matching author (uses the index), archived left out
        { $unwind: '$authors' },      // one row per author of those books
        { $match: { authors: rx } },  // keep only the matching authors
        { $group: { _id: '$authors' } }, // distinct names
        { $sort: { _id: 1 } },
        { $limit: 10 },
      ]);
      res.json({ authors: rows.map((r) => r._id) });
    } catch (err) {
      next(err);
    }
  }
);

// ---------------------------------------------------------------------------
// Single book + create / update / delete
// ---------------------------------------------------------------------------
const idRule = [param('id').isMongoId().withMessage('Invalid book ID')];

// Copies of this book that are out on loan right now
const countOnLoan = (bookId) => Borrow.countDocuments({ book: bookId, status: 'borrowed' });

// GET /api/books/:id  (logged-in users) — full details. Admins also get the list of current borrowers.
router.get('/:id', protect, idRule, validate, async (req, res, next) => {
  try {
    const book = await Book.findById(req.params.id).lean();
    if (!book) return res.status(404).json({ message: 'Book not found' });

    // Members: archived books do not exist for them, and they only get the member-safe fields
    // (no archive info, no times borrowed, no borrowers)
    if (req.user.role !== 'admin') {
      if (book.isArchived) return res.status(404).json({ message: 'Book not found' });
      return res.json({ book: memberBook(book, { full: true }), activeLoans: null });
    }

    // Librarians: everything + the current borrowers
    const now = new Date();
    const loans = await Borrow.find({ book: book._id, status: 'borrowed' })
      .populate('user', 'name email memberId avatarKey')
      .sort({ dueDate: 1 })
      .lean();
    res.json({ book, activeLoans: loans.map((l) => ({ ...l, isOverdue: l.dueDate < now })) });
  } catch (err) {
    next(err);
  }
});

// Validation for the book form. On update (PUT) every field is optional, on create the main ones are required.
const bookRules = (isUpdate) => {
  const req = (chain) => (isUpdate ? chain.optional() : chain);
  return [
    req(body('title')).isString().trim().notEmpty().withMessage('Title is required')
      .isLength({ max: BOOK.title }).withMessage(`Title must be at most ${BOOK.title} characters`),
    body('subtitle').optional().isString().trim().isLength({ max: BOOK.subtitle }).withMessage(`Subtitle must be at most ${BOOK.subtitle} characters`),
    req(body('authors')).isArray({ min: 1, max: BOOK.authors }).withMessage(`Add 1 to ${BOOK.authors} authors`),
    body('authors.*').isString().trim().notEmpty().withMessage('Author names cannot be empty')
      .isLength({ max: BOOK.author }).withMessage(`Author names must be at most ${BOOK.author} characters`),
    // At most 17 typed characters (dashes/spaces allowed), then they are removed and
    // exactly 10 (the last may be X) or 13 digits must remain
    req(body('isbn')).isString().withMessage('ISBN is required')
      .isLength({ max: BOOK.isbnTyped }).withMessage('ISBN is too long')
      .customSanitizer((v) => String(v).replace(/[\s-]/g, '').toUpperCase())
      .matches(/^(\d{9}[\dX]|\d{13})$/).withMessage('ISBN must be 10 or 13 digits'),
    req(body('category')).isString().trim().notEmpty().withMessage('Category is required')
      .isLength({ max: 50 }).withMessage('Category must be at most 50 characters'),
    req(body('totalCopies')).isInt({ min: 1, max: BOOK.copiesMax }).withMessage(`Copies must be between 1 and ${BOOK.copiesMax}`).toInt(),
    body('description').optional().isString().isLength({ max: BOOK.description }).withMessage(`Description must be at most ${BOOK.description} characters`),
    body('publisher').optional().isString().trim().isLength({ max: BOOK.publisher }).withMessage(`Publisher must be at most ${BOOK.publisher} characters`),
    // null = "leave empty" for the optional numbers
    body('publishedYear').optional({ values: 'null' }).isInt({ min: BOOK.yearMin, max: BOOK.yearMax })
      .withMessage(`Year must be between ${BOOK.yearMin} and ${BOOK.yearMax}`).toInt(),
    body('pages').optional({ values: 'null' }).isInt({ min: 1, max: BOOK.pagesMax }).withMessage(`Pages must be between 1 and ${BOOK.pagesMax}`).toInt(),
    // The list of languages is checked in the handler (old imported values may stay unchanged)
    body('language').optional().isString().trim().isLength({ max: 40 }).withMessage('Language is too long'),
    body('shelfLocation').optional().isString().trim().customSanitizer((v) => String(v).toUpperCase())
      .isLength({ max: BOOK.shelf }).withMessage(`Shelf location must be at most ${BOOK.shelf} characters`)
      .custom((v) => v === '' || SHELF_RX.test(v)).withMessage('Shelf location must look like PRG-B4'),
    // Cover: empty, one of our own /covers/ files, or a full http(s) URL
    body('coverUrl').optional().isString().trim().isLength({ max: 500 }).withMessage('Cover URL is too long')
      .custom((v) => v === '' || /^\/covers\/[\w.-]+$/.test(v) || /^https?:\/\/[^\s"'<>]+$/i.test(v))
      .withMessage('Cover must be a link starting with http:// or https://'),
    body('subjects').optional().isArray({ max: BOOK.subjects }).withMessage(`At most ${BOOK.subjects} subjects`),
    // 60 is checked in the handler; up to 100 is allowed here only for subjects the book ALREADY had
    body('subjects.*').isString().trim().notEmpty().isLength({ max: 100 }).withMessage(`Subjects must be at most ${BOOK.subject} characters`),
  ];
};

// Some imported books have a language code ("ITA") or a subject longer than 60 characters, from
// before these rules existed. Those OLD values may stay as they are; anything new must follow the rules.
// Returns an express-validator-style error list (so the form can show it next to the field) or null.
function stricterRules(data, book) {
  const errors = [];
  if (data.language && !LANGUAGES.includes(data.language) && data.language !== book?.language) {
    errors.push({ path: 'language', msg: 'Choose a language from the list' });
  }
  if (data.subjects) {
    const old = new Set(book?.subjects || []);
    const bad = data.subjects.find((s) => s.length > BOOK.subject && !old.has(s));
    if (bad) errors.push({ path: 'subjects', msg: `Subjects must be at most ${BOOK.subject} characters` });
  }
  return errors.length ? errors : null;
}

// "self help books" -> "Self Help Books", "self-help" -> "Self-Help". Only the FIRST letter of each
// word is changed, so short forms the librarian typed in capitals stay as they are ("AI Basics").
const titleCase = (s) => s.replace(/(^|[\s-])(\p{L})/gu, (m, sep, letter) => sep + letter.toUpperCase());

// Category of a create/update. An EXISTING category is used as it is. A NEW one is saved in Title
// Case, but it may not repeat an existing category with other capitals ("fiction" vs "Fiction"):
// that would split one category into two in the filters. Returns an error list, or null.
async function checkCategory(data, book) {
  if (data.category === undefined || data.category === book?.category) return null;
  const existing = await Book.distinct('category'); // includes archived books: their category still exists
  if (existing.includes(data.category)) return null;
  const match = existing.find((c) => c.toLowerCase() === data.category.toLowerCase());
  if (match) return [{ path: 'category', msg: `The category "${match}" already exists. Choose it from the list.` }];
  data.category = titleCase(data.category);
  return null;
}

// matchedData = ONLY the fields listed in the rules above (whitelist). Anything else in the body,
// e.g. availableCopies or timesBorrowed, is ignored, so it cannot be changed through the API.
const bookData = (req) => {
  const data = matchedData(req, { locations: ['body'] });
  const unset = ['publishedYear', 'pages'].filter((k) => req.body[k] === null); // fields the admin cleared
  return { data, unset };
};

// POST /api/books  (admin) — add a new title; every copy starts on the shelf
router.post('/', protect, adminOnly, bookRules(false), validate, async (req, res, next) => {
  try {
    const { data } = bookData(req);
    const ruleErrors = stricterRules(data, null) || (await checkCategory(data, null));
    if (ruleErrors) return res.status(400).json({ message: ruleErrors[0].msg, errors: ruleErrors });
    if (await Book.exists({ isbn: data.isbn })) {
      return res.status(409).json({ message: 'A book with this ISBN already exists' });
    }
    const book = await Book.create({ ...data, availableCopies: data.totalCopies });
    clearFacetsCache(); // a new category/language/shelf may have appeared
    await logActivity({ type: 'book_added', actor: req.user, book, meta: bookSnap(book) });
    res.status(201).json({ book });
  } catch (err) {
    next(err);
  }
});

// PUT /api/books/:id  (admin) — edit; total copies can never go below the copies out on loan
router.put('/:id', protect, adminOnly, idRule, bookRules(true), validate, async (req, res, next) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ message: 'Book not found' });

    const { data, unset } = bookData(req);
    const ruleErrors = stricterRules(data, book) || (await checkCategory(data, book));
    if (ruleErrors) return res.status(400).json({ message: ruleErrors[0].msg, errors: ruleErrors });
    if (data.isbn && data.isbn !== book.isbn && (await Book.exists({ isbn: data.isbn }))) {
      return res.status(409).json({ message: 'A book with this ISBN already exists' });
    }

    if (data.totalCopies !== undefined) {
      const onLoan = await countOnLoan(book._id);
      if (data.totalCopies < onLoan) {
        const copies = (n) => `${n} ${n === 1 ? 'copy' : 'copies'}`;
        return res.status(400).json({
          message: `${copies(onLoan)} ${onLoan === 1 ? 'is' : 'are'} borrowed, so this book needs at least ${copies(onLoan)}.`,
        });
      }
      book.availableCopies = data.totalCopies - onLoan; // shelf copies = owned - borrowed
    }

    Object.assign(book, data);
    unset.forEach((k) => { book[k] = undefined; });
    const fields = book.modifiedPaths().filter((f) => f !== 'availableCopies'); // which fields really changed
    await book.save(); // save() runs the schema validators again
    clearFacetsCache();
    if (fields.length) await logActivity({ type: 'book_updated', actor: req.user, book, meta: { ...bookSnap(book), fields } });
    res.json({ book });
  } catch (err) {
    next(err);
  }
});

// "This book has 2 copies borrowed. Wait until they are returned before archiving it."
const borrowedMessage = (onLoan, action) =>
  `This book has ${onLoan} ${onLoan === 1 ? 'copy' : 'copies'} borrowed. Wait until ${onLoan === 1 ? 'it is' : 'they are'} returned before ${action} it.`;

// DELETE /api/books/:id  (admin) — permanent delete, ONLY for a book that was never borrowed.
// A book with borrowing history must be archived instead (PUT /:id/archive), so old transactions
// still show which book they were about.
router.delete('/:id', protect, adminOnly, idRule, validate, async (req, res, next) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ message: 'Book not found' });

    const onLoan = await countOnLoan(book._id);
    if (onLoan > 0) return res.status(400).json({ message: borrowedMessage(onLoan, 'deleting') });
    if (await Borrow.exists({ book: book._id })) return res.status(400).json({ message: MESSAGES.bookHasHistory });

    // Its uploaded cover goes too
    await Promise.all([book.deleteOne(), BookCover.deleteOne({ book: book._id })]);
    clearFacetsCache();
    // The book is gone, so the snapshot (title, ISBN) is what the activity row will show
    await logActivity({ type: 'book_deleted', actor: req.user, book: book._id, meta: { ...bookSnap(book), isbn: book.isbn } });
    res.json({ message: 'Book deleted' });
  } catch (err) {
    next(err);
  }
});

// PUT /api/books/:id/archive  (admin) — hide the book from the catalog but keep it in the records.
// Blocked while copies are borrowed (same rule as deleting).
router.put('/:id/archive', protect, adminOnly, idRule, validate, async (req, res, next) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ message: 'Book not found' });
    if (book.isArchived) return res.status(400).json({ message: 'This book is already archived' });
    const onLoan = await countOnLoan(book._id);
    if (onLoan > 0) return res.status(400).json({ message: borrowedMessage(onLoan, 'archiving') });

    book.isArchived = true;
    book.archivedAt = new Date();
    book.archivedBy = req.user._id;
    await book.save();
    clearFacetsCache(); // its category/language may no longer appear in the filters
    await logActivity({ type: 'book_archived', actor: req.user, book, meta: { ...bookSnap(book), isbn: book.isbn } });
    res.json({ book });
  } catch (err) {
    next(err);
  }
});

// PUT /api/books/:id/restore  (admin) — bring an archived book back into the catalog
router.put('/:id/restore', protect, adminOnly, idRule, validate, async (req, res, next) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ message: 'Book not found' });
    if (!book.isArchived) return res.status(400).json({ message: 'This book is not archived' });

    book.isArchived = false;
    book.archivedAt = null;
    book.archivedBy = null;
    await book.save();
    clearFacetsCache();
    await logActivity({ type: 'book_restored', actor: req.user, book, meta: { ...bookSnap(book), isbn: book.isbn } });
    res.json({ book });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Cover photos (uploaded by librarians, stored in the BookCover collection)
// ---------------------------------------------------------------------------
const MAX_COVER_BYTES = 300 * 1024; // 300 KB (the browser already shrinks photos to about 50–150 KB)
const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// multer reads the multipart/form-data upload. memoryStorage keeps the file in RAM (req.file.buffer)
// instead of writing it to disk; "limits" stops reading after 300 KB, so a huge file cannot fill memory.
const uploadCover = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_COVER_BYTES, files: 1 },
  fileFilter: (req, file, cb) => cb(null, COVER_TYPES.includes(file.mimetype)), // first, cheap check
}).single('cover');

// Runs multer and turns its errors into clear 400/413 answers
const receiveCover = (req, res, next) => uploadCover(req, res, (err) => {
  if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ message: 'The image is larger than 300 KB' });
  if (err) return res.status(400).json({ message: 'Upload one image in the "cover" field' });
  next();
});

// PUT /api/books/:id/cover  (admin) — upload or replace the cover photo
router.put('/:id/cover', protect, adminOnly, idRule, validate, receiveCover, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Choose a JPG, PNG or WEBP image' });
    // The REAL check: read the file's first bytes. A renamed .exe or a fake "image/png" fails here.
    const info = imageInfo(req.file.buffer);
    if (!info || !COVER_TYPES.includes(info.type)) {
      return res.status(400).json({ message: 'This file is not a real JPG, PNG or WEBP image' });
    }
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ message: 'Book not found' });

    // upsert: create the cover the first time, replace it after that (one cover per book)
    await BookCover.findOneAndUpdate(
      { book: book._id },
      { data: req.file.buffer, contentType: info.type, size: req.file.size, width: info.width, height: info.height, updatedAt: new Date() },
      { upsert: true, runValidators: true }
    );
    const updated = await Book.findByIdAndUpdate(
      book._id,
      { $set: { hasCustomCover: true }, $inc: { coverVersion: 1 } }, // new version -> new image URL
      { new: true }
    ).lean();
    await logActivity({ type: 'book_updated', actor: req.user, book: updated, meta: { ...bookSnap(updated), cover: 'uploaded' } });
    res.json({ book: updated });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/books/:id/cover  (admin) — remove the uploaded photo (the ISBN cover or initials show again)
router.delete('/:id/cover', protect, adminOnly, idRule, validate, async (req, res, next) => {
  try {
    const book = await Book.findById(req.params.id);
    if (!book) return res.status(404).json({ message: 'Book not found' });
    await BookCover.deleteOne({ book: book._id });
    const updated = await Book.findByIdAndUpdate(
      book._id,
      { $set: { hasCustomCover: false }, $inc: { coverVersion: 1 } },
      { new: true }
    ).lean();
    await logActivity({ type: 'book_updated', actor: req.user, book: updated, meta: { ...bookSnap(updated), cover: 'removed' } });
    res.json({ book: updated });
  } catch (err) {
    next(err);
  }
});

// GET /api/books/:id/cover  (PUBLIC, read-only) — the image itself, for <img src="...">.
// Public because an <img> tag cannot send our JWT, and a book cover is not private information.
// crossOriginResourcePolicy "cross-origin" (THIS route only): helmet's default (same-origin) would
// block the picture when the website (e.g. Vercel) and the API (e.g. Render) are on different domains.
router.get(
  '/:id/cover',
  helmet.crossOriginResourcePolicy({ policy: 'cross-origin' }),
  idRule,
  validate,
  async (req, res, next) => {
    try {
      const cover = await BookCover.findOne({ book: req.params.id });
      if (!cover) return res.status(404).json({ message: 'This book has no uploaded cover' });

      // ETag = a fingerprint of this version. If the browser already has it, answer 304 (no image bytes sent).
      const etag = `"${cover._id}-${cover.updatedAt.getTime()}"`;
      res.set({
        'Content-Type': cover.contentType,
        // The URL changes (?v=) whenever the cover changes, so it can be cached for a long time
        'Cache-Control': 'public, max-age=31536000, immutable',
        ETag: etag,
      });
      if (req.headers['if-none-match'] === etag) return res.status(304).end();
      res.send(cover.data);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
module.exports.clearFacetsCache = clearFacetsCache;
