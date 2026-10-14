// Shared query logic for members (users): used by GET /api/users (the list) AND by the export.
const Borrow = require('../models/Borrow');
const { containsRx } = require('../utils/escapeRegex');
const { manilaMidnight } = require('../utils/manila');

const DAY_MS = 24 * 60 * 60 * 1000;

// Sort whitelist (never pass user input to $sort). _id keeps pages stable.
const USER_SORTS = {
  name: { name: 1, _id: 1 },
  newest: { createdAt: -1, _id: 1 },
  last_login: { lastLoginAt: -1, _id: 1 }, // never-logged-in users (null) end up last
  most_loans: { activeLoans: -1, name: 1, _id: 1 },
};
const LAST_LOGIN = ['today', '7d', '30d', 'never'];

// Validation rules for the filters. field(name) = query(name) for the list, body(`filters.${name}`) for the export.
function userFilterRules(field) {
  const dateRule = (name) => field(name).optional({ values: 'falsy' }).isISO8601().withMessage(`Invalid date: ${name}`);
  return [
    field('search').optional().isString().trim().isLength({ max: 100 }).withMessage('Search is too long'),
    field('role').optional({ values: 'falsy' }).isIn(['member', 'admin']).withMessage('Invalid role'),
    field('status').optional({ values: 'falsy' }).isIn(['active', 'deactivated']).withMessage('Invalid status'),
    field('hasOverdue').optional({ values: 'falsy' }).isIn(['yes', 'no']).withMessage('Invalid overdue filter'),
    field('lastLogin').optional({ values: 'falsy' }).isIn(LAST_LOGIN).withMessage('Invalid last login filter'),
    dateRule('joinedFrom'), dateRule('joinedTo'),
    field('sort').optional({ values: 'falsy' }).isIn(Object.keys(USER_SORTS)).withMessage('Invalid sort option'),
  ];
}

// The first stages of the users aggregation: filters + each user's current loan counts.
// (Pagination/sorting is added by the caller.)
function userPipeline(q = {}, now = new Date()) {
  const match = {};
  if (q.search) {
    const rx = containsRx(q.search);
    match.$or = [{ name: rx }, { email: rx }, { memberId: rx }, { contactNumber: rx }];
  }
  if (q.role) match.role = q.role;
  if (q.status) match.isActive = q.status === 'active';
  if (q.lastLogin === 'never') match.lastLoginAt = null; // matches null AND missing
  else if (q.lastLogin) {
    const since = q.lastLogin === 'today'
      ? manilaMidnight(now, 0) // since midnight in Manila (whatever the server's time zone)
      : new Date(now.getTime() - (q.lastLogin === '7d' ? 7 : 30) * DAY_MS);
    match.lastLoginAt = { $gte: since };
  }
  if (q.joinedFrom || q.joinedTo) {
    match.createdAt = {};
    if (q.joinedFrom) match.createdAt.$gte = new Date(q.joinedFrom);
    if (q.joinedTo) match.createdAt.$lte = new Date(q.joinedTo);
  }

  return [
    { $match: match },
    // Join each user's CURRENT loans (only the due dates are needed to count them)
    {
      $lookup: {
        from: Borrow.collection.name,
        let: { uid: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$user', '$$uid'] }, { $eq: ['$status', 'borrowed'] }] } } },
          { $project: { dueDate: 1 } },
        ],
        as: 'loans',
      },
    },
    {
      $addFields: {
        activeLoans: { $size: '$loans' },
        overdueLoans: { $size: { $filter: { input: '$loans', as: 'l', cond: { $lt: ['$$l.dueDate', now] } } } },
      },
    },
    ...(q.hasOverdue ? [{ $match: { overdueLoans: q.hasOverdue === 'yes' ? { $gt: 0 } : 0 } }] : []),
    // IMPORTANT: aggregate() ignores "select: false" from the schema, so secrets are removed here
    { $project: { password: 0, tokenVersion: 0, loans: 0, __v: 0 } },
  ];
}

const userSort = (key) => USER_SORTS[key] || USER_SORTS.name;

module.exports = { USER_SORTS, userFilterRules, userPipeline, userSort };
