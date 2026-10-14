const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, param, query, matchedData } = require('express-validator');
const Book = require('../models/Book');
const User = require('../models/User');
const BorrowRequest = require('../models/BorrowRequest');
const { REQUEST_STATUSES } = require('../models/BorrowRequest');
const { protect, adminOnly, memberOnly } = require('../middleware/auth');
const { validate } = require('../middleware/error');
const { containsRx } = require('../utils/escapeRegex');
const { nextRequestCode } = require('../utils/counter');
const { createLoan } = require('../utils/lend');
const { logActivity, bookSnap, memberSnap } = require('../utils/activity');
const { manilaMidnight } = require('../utils/manila');
const { DAY_MS } = require('../utils/transactionStatus');
const { checkRequestRules, expirePendingRequests, requestExpiry } = require('../utils/requestRules');
const { notifyRequest } = require('../utils/notifications');

// Borrow requests: members ask for a book in the portal, the librarian approves it at the counter
// (which creates the real transaction) or denies it with an optional note.
const router = express.Router();
router.use(protect);

const idRule = [param('id').isMongoId().withMessage('Invalid request ID')];
const snap = (r, book, member) => ({ code: r.code, ...bookSnap(book), ...memberSnap(member) });

// ===========================================================================
// MEMBER routes (role member). The member is ALWAYS req.user: a user id is never read from the body,
// so nobody can request or cancel for someone else.
// ===========================================================================

// 20 new requests per hour per member (stops a script from flooding the librarians)
const requestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => `request:${req.user._id}`,
  message: { message: 'Too many requests in one hour. Please try again later.' },
});

// POST /api/requests { bookId } — "Request" button in the book modal
router.post(
  '/',
  memberOnly,
  requestLimiter,
  [body('bookId').isMongoId().withMessage('Choose a book')],
  validate,
  async (req, res, next) => {
    try {
      await expirePendingRequests({ user: req.user._id }); // an old expired request no longer counts
      const book = await Book.findById(req.body.bookId).select('title availableCopies isArchived');
      // The SAME rules as the Request button and the librarian's approval (utils/requestRules.js)
      const rule = await checkRequestRules(req.user, book);
      if (!rule.ok) return res.status(400).json({ message: rule.message, reason: rule.reason });

      const now = new Date();
      let request;
      try {
        request = await BorrowRequest.create({
          code: await nextRequestCode(), user: req.user._id, book: book._id,
          requestedAt: now, expiresAt: requestExpiry(now),
        });
      } catch (err) {
        // The partial unique index: a pending request for this book already exists (double click)
        if (err.code === 11000) return res.status(409).json({ message: 'You already requested this book.', reason: 'already_requested' });
        throw err;
      }
      await logActivity({ type: 'request_created', actor: req.user, member: req.user, book, meta: snap(request, book, req.user) });
      res.status(201).json({ request: { _id: request._id, code: request.code, status: request.status, requestedAt: request.requestedAt, expiresAt: request.expiresAt } });
    } catch (err) {
      next(err);
    }
  }
);

// PUT /api/requests/:id/cancel — only the owner, only while pending
router.put('/:id/cancel', memberOnly, idRule, validate, async (req, res, next) => {
  try {
    await expirePendingRequests({ user: req.user._id });
    // user: req.user._id in the filter = a member can only ever cancel THEIR OWN request
    const request = await BorrowRequest.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id, status: 'pending' },
      { $set: { status: 'cancelled', decidedAt: new Date(), decidedBy: req.user._id } },
      { new: true }
    ).populate('book', 'title');
    if (!request) return res.status(400).json({ message: 'Only your pending requests can be cancelled.' });
    await logActivity({ type: 'request_cancelled', actor: req.user, member: req.user, book: request.book, meta: snap(request, request.book, req.user) });
    // The member did this themselves, so the notification is created already read
    await notifyRequest('request_cancelled', request, request.book, { readAt: new Date() });
    res.json({ request: { _id: request._id, status: request.status } });
  } catch (err) {
    next(err);
  }
});

// ===========================================================================
// ADMIN routes (librarians)
// ===========================================================================
const SORTS = { oldest: { requestedAt: 1, _id: 1 }, newest: { requestedAt: -1, _id: -1 } };
const listRules = [
  query('status').optional({ values: 'falsy' }).isIn([...REQUEST_STATUSES, 'all']).withMessage('Invalid status'),
  query('search').optional().isString().trim().isLength({ max: 100 }).withMessage('Search is too long'),
  query('sort').optional({ values: 'falsy' }).isIn(Object.keys(SORTS)).withMessage('Invalid sort option'),
  query('page').optional().isInt({ min: 1, max: 100000 }).withMessage('Invalid page').toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit').toInt(),
];

// GET /api/requests?status=pending|approved|denied|cancelled|expired|all&search=&sort=oldest|newest&page=&limit=
router.get('/', adminOnly, listRules, validate, async (req, res, next) => {
  try {
    await expirePendingRequests();
    const q = matchedData(req, { locations: ['query'] });
    const page = q.page || 1;
    const limit = q.limit || 10;
    const status = q.status || 'pending';

    // Search: member name/email/member ID, book title/ISBN, or the request code.
    // Members and books live in other collections, so their matching ids are found first.
    const base = {};
    if (q.search) {
      const rx = containsRx(q.search);
      const [users, books] = await Promise.all([
        User.find({ $or: [{ name: rx }, { email: rx }, { memberId: rx }] }).select('_id').limit(1000).lean(),
        Book.find({ $or: [{ title: rx }, { isbn: rx }] }).select('_id').limit(1000).lean(),
      ]);
      base.$or = [{ code: rx }, { user: { $in: users.map((u) => u._id) } }, { book: { $in: books.map((b) => b._id) } }];
    }
    const match = status === 'all' ? base : { ...base, status };

    const [rows, total, ...counts] = await Promise.all([
      BorrowRequest.find(match).sort(SORTS[q.sort] || SORTS.oldest).skip((page - 1) * limit).limit(limit)
        .populate('user', 'name email memberId avatarKey isActive role')
        .populate('book', 'title isbn coverUrl hasCustomCover coverVersion availableCopies totalCopies isArchived')
        .populate('transaction', 'code dueDate status')
        .populate('decidedBy', 'name')
        .lean(),
      BorrowRequest.countDocuments(match),
      BorrowRequest.countDocuments(base),
      ...REQUEST_STATUSES.map((s) => BorrowRequest.countDocuments({ ...base, status: s })),
    ]);
    const [all, ...perStatus] = counts;

    // Can each pending request be approved RIGHT NOW? (the Approve button is disabled with the reason)
    const withApproval = await Promise.all(rows.map(async (r) => {
      if (r.status !== 'pending' || !r.user) return r;
      const approval = await checkRequestRules(r.user, r.book, { requestId: r._id, forAdmin: true });
      return { ...r, approval };
    }));

    res.json({
      requests: withApproval,
      total, page, pages: Math.ceil(total / limit) || 1,
      counts: { all, ...Object.fromEntries(REQUEST_STATUSES.map((s, i) => [s, perStatus[i]])) },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/requests/stats — stat cards + the sidebar badge
router.get('/stats', adminOnly, async (req, res, next) => {
  try {
    await expirePendingRequests();
    const today = manilaMidnight(new Date(), 0);
    const weekAgo = new Date(Date.now() - 7 * DAY_MS);
    const [pending, approvedToday, deniedToday, expiredThisWeek] = await Promise.all([
      BorrowRequest.countDocuments({ status: 'pending' }),
      BorrowRequest.countDocuments({ status: 'approved', decidedAt: { $gte: today } }),
      BorrowRequest.countDocuments({ status: 'denied', decidedAt: { $gte: today } }),
      BorrowRequest.countDocuments({ status: 'expired', decidedAt: { $gte: weekAgo } }),
    ]);
    res.json({ pending, approvedToday, deniedToday, expiredThisWeek });
  } catch (err) {
    next(err);
  }
});

// GET /api/requests/:id — details modal (admin)
router.get('/:id', adminOnly, idRule, validate, async (req, res, next) => {
  try {
    await expirePendingRequests({ _id: req.params.id });
    const r = await BorrowRequest.findById(req.params.id)
      .populate('user', 'name email memberId avatarKey isActive role contactNumber')
      .populate('book', 'title subtitle authors isbn category shelfLocation coverUrl hasCustomCover coverVersion availableCopies totalCopies isArchived')
      .populate('transaction', 'code dueDate status borrowedAt returnedAt')
      .populate('decidedBy', 'name')
      .lean();
    if (!r) return res.status(404).json({ message: 'Request not found' });
    const approval = r.status === 'pending' && r.user
      ? await checkRequestRules(r.user, r.book, { requestId: r._id, forAdmin: true }) : null;
    res.json({ request: { ...r, approval } });
  } catch (err) {
    next(err);
  }
});

// PUT /api/requests/:id/approve — the member is at the counter: hand over the book
router.put('/:id/approve', adminOnly, idRule, validate, async (req, res, next) => {
  try {
    await expirePendingRequests({ _id: req.params.id });
    const request = await BorrowRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Request not found' });
    if (request.status !== 'pending') return res.status(400).json({ message: `This request is already ${request.status}.` });

    const [member, book] = await Promise.all([User.findById(request.user), Book.findById(request.book)]);
    // Check EVERYTHING again at the counter: things may have changed since the member asked
    const rule = await checkRequestRules(member, book, { requestId: request._id, forAdmin: true });
    if (!rule.ok) return res.status(400).json({ message: rule.message, reason: rule.reason });

    // 1) CLAIM the request first (atomic: only a request that is STILL pending changes). Two librarians
    //    clicking Approve at the same moment: only one gets it, the other gets 409.
    const now = new Date();
    const claimed = await BorrowRequest.findOneAndUpdate(
      { _id: request._id, status: 'pending' },
      { $set: { status: 'approved', decidedAt: now, decidedBy: req.user._id } },
      { new: true }
    );
    if (!claimed) return res.status(409).json({ message: 'This request was just changed. Refresh and try again.' });

    // 2) Create the transaction exactly like "Lend to member" (atomic copy, 14 days, end of day, code)
    const { loan, error } = await createLoan({ member, bookId: book._id, processedBy: req.user._id });
    if (error) {
      // The lend failed (e.g. the last copy was just lent): give the request back its pending state
      await BorrowRequest.updateOne({ _id: request._id }, { $set: { status: 'pending', decidedAt: null, decidedBy: null } });
      return res.status(error.status).json({ message: error.message });
    }
    claimed.transaction = loan._id;
    await claimed.save();

    await logActivity({ type: 'request_approved', actor: req.user, member, book, transaction: loan, meta: { ...snap(claimed, book, member), transactionCode: loan.code } });
    await logActivity({ type: 'book_borrowed', actor: req.user, member, book, transaction: loan, meta: { code: loan.code, ...bookSnap(book), ...memberSnap(member) } });
    await notifyRequest('request_approved', claimed, book, { dueDate: loan.dueDate, transaction: loan._id });
    res.json({ request: claimed, transaction: { _id: loan._id, code: loan.code, dueDate: loan.dueDate } });
  } catch (err) {
    next(err);
  }
});

// PUT /api/requests/:id/deny { note? } — the librarian says no (optionally with a reason)
router.put(
  '/:id/deny',
  adminOnly,
  [...idRule, body('note').optional().isString().trim().isLength({ max: 300 }).withMessage('The note can have at most 300 characters')],
  validate,
  async (req, res, next) => {
    try {
      await expirePendingRequests({ _id: req.params.id });
      const { note = '' } = matchedData(req, { locations: ['body'] });
      const request = await BorrowRequest.findOneAndUpdate(
        { _id: req.params.id, status: 'pending' },
        { $set: { status: 'denied', note, decidedAt: new Date(), decidedBy: req.user._id } },
        { new: true }
      ).populate('book', 'title').populate('user', 'name');
      if (!request) return res.status(400).json({ message: 'Only pending requests can be denied.' });
      await logActivity({ type: 'request_denied', actor: req.user, member: request.user, book: request.book, meta: { ...snap(request, request.book, request.user), note } });
      await notifyRequest('request_denied', request, request.book, { note });
      res.json({ request });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
