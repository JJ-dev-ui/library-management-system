const express = require('express');
const { query, matchedData } = require('express-validator');
const Book = require('../models/Book');
const Borrow = require('../models/Borrow');
const { protect } = require('../middleware/auth');
const { memberFilterRules, buildMemberFilter, memberSort, withMemberStatus } = require('../queries/memberBooks');
const { memberBlock } = require('../utils/requestRules');
const { validate } = require('../middleware/error');
const { containsRx } = require('../utils/escapeRegex');
const { CARD_SELECT, memberBook } = require('../utils/memberBook');
const { DAY_MS } = require('../utils/transactionStatus');

// Member portal reading endpoints: the Home feed and the two "highlights" side columns.
// Only member-safe book fields are sent (utils/memberBook.js); archived books never appear.
// (mounted at /api, so protect is on each route: a router-level router.use(protect) would also run
// for every OTHER /api request passing through this router)
const router = express.Router();

const NOT_ARCHIVED = { isArchived: { $ne: true } };
const MOD = 1000003; // a prime a bit larger than the biggest feedRank (999,999)

// GET /api/feed?seed=&page=&limit=&search=&category=&available=&author=&language=&yearFrom=&yearTo=
//               &length=&added=&hideBorrowed=&sort=
//   sort=recommended (default) without search: "shuffled" order = (feedRank + seed) mod 1,000,003.
//   A new seed (new visit, or clicking Home again) gives a new order; the SAME seed always gives the
//   same order, so infinite scroll never repeats or skips books. (No $sample: that would be random on
//   every page.) With a search it is ordered by title. Any other sort turns the shuffle off.
// Every book also gets bookmarked + myStatus; the member's block reason (late book / 5-book limit)
// is sent ONCE for the whole page (requestBlock), not per book.
router.get(
  '/feed',
  protect,
  [
    query('seed').optional().isInt({ min: 0, max: MOD - 1 }).withMessage('Invalid seed').toInt(),
    query('page').optional().isInt({ min: 1, max: 10000 }).withMessage('Invalid page').toInt(),
    query('limit').optional().isInt({ min: 1, max: 20 }).withMessage('Invalid limit').toInt(),
    ...memberFilterRules(query),
  ],
  validate,
  async (req, res, next) => {
    try {
      const q = matchedData(req, { locations: ['query'] });
      const page = q.page || 1;
      const limit = q.limit || 10;
      const match = await buildMemberFilter(q, req.user._id);

      const sort = memberSort(q.sort);
      const order = sort ? [{ $sort: sort }]
        : q.search ? [{ $sort: { title: 1, _id: 1 } }]
          : [
            // $ifNull: a book without feedRank (very old data) counts as 0 instead of breaking the sort
            { $addFields: { _rank: { $mod: [{ $add: [{ $ifNull: ['$feedRank', 0] }, q.seed || 0] }, MOD] } } },
            { $sort: { _rank: 1, _id: 1 } },
          ];
      const fields = Object.fromEntries(CARD_SELECT.split(' ').map((f) => [f, 1]));
      const [books, total, requestBlock] = await Promise.all([
        Book.aggregate([{ $match: match }, ...order, { $skip: (page - 1) * limit }, { $limit: limit }, { $project: fields }]),
        Book.countDocuments(match),
        req.user.role === 'member' ? memberBlock(req.user) : null,
      ]);
      res.json({ books: await withMemberStatus(req.user._id, books), total, page, hasMore: page * limit < total, requestBlock });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/feed/suggest?q=… — the search box suggestions: up to 5 titles and 3 authors
router.get(
  '/feed/suggest',
  protect,
  [query('q').isString().trim().isLength({ min: 2, max: 100 }).withMessage('Type at least 2 characters')],
  validate,
  async (req, res, next) => {
    try {
      const rx = containsRx(req.query.q); // escaped: typed text is never treated as a regex
      const [titles, authors] = await Promise.all([
        Book.find({ ...NOT_ARCHIVED, title: rx }).sort({ title: 1 }).limit(5).select('title authors').lean(),
        Book.aggregate([
          { $match: { ...NOT_ARCHIVED, authors: rx } },
          { $unwind: '$authors' },
          { $match: { authors: rx } },
          { $group: { _id: '$authors' } },
          { $sort: { _id: 1 } },
          { $limit: 3 },
        ]),
      ]);
      res.json({
        titles: titles.map((b) => ({ _id: b._id, title: b.title, authors: b.authors })),
        authors: authors.map((a) => a._id),
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/member/highlights?newRange=7|30&popularRange=week|month — the two side columns.
// The same answer for every member, so it is cached in memory for 60 seconds per combination.
const CACHE_MS = 60 * 1000;
const cache = new Map();

router.get(
  '/member/highlights',
  protect,
  [
    query('newRange').optional().isIn(['7', '30']).withMessage('newRange must be 7 or 30'),
    query('popularRange').optional().isIn(['week', 'month']).withMessage('popularRange must be week or month'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const newRange = Number(req.query.newRange || 7);
      const popularRange = req.query.popularRange || 'week';
      const key = `${newRange}|${popularRange}`;
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < CACHE_MS) return res.json(hit.data);

      const now = Date.now();
      const since = new Date(now - (popularRange === 'week' ? 7 : 30) * DAY_MS);
      const [newArrivals, popular] = await Promise.all([
        Book.find({ ...NOT_ARCHIVED, createdAt: { $gte: new Date(now - newRange * DAY_MS) } })
          .sort({ createdAt: -1, _id: -1 }).limit(6).select(CARD_SELECT).lean(),
        Borrow.aggregate([
          { $match: { borrowedAt: { $gte: since } } },
          { $group: { _id: '$book', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          // Archived books are dropped by the $lookup + $unwind, THEN the top 5 is taken
          { $lookup: { from: Book.collection.name, localField: '_id', foreignField: '_id', as: 'book', pipeline: [{ $match: NOT_ARCHIVED }] } },
          { $unwind: '$book' },
          { $limit: 5 },
        ]),
      ]);
      const data = {
        newRange, popularRange,
        newArrivals: newArrivals.map((b) => memberBook(b)),
        mostBorrowed: popular.map((p) => ({ ...memberBook(p.book), borrows: p.count })),
      };
      cache.set(key, { data, at: Date.now() });
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
