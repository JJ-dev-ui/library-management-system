// Shared query logic for books: used by GET /api/books (the list) AND by the export,
// so an export of "All matching current filters" returns exactly the rows the list shows.
const { containsRx, escapeRegex } = require('../utils/escapeRegex');
const { manilaMidnight } = require('../utils/manila');

const DAY_MS = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Whitelists: the client sends a KEY, the server picks the real query from here.
// User input is never passed directly to .sort() or used as a field name.
// ---------------------------------------------------------------------------

// "Search in" dropdown -> which fields the search text is matched against
const SEARCH_FIELDS = {
  all: ['title', 'subtitle', 'authors', 'isbn', 'publisher', 'subjects', 'description'],
  title: ['title', 'subtitle'],
  author: ['authors'],
  isbn: ['isbn'],
  publisher: ['publisher'],
  subject: ['subjects'],
};

// Sort options. _id is added last so pages are stable (books with the same title never swap pages).
const SORTS = {
  title: { title: 1, _id: 1 },
  title_desc: { title: -1, _id: 1 },
  author: { authors: 1, title: 1, _id: 1 }, // on an array field MongoDB sorts by the smallest value
  newest: { createdAt: -1, _id: 1 },
  year_desc: { publishedYear: -1, title: 1, _id: 1 },
  year_asc: { publishedYear: 1, title: 1, _id: 1 },
  available: { availableCopies: -1, title: 1, _id: 1 },
  popular: { timesBorrowed: -1, title: 1, _id: 1 },
};

const AVAILABILITY = {
  available: { availableCopies: { $gt: 0 } },
  low: { availableCopies: 1 }, // exactly one copy left on the shelf
  out: { availableCopies: 0 },
};
const LENGTHS = {
  short: { pages: { $lt: 200 } },
  medium: { pages: { $gte: 200, $lte: 400 } },
  long: { pages: { $gt: 400 } },
};
const COPIES = {
  single: { totalCopies: 1 },
  few: { totalCopies: { $gte: 2, $lte: 5 } },
  many: { totalCopies: { $gte: 6 } },
};
const ADDED_WITHIN = ['today', '7', '30', '90']; // "today" = since midnight in Manila; numbers = days

// Validation rules for the filters.
// field(name) creates the validator for one input: query(name) for the list, body(`filters.${name}`)
// for the export. src(req) returns the object holding the filters (needed to compare yearFrom/yearTo).
function bookFilterRules(field, src) {
  const maxStr = (name, max = 100) => field(name).optional().isString().trim().isLength({ max }).withMessage(`${name} is too long`);
  return [
    maxStr('search'),
    field('searchIn').optional({ values: 'falsy' }).isIn(Object.keys(SEARCH_FIELDS)).withMessage('Invalid search field'),
    maxStr('category', 50),
    field('availability').optional({ values: 'falsy' }).isIn(Object.keys(AVAILABILITY)).withMessage('Invalid availability filter'),
    maxStr('author'),
    maxStr('language'),
    maxStr('publisher'),
    maxStr('shelf'),
    field('yearFrom').optional({ values: 'falsy' }).isInt({ min: 0, max: 3000 }).withMessage('Invalid "year from"').toInt(),
    field('yearTo').optional({ values: 'falsy' }).isInt({ min: 0, max: 3000 }).withMessage('Invalid "year to"').toInt()
      .custom((to, { req }) => !src(req)?.yearFrom || to >= Number(src(req).yearFrom)).withMessage('"Year to" must be after "year from"'),
    field('length').optional({ values: 'falsy' }).isIn(Object.keys(LENGTHS)).withMessage('Invalid length filter'),
    field('copies').optional({ values: 'falsy' }).isIn(Object.keys(COPIES)).withMessage('Invalid copies filter'),
    field('addedWithin').optional({ values: 'falsy' }).isIn(ADDED_WITHIN).withMessage('Invalid "date added" filter'),
    // "Show archived books" switch: 'include' = archived books are listed too (with an "Archived" badge)
    field('archived').optional({ values: 'falsy' }).isIn(['include']).withMessage('Invalid archived filter'),
    field('sort').optional({ values: 'falsy' }).isIn(Object.keys(SORTS)).withMessage('Invalid sort option'),
  ];
}

// Builds the MongoDB filter from (already validated) filters
function buildBookFilter(q = {}, now = new Date()) {
  const and = [];

  // Archived books are hidden unless the "Show archived books" switch is on.
  // $ne: true also matches books saved before the isArchived field existed.
  if (q.archived !== 'include') and.push({ isArchived: { $ne: true } });

  if (q.search) {
    let text = q.search.trim();
    if (q.searchIn === 'isbn') text = text.replace(/[\s-]/g, ''); // "978-0-13..." also finds the ISBN
    const rx = containsRx(text);
    const fields = SEARCH_FIELDS[q.searchIn] || SEARCH_FIELDS.all;
    // A regex on an array field (authors, subjects) matches if ANY element matches
    and.push({ $or: fields.map((f) => ({ [f]: rx })) });
  }
  if (q.category && q.category !== 'All') and.push({ category: q.category });
  if (q.availability) and.push(AVAILABILITY[q.availability]);
  if (q.author) and.push({ authors: containsRx(q.author) });
  if (q.language) and.push({ language: q.language });
  if (q.publisher) and.push({ publisher: containsRx(q.publisher) });
  // Shelf code prefix: "PRG" matches "PRG-B4" (anchored at the start, escaped)
  if (q.shelf) and.push({ shelfLocation: new RegExp(`^${escapeRegex(q.shelf.trim())}(-|$)`, 'i') });
  if (q.yearFrom || q.yearTo) {
    const year = {};
    if (q.yearFrom) year.$gte = q.yearFrom;
    if (q.yearTo) year.$lte = q.yearTo;
    and.push({ publishedYear: year });
  }
  if (q.length) and.push(LENGTHS[q.length]);
  if (q.copies) and.push(COPIES[q.copies]);
  if (q.addedWithin) {
    const since = q.addedWithin === 'today' ? manilaMidnight(now, 0) : new Date(now.getTime() - Number(q.addedWithin) * DAY_MS);
    and.push({ createdAt: { $gte: since } });
  }

  return and.length ? { $and: and } : {};
}

const bookSort = (key) => SORTS[key] || SORTS.title;

module.exports = { SEARCH_FIELDS, SORTS, bookFilterRules, buildBookFilter, bookSort };
