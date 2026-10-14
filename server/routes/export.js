const express = require('express');
const mongoose = require('mongoose');
const rateLimit = require('express-rate-limit');
const { body, param, matchedData } = require('express-validator');
const Book = require('../models/Book');
const Borrow = require('../models/Borrow');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');
const { validate } = require('../middleware/error');
const { logActivity } = require('../utils/activity');
const { formatManila, fileStamp } = require('../utils/manila');
const { DAY_MS, deriveStatus } = require('../utils/transactionStatus');
// The SAME filter/sort builders as the list endpoints, so an export of "All matching current filters"
// contains exactly the rows the librarian sees in the table.
const { bookFilterRules, buildBookFilter, bookSort, SORTS: BOOK_SORTS } = require('../queries/books');
const { txFilterRules, buildTxMatch, txSortStages, SORT_KEYS: TX_SORTS } = require('../queries/transactions');
const { userFilterRules, userPipeline, userSort, USER_SORTS } = require('../queries/users');
const { columnsFor } = require('../export/columns');
const { describeFilters, sortLabel } = require('../export/describe');
const { toCsv } = require('../export/csv');
const { toXlsx } = require('../export/xlsx');
const { toPdf } = require('../export/pdf');

// POST /api/export/:entity — download books, members or transactions as CSV, Excel or PDF
const router = express.Router();

// Bigger JSON limit for THIS route only (the rest of the API keeps 10 KB, see server.js).
// The request asked for 100 KB, but 10,000 selected ids are about 270 KB of JSON
// (each id is 24 characters + quotes + comma), so 300 KB is needed to really allow 10,000.
router.use(express.json({ limit: '300kb' }));
router.use(protect, adminOnly);

// 20 exports per 10 minutes PER LIBRARIAN (keyed by user id, not IP: librarians on the same
// school network share one IP address). Building big files is heavy work for the server.
router.use(rateLimit({
  windowMs: 10 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => String(req.user._id),
  message: { message: 'Too many exports. Please wait a few minutes and try again.' },
}));

const ENTITIES = ['books', 'members', 'transactions'];
const FORMATS = {
  csv: { ext: 'csv', label: 'CSV', type: 'text/csv; charset=utf-8', max: 10000 },
  xlsx: { ext: 'xlsx', label: 'Excel', type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', max: 10000 },
  // PDF is limited to fewer rows: 2,000 rows is already ~70 pages
  pdf: { ext: 'pdf', label: 'PDF', type: 'application/pdf', max: 2000 },
};
const TITLES = { books: 'Books', members: 'Members', transactions: 'Transactions' };
const MAX_IDS = 10000;

// Validation of the request body. The filter rules are the list endpoints' rules, applied to
// body.filters instead of the query string (field = body('filters.<name>')).
const filtersOf = (req) => req.body?.filters || {};
const filterField = (name) => body(`filters.${name}`);
const SORT_KEYS = { books: Object.keys(BOOK_SORTS), members: Object.keys(USER_SORTS), transactions: TX_SORTS };
const ENTITY_RULES = {
  books: bookFilterRules(filterField, filtersOf),
  members: userFilterRules(filterField),
  transactions: txFilterRules(filterField),
};
const commonRules = [
  body('format').isIn(Object.keys(FORMATS)).withMessage('Choose CSV, Excel or PDF'),
  body('scope').isIn(['selected', 'page', 'filtered']).withMessage('Invalid export scope'),
  // ids are only needed (and required) for "selected"
  body('ids').if(body('scope').equals('selected'))
    .isArray({ min: 1, max: MAX_IDS }).withMessage(`Select between 1 and ${MAX_IDS.toLocaleString('en-US')} rows`),
  body('ids.*').isMongoId().withMessage('Invalid id in the selection'),
  body('filters').optional().isObject().withMessage('Invalid filters'),
  body('sort').optional({ values: 'falsy' })
    .custom((v, { req }) => SORT_KEYS[req.params.entity].includes(v)).withMessage('Invalid sort option'),
  body('page').optional().isInt({ min: 1, max: 100000 }).withMessage('Invalid page').toInt(),
  body('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit').toInt(),
];
// The entity is only known at request time, so its rule chains are run here (chain.run(req))
const entityRules = async (req, res, next) => {
  try {
    await Promise.all([...commonRules, ...ENTITY_RULES[req.params.entity]].map((rule) => rule.run(req)));
    next();
  } catch (err) {
    next(err);
  }
};

const objectIds = (ids) => ids.map((id) => new mongoose.Types.ObjectId(id));

// ---------------------------------------------------------------------------
// Data per entity. Each returns { count(), rows(skip, limit) } for the chosen scope.
// ---------------------------------------------------------------------------
function booksSource({ scope, ids, filters, sort }, now) {
  const filter = scope === 'selected' ? { _id: { $in: objectIds(ids) } } : buildBookFilter(filters, now);
  return {
    count: () => Book.countDocuments(filter),
    rows: (skip, limit) => Book.find(filter).sort(bookSort(sort)).skip(skip).limit(limit)
      .select('-openLibraryKey -coverVersion -coverUrl -__v').lean(),
  };
}

function membersSource({ scope, ids, filters, sort }, now) {
  // Selected rows: the same pipeline without filters, limited to the chosen ids
  const pipeline = scope === 'selected'
    ? [{ $match: { _id: { $in: objectIds(ids) } } }, ...userPipeline({}, now)]
    : userPipeline(filters, now);
  return {
    count: async () => (await User.aggregate([...pipeline, { $count: 'n' }]))[0]?.n || 0,
    rows: async (skip, limit) => {
      const users = await User.aggregate([...pipeline, { $sort: userSort(sort) }, { $skip: skip }, { $limit: limit }]);
      // Borrowing history numbers for these members, in ONE grouped query
      const stats = await Borrow.aggregate([
        { $match: { user: { $in: users.map((u) => u._id) } } },
        {
          $group: {
            _id: '$user',
            total: { $sum: 1 },
            returned: { $sum: { $cond: [{ $eq: ['$status', 'returned'] }, 1, 0] } },
            onTime: { $sum: { $cond: [{ $and: [{ $eq: ['$status', 'returned'] }, { $lte: ['$returnedAt', '$dueDate'] }] }, 1, 0] } },
          },
        },
      ]);
      const byUser = new Map(stats.map((s) => [String(s._id), s]));
      return users.map((u) => {
        const s = byUser.get(String(u._id)) || {};
        // avatarKey / lastLoginIp are dropped here as well (never exported)
        const { avatarKey, lastLoginIp, ...safe } = u;
        return { ...safe, totalBorrowed: s.total || 0, returnedCount: s.returned || 0, onTimeCount: s.onTime || 0 };
      });
    },
  };
}

async function transactionsSource({ scope, ids, filters, sort }, now) {
  const match = scope === 'selected' ? { _id: { $in: objectIds(ids) } } : (await buildTxMatch(filters, now)).match;
  return {
    count: () => Borrow.countDocuments(match),
    rows: async (skip, limit) => {
      const rows = await Borrow.aggregate([
        { $match: match }, ...txSortStages(sort, now), { $skip: skip }, { $limit: limit }, { $project: { _rank: 0 } },
      ]);
      await Borrow.populate(rows, [
        { path: 'book', select: 'title isbn' },
        { path: 'user', select: 'name email memberId' },
        { path: 'processedBy', select: 'name' },
      ]);
      return rows.map((t) => {
        // Days late: returned late -> days between return date and actual return; still out -> until now
        const end = t.status === 'returned' ? t.returnedAt : now;
        const daysLate = end && end > t.dueDate ? Math.ceil((end - t.dueDate) / DAY_MS) : 0;
        return { ...t, derivedStatus: deriveStatus(t, now), daysLate };
      });
    },
  };
}
const SOURCES = { books: booksSource, members: membersSource, transactions: transactionsSource };

const plural = (n, word) => `${n.toLocaleString('en-US')} ${n === 1 ? word.replace(/s$/, '') : word}`;

router.post(
  '/:entity',
  param('entity').isIn(ENTITIES).withMessage('Unknown export type'),
  validate,
  entityRules,
  validate,
  async (req, res, next) => {
    try {
      const now = new Date();
      const { entity } = req.params;
      // matchedData = ONLY the validated fields (unknown keys in the body are dropped)
      const data = matchedData(req, { locations: ['body'] });
      const filters = data.filters || {};
      const sort = data.sort || filters.sort;
      const fmt = FORMATS[data.format];
      const noun = entity === 'transactions' ? 'transactions' : entity;

      const source = await SOURCES[entity]({ scope: data.scope, ids: data.ids || [], filters, sort }, now);

      // Which rows: the selection, one page, or everything matching the filters (with a cap)
      let skip = 0;
      let limit;
      let scopeLabel;
      if (data.scope === 'page') {
        const page = data.page || 1;
        limit = data.limit || 10;
        skip = (page - 1) * limit;
        scopeLabel = `Current page (page ${page}, ${limit} per page)`;
      } else {
        const count = await source.count();
        if (count > fmt.max) {
          return res.status(400).json({
            message: `${plural(count, noun)} match. ${fmt.label} exports are limited to ${fmt.max.toLocaleString('en-US')} rows — `
              + (data.format === 'pdf' ? 'choose CSV or Excel, or narrow the filters.' : 'narrow the filters first.'),
          });
        }
        limit = Math.max(count, 1);
        scopeLabel = data.scope === 'selected' ? `Selected rows (${count.toLocaleString('en-US')})` : 'All matching current filters';
      }
      const rows = await source.rows(skip, limit);

      const columns = columnsFor(entity, data.format);
      const filterLines = data.scope === 'selected' ? [] : describeFilters(entity, filters);
      const sortText = sortLabel(entity, sort);
      if (sortText) filterLines.push(`Sort: ${sortText}`);
      const info = {
        title: `${TITLES[entity]} report`,
        sheetName: TITLES[entity],
        generatedAt: formatManila(now),
        generatedBy: `${req.user.name} (${req.user.email})`,
        scopeLabel,
        filters: filterLines,
        count: rows.length,
        theme: req.user.preferences?.theme,
      };

      let file;
      if (data.format === 'csv') file = toCsv(columns, rows);
      else if (data.format === 'xlsx') file = await toXlsx(columns, rows, info);
      else file = await toPdf(columns, rows, info);

      await logActivity({
        type: 'data_exported', actor: req.user,
        meta: { entity, format: data.format, scope: data.scope, count: rows.length },
      });

      const fileName = `stacks-${entity}-${fileStamp(now)}.${fmt.ext}`; // e.g. stacks-books-2026-10-14-0912.xlsx
      res.set({
        'Content-Type': fmt.type,
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'X-Export-Count': String(rows.length), // the website shows "Exported 1,000 books as Excel"
        'Cache-Control': 'no-store', // the file can contain personal data: never keep it in a cache
      });
      res.send(file);
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
