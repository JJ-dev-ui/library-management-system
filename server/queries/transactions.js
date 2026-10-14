// Shared query logic for transactions: used by GET /api/transactions (the list) AND by the export.
const Book = require('../models/Book');
const User = require('../models/User');
const { containsRx } = require('../utils/escapeRegex');
const { statusFilter } = require('../utils/transactionStatus');

const STATUS_KEYS = ['active', 'due_soon', 'overdue', 'returned', 'returned_on_time', 'returned_late'];
const TAB_KEYS = ['active', 'due_soon', 'overdue', 'returned']; // the status tabs that show counts
const SORT_KEYS = ['newest', 'due_soonest', 'most_overdue'];

// Validation rules for the filters. field(name) = query(name) for the list, body(`filters.${name}`) for the export.
function txFilterRules(field) {
  const dateRule = (name) => field(name).optional({ values: 'falsy' }).isISO8601().withMessage(`Invalid date: ${name}`);
  return [
    field('search').optional().isString().trim().isLength({ max: 100 }).withMessage('Search is too long'),
    field('status').optional({ values: 'falsy' }).isIn(STATUS_KEYS).withMessage('Invalid status filter'),
    dateRule('borrowedFrom'), dateRule('borrowedTo'), dateRule('dueFrom'), dateRule('dueTo'),
    field('sort').optional({ values: 'falsy' }).isIn(SORT_KEYS).withMessage('Invalid sort option'),
  ];
}

// Filters shared by the table AND the tab counts (everything except the status)
async function txBaseFilters(q = {}) {
  const and = [];
  if (q.search) {
    // Member and book fields live in other collections: find the matching IDs first,
    // then match loans by those IDs (or by the transaction code itself).
    const rx = containsRx(q.search);
    const [users, books] = await Promise.all([
      User.find({ $or: [{ name: rx }, { email: rx }, { memberId: rx }] }).select('_id').limit(1000).lean(),
      Book.find({ $or: [{ title: rx }, { isbn: rx }] }).select('_id').limit(1000).lean(),
    ]);
    and.push({
      $or: [
        { code: rx },
        { user: { $in: users.map((u) => u._id) } },
        { book: { $in: books.map((b) => b._id) } },
      ],
    });
  }
  const range = (field, from, to) => {
    if (!from && !to) return;
    const r = {};
    if (from) r.$gte = new Date(from);
    if (to) r.$lte = new Date(to);
    and.push({ [field]: r });
  };
  range('borrowedAt', q.borrowedFrom, q.borrowedTo);
  range('dueDate', q.dueFrom, q.dueTo);
  return and;
}

const andOf = (parts) => (parts.length ? { $and: parts } : {});

// The full filter of the list: base filters + the selected status tab
async function buildTxMatch(q = {}, now = new Date()) {
  const base = await txBaseFilters(q);
  return { base, match: andOf(q.status ? [...base, statusFilter(q.status, now)] : base) };
}

// Sort options -> aggregation stages. "_rank" puts groups in order before sorting by date:
//  due_soonest:  upcoming loans first (soonest due on top), then overdue, then returned
//  most_overdue: overdue first (oldest due date = most days late on top), then upcoming, then returned
function txSortStages(key, now = new Date()) {
  const isBorrowed = { $eq: ['$status', 'borrowed'] };
  const isLate = { $lt: ['$dueDate', now] };
  if (key === 'due_soonest') {
    return [
      { $addFields: { _rank: { $cond: [isBorrowed, { $cond: [isLate, 1, 0] }, 2] } } },
      { $sort: { _rank: 1, dueDate: 1, _id: 1 } },
    ];
  }
  if (key === 'most_overdue') {
    return [
      { $addFields: { _rank: { $cond: [isBorrowed, { $cond: [isLate, 0, 1] }, 2] } } },
      { $sort: { _rank: 1, dueDate: 1, _id: 1 } },
    ];
  }
  return [{ $sort: { borrowedAt: -1, _id: -1 } }]; // newest
}

module.exports = { STATUS_KEYS, TAB_KEYS, SORT_KEYS, txFilterRules, txBaseFilters, buildTxMatch, txSortStages, andOf };
