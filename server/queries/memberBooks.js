// Filters for the MEMBER portal (Home feed and Bookmarks). A member-safe subset of the admin book
// filters: it reuses the admin builders (queries/books.js), so both sides filter the same way, but a
// member can never ask for archived books (the "archived" switch is simply not accepted here).
const Borrow = require('../models/Borrow');
const BorrowRequest = require('../models/BorrowRequest');
const Bookmark = require('../models/Bookmark');
const { containsRx } = require('../utils/escapeRegex');
const { buildBookFilter, bookSort } = require('./books');
const { memberBook } = require('../utils/memberBook');

// Sort keys a member may use. "recommended" = the shuffled feed (or, with a search, by title);
// the others are the admin sort keys with the same meaning.
const MEMBER_SORTS = ['recommended', 'newest', 'title', 'year_desc', 'year_asc', 'popular'];

// express-validator rules for the query string (whitelists + length limits)
function memberFilterRules(query) {
  const str = (name, max) => query(name).optional({ values: 'falsy' }).isString().trim().isLength({ max }).withMessage(`Invalid ${name}`);
  return [
    str('search', 100), str('category', 50), str('author', 100), str('language', 40),
    query('available').optional({ values: 'falsy' }).isIn(['true']).withMessage('Invalid availability filter'),
    query('yearFrom').optional({ values: 'falsy' }).isInt({ min: 0, max: 3000 }).withMessage('Invalid "year from"').toInt(),
    query('yearTo').optional({ values: 'falsy' }).isInt({ min: 0, max: 3000 }).withMessage('Invalid "year to"').toInt()
      .custom((to, { req }) => !req.query.yearFrom || to >= Number(req.query.yearFrom)).withMessage('"Year to" must be after "year from"'),
    query('length').optional({ values: 'falsy' }).isIn(['short', 'medium', 'long']).withMessage('Invalid length filter'),
    query('added').optional({ values: 'falsy' }).isIn(['week', 'month']).withMessage('Invalid "added" filter'),
    query('hideBorrowed').optional({ values: 'falsy' }).isIn(['true']).withMessage('Invalid filter'),
    query('sort').optional({ values: 'falsy' }).isIn(MEMBER_SORTS).withMessage('Invalid sort option'),
  ];
}

// Validated query -> MongoDB filter. Archived books are ALWAYS excluded (buildBookFilter does that
// unless archived=include, which members cannot send).
async function buildMemberFilter(q, userId) {
  const base = buildBookFilter({
    category: q.category,
    availability: q.available ? 'available' : undefined,
    author: q.author,
    language: q.language,
    yearFrom: q.yearFrom,
    yearTo: q.yearTo,
    length: q.length,
    addedWithin: q.added ? (q.added === 'week' ? '7' : '30') : undefined,
  });
  const and = [...(base.$and || [])];
  if (q.search) {
    // Title / subtitle / authors, or the ISBN typed with or without dashes (escaped regex)
    const rx = containsRx(q.search);
    const isbnRx = containsRx(q.search.replace(/[\s-]/g, '') || q.search);
    and.push({ $or: [{ title: rx }, { subtitle: rx }, { authors: rx }, { isbn: isbnRx }] });
  }
  if (q.hideBorrowed) {
    // "Hide books I've borrowed before": only THIS member's own transactions are read
    const mine = await Borrow.distinct('book', { user: userId });
    and.push({ _id: { $nin: mine } });
  }
  return and.length ? { $and: and } : {};
}

// The admin sort for a member sort key (null = keep the shuffled / saved order)
const memberSort = (key) => (key && key !== 'recommended' ? bookSort(key) : null);

// Adds, for the logged-in member, "bookmarked" and "myStatus" (none | requested | borrowing) to each
// book of a page. THREE queries for the whole page, never one per book (no N+1).
async function withMemberStatus(userId, books) {
  const ids = books.map((b) => b._id);
  const [saved, borrowing, requested] = await Promise.all([
    Bookmark.find({ user: userId, book: { $in: ids } }).select('book').lean(),
    Borrow.find({ user: userId, status: 'borrowed', book: { $in: ids } }).select('book dueDate').lean(),
    BorrowRequest.find({ user: userId, status: 'pending', book: { $in: ids } }).select('book expiresAt').lean(),
  ]);
  const savedIds = new Set(saved.map((s) => String(s.book)));
  const dueByBook = new Map(borrowing.map((l) => [String(l.book), l.dueDate]));
  const requestedIds = new Set(requested.map((r) => String(r.book)));
  return books.map((b) => {
    const id = String(b._id);
    const myStatus = dueByBook.has(id) ? 'borrowing' : requestedIds.has(id) ? 'requested' : 'none';
    return { ...memberBook(b), bookmarked: savedIds.has(id), myStatus, myDueDate: dueByBook.get(id) || null };
  });
}

module.exports = { MEMBER_SORTS, memberFilterRules, buildMemberFilter, memberSort, withMemberStatus };
