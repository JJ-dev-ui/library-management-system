const express = require('express');
const { body, param, query } = require('express-validator');
const Borrow = require('../models/Borrow');
const Book = require('../models/Book');
const User = require('../models/User');
const BorrowRequest = require('../models/BorrowRequest');
const { protect, adminOnly } = require('../middleware/auth');
const { validate } = require('../middleware/error');
const { TAB_KEYS, txFilterRules, buildTxMatch, txSortStages, andOf } = require('../queries/transactions');
const { createLoan } = require('../utils/lend');
const { notifyBookmarkers } = require('../utils/notifications');
const { logActivity, bookSnap, memberSnap } = require('../utils/activity');
const { DAY_MS, addDaysEndOfDay, deriveStatus, statusFilter } = require('../utils/transactionStatus');
const { libraryStats } = require('../utils/libraryStats');
const { MESSAGES } = require('../utils/labels');

// "Transactions" in the UI = the Borrow collection. Every route here is admin only.
const router = express.Router();
router.use(protect, adminOnly);

// Library rules (utils/policy.js, shared with the member portal)
const { RENEW_DAYS, MAX_ACTIVE_LOANS, MAX_RENEWALS } = require('../utils/policy');

const POPULATE = [
  { path: 'book', select: 'title coverUrl isbn' },
  { path: 'user', select: 'name email memberId avatarKey' },
];

// Adds the calculated status to a loan before sending it
const withStatus = (loan, now = new Date()) => {
  const obj = typeof loan.toObject === 'function' ? loan.toObject() : loan;
  return { ...obj, derivedStatus: deriveStatus(obj, now) };
};

// Filters, sorts and their validation live in queries/transactions.js, shared with the export
const listRules = [
  ...txFilterRules(query),
  query('page').optional().isInt({ min: 1, max: 100000 }).withMessage('Invalid page').toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit').toInt(),
];

// GET /api/transactions — search, status, date ranges, sort, pagination + a count for every status tab
router.get('/', listRules, validate, async (req, res, next) => {
  try {
    const now = new Date();
    const page = req.query.page || 1;
    const limit = req.query.limit || 10;
    const { base, match } = await buildTxMatch(req.query, now);

    const [rows, total, ...tabCounts] = await Promise.all([
      Borrow.aggregate([
        { $match: match },
        ...txSortStages(req.query.sort, now),
        { $skip: (page - 1) * limit },
        { $limit: limit },
        { $project: { _rank: 0 } },
      ]),
      Borrow.countDocuments(match),
      Borrow.countDocuments(andOf(base)), // "All" tab
      ...TAB_KEYS.map((k) => Borrow.countDocuments(andOf([...base, statusFilter(k, now)]))),
    ]);

    await Borrow.populate(rows, POPULATE); // fill in book + member details for the page of results
    const [all, ...rest] = tabCounts;
    const counts = { all, ...Object.fromEntries(TAB_KEYS.map((k, i) => [k, rest[i]])) };

    res.json({
      transactions: rows.map((r) => withStatus(r, now)),
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      counts,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/transactions/stats — numbers for the stat cards
router.get('/stats', async (req, res, next) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const returnedThisMonthFilter = { status: 'returned', returnedAt: { $gte: monthStart } };

    const [shared, returnedThisMonth, onTimeThisMonth] = await Promise.all([
      libraryStats(now), // active / due soon / late: the same helper as the Dashboard and Books page
      Borrow.countDocuments(returnedThisMonthFilter),
      Borrow.countDocuments({ ...returnedThisMonthFilter, $expr: { $lte: ['$returnedAt', '$dueDate'] } }),
    ]);

    res.json({
      active: shared.active,
      dueSoon: shared.dueSoon,
      late: shared.late,
      returnedThisMonth,
      // Percentage of this month's returns that were on time (null when nothing was returned yet)
      onTimeRate: returnedThisMonth ? Math.round((onTimeThisMonth / returnedThisMonth) * 100) : null,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/transactions { bookId, userId } — "Lend to member"
router.post(
  '/',
  [
    body('bookId').isMongoId().withMessage('Choose a book'),
    body('userId').isMongoId().withMessage('Choose a member'),
  ],
  validate,
  async (req, res, next) => {
    try {
      const { bookId, userId } = req.body;

      // 1) Check the member
      const member = await User.findById(userId);
      if (!member) return res.status(404).json({ message: 'Member not found' });
      if (member.role !== 'member') return res.status(400).json({ message: 'Only member accounts can borrow books' });
      if (!member.isActive) return res.status(400).json({ message: 'This member account is deactivated' });

      // 2) No late books, the loan limit, and no second copy of the same book
      const [activeCount, pendingCount, lateCount, duplicate, archived] = await Promise.all([
        Borrow.countDocuments({ user: member._id, status: 'borrowed' }),
        BorrowRequest.countDocuments({ user: member._id, status: 'pending' }),
        Borrow.countDocuments({ user: member._id, ...statusFilter('overdue', new Date()) }),
        Borrow.exists({ user: member._id, book: bookId, status: 'borrowed' }),
        Book.exists({ _id: bookId, isArchived: true }),
      ]);
      // A member with a book past its return date must return it before borrowing anything else
      if (lateCount > 0) return res.status(400).json({ message: MESSAGES.lendWhileLate(member.name, lateCount) });
      if (archived) return res.status(400).json({ message: MESSAGES.bookArchived });
      // Pending requests from the member portal count toward the limit too (borrowed + pending ≤ 5)
      if (activeCount + pendingCount >= MAX_ACTIVE_LOANS) {
        return res.status(400).json({
          message: pendingCount
            ? `${member.name} has ${activeCount} borrowed and ${pendingCount} requested books (the maximum is ${MAX_ACTIVE_LOANS})`
            : `${member.name} already has ${MAX_ACTIVE_LOANS} borrowed books (the maximum)`,
        });
      }
      if (duplicate) return res.status(409).json({ message: `${member.name} already has a copy of this book` });

      // 3) Take a copy atomically + create the transaction (utils/lend.js, shared with request approval)
      const { loan, book, error } = await createLoan({ member, bookId, processedBy: req.user._id });
      if (error) return res.status(error.status).json({ message: error.message });
      await loan.populate(POPULATE);
      await logActivity({
        type: 'book_borrowed', actor: req.user, member, book, transaction: loan,
        meta: { code: loan.code, ...bookSnap(book), ...memberSnap(member) },
      });
      res.status(201).json({ transaction: withStatus(loan) });
    } catch (err) {
      next(err);
    }
  }
);

const idRule = [param('id').isMongoId().withMessage('Invalid transaction ID')];

// GET /api/transactions/:id — everything the "Transaction details" modal shows
router.get('/:id', idRule, validate, async (req, res, next) => {
  try {
    const loan = await Borrow.findById(req.params.id)
      .populate([
        { path: 'book', select: 'title authors isbn category shelfLocation coverUrl hasCustomCover coverVersion' },
        { path: 'user', select: 'name email memberId contactNumber avatarKey' },
        { path: 'processedBy', select: 'name' }, // the librarian who lent it
      ])
      .lean();
    if (!loan) return res.status(404).json({ message: 'Transaction not found' });

    const now = new Date();
    // How many books this member has right now (not counting returned ones)
    const borrowerActive = loan.user ? await Borrow.countDocuments({ user: loan.user._id, status: 'borrowed' }) : 0;
    // Days late: returned late -> days between return date and return day; still out -> days until now
    const end = loan.status === 'returned' ? loan.returnedAt : now;
    const daysLate = end && end > loan.dueDate ? Math.ceil((end - loan.dueDate) / DAY_MS) : 0;

    res.json({ transaction: withStatus(loan, now), borrowerActive, daysLate });
  } catch (err) {
    next(err);
  }
});

// PUT /api/transactions/:id/return — mark as returned
router.put('/:id/return', idRule, validate, async (req, res, next) => {
  try {
    // Atomic: only a loan that is STILL 'borrowed' can change. If the button is clicked twice,
    // the 2nd request finds nothing to update, so the copy is never added back twice.
    const loan = await Borrow.findOneAndUpdate(
      { _id: req.params.id, status: 'borrowed' },
      { $set: { status: 'returned', returnedAt: new Date() } },
      { new: true }
    );
    if (!loan) {
      const exists = await Borrow.exists({ _id: req.params.id });
      return exists
        ? res.status(400).json({ message: 'This book was already returned' })
        : res.status(404).json({ message: 'Transaction not found' });
    }
    // Back on the shelf. { new: true } returns the book AFTER the +1, so we know if it was the first copy back.
    const shelfBook = await Book.findOneAndUpdate({ _id: loan.book }, { $inc: { availableCopies: 1 } }, { new: true }).select('title availableCopies isArchived');
    // 0 -> 1 available: members who bookmarked it get "available again" (not for archived books)
    if (shelfBook && shelfBook.availableCopies === 1 && !shelfBook.isArchived) {
      await notifyBookmarkers(shelfBook, loan.user);
    }
    await loan.populate(POPULATE);
    await logActivity({
      type: 'book_returned', actor: req.user, member: loan.user, book: loan.book, transaction: loan,
      meta: { code: loan.code, ...bookSnap(loan.book), ...memberSnap(loan.user), late: loan.returnedAt > loan.dueDate },
    });
    res.json({ transaction: withStatus(loan) });
  } catch (err) {
    next(err);
  }
});

// PUT /api/transactions/:id/renew — 7 more days, at most 2 times, never for a late book
router.put('/:id/renew', idRule, validate, async (req, res, next) => {
  try {
    const current = await Borrow.findById(req.params.id).lean();
    if (!current) return res.status(404).json({ message: 'Transaction not found' });
    if (current.status !== 'borrowed') return res.status(400).json({ message: 'Only books that are still borrowed can be extended' });
    // Old transactions were saved before renewCount existed: a missing value means 0 extensions
    const used = current.renewCount ?? 0;
    // A late book must be returned first (extending it would hide that it is late)
    if (current.dueDate < new Date()) return res.status(400).json({ message: MESSAGES.extendLate });
    if (used >= MAX_RENEWALS) return res.status(400).json({ message: MESSAGES.extendMaxed(MAX_RENEWALS) });

    // Optimistic check: the update only matches if renewCount and dueDate are still what we just read,
    // so a double click cannot renew twice. { $in: [0, null] } also matches a missing renewCount.
    const loan = await Borrow.findOneAndUpdate(
      { _id: current._id, status: 'borrowed', renewCount: used === 0 ? { $in: [0, null] } : used, dueDate: current.dueDate },
      // +7 days on the CURRENT return date, still at the end of that day ($inc on a missing field starts at 0)
      { $set: { dueDate: addDaysEndOfDay(current.dueDate, RENEW_DAYS) }, $inc: { renewCount: 1 } },
      { new: true }
    );
    if (!loan) return res.status(409).json({ message: 'This transaction was just changed. Refresh and try again.' });
    await loan.populate(POPULATE);
    await logActivity({
      type: 'borrow_extended', actor: req.user, member: loan.user, book: loan.book, transaction: loan,
      meta: { code: loan.code, from: current.dueDate, to: loan.dueDate, ...bookSnap(loan.book), ...memberSnap(loan.user) },
    });
    res.json({ transaction: withStatus(loan) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
