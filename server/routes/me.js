const express = require('express');
const { body, param, query, matchedData } = require('express-validator');
const Book = require('../models/Book');
const Borrow = require('../models/Borrow');
const BorrowRequest = require('../models/BorrowRequest');
const { REQUEST_STATUSES } = require('../models/BorrowRequest');
const Bookmark = require('../models/Bookmark');
const Notification = require('../models/Notification');
const { protect, memberOnly } = require('../middleware/auth');
const { validate } = require('../middleware/error');
const { deriveStatus, statusFilter } = require('../utils/transactionStatus');
const { checkRequestRules, memberBlock, expirePendingRequests } = require('../utils/requestRules');
const { refreshReminders } = require('../utils/notifications');
const { CARD_SELECT, memberBook } = require('../utils/memberBook');
const { memberFilterRules, buildMemberFilter, memberSort, withMemberStatus } = require('../queries/memberBooks');
const User = require('../models/User');
const { MAX_ACTIVE_LOANS, MAX_BOOKMARKS } = require('../utils/policy');

// /api/me/... — the member portal's OWN data.
// SECURITY: every query below filters by req.user._id (the logged-in member from the JWT).
// No route reads a user id from the URL or the body, so a member can only ever see or change
// their own bookmarks, requests, books and notifications.
const router = express.Router();
router.use(protect, memberOnly);

const pageRules = (maxLimit) => [
  query('page').optional().isInt({ min: 1, max: 10000 }).withMessage('Invalid page').toInt(),
  query('limit').optional().isInt({ min: 1, max: maxLimit }).withMessage('Invalid limit').toInt(),
];
const paging = (req, defLimit) => {
  const page = req.query.page || 1;
  const limit = req.query.limit || defLimit;
  return { page, limit, skip: (page - 1) * limit };
};
const bookIdRule = (where) => where('bookId').isMongoId().withMessage('Invalid book ID');

// Lazy work before reading: expire old requests + create return reminders / the weekly digest
const freshen = (userId) => expirePendingRequests({ user: userId }).then(() => refreshReminders(userId));

// Facebook-style "seen": the bell badge counts notifications created AFTER the member last opened
// the bell (User.notificationsSeenAt). Never opened = every notification counts.
const unseenFilter = (user) => ({ user: user._id, ...(user.notificationsSeenAt ? { createdAt: { $gt: user.notificationsSeenAt } } : {}) });

// ---------------------------------------------------------------------------
// GET /api/me/summary — numbers for the layout (badges) and the profile header
// ---------------------------------------------------------------------------
router.get('/summary', async (req, res, next) => {
  try {
    const user = req.user._id;
    await freshen(user);
    const now = new Date();
    const [borrowedNow, dueSoon, late, pendingRequests, unreadNotifications, completedCount, unseenNotifications] = await Promise.all([
      Borrow.countDocuments({ user, status: 'borrowed' }),
      Borrow.countDocuments({ user, ...statusFilter('due_soon', now) }),
      Borrow.countDocuments({ user, ...statusFilter('overdue', now) }),
      BorrowRequest.countDocuments({ user, status: 'pending' }),
      Notification.countDocuments({ user, readAt: null }),
      Borrow.countDocuments({ user, status: 'returned' }), // "Completed" = borrowed AND returned
      Notification.countDocuments(unseenFilter(req.user)),
    ]);
    res.json({
      borrowedNow, dueSoon, late, pendingRequests, unreadNotifications, unseenNotifications,
      completedCount, booksRead: completedCount,
      slotsLeft: Math.max(0, MAX_ACTIVE_LOANS - borrowedNow - pendingRequests), // borrowed + pending ≤ 5
    });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// GET /api/me/book-status/:bookId — what the book modal shows instead of / next to "Request"
// ---------------------------------------------------------------------------
router.get('/book-status/:bookId', bookIdRule(param), validate, async (req, res, next) => {
  try {
    const user = req.user._id;
    await expirePendingRequests({ user });
    const book = await Book.findById(req.params.bookId).select('title availableCopies isArchived');
    if (!book || book.isArchived) return res.status(404).json({ message: 'Book not found' }); // archived = hidden from members
    const [bookmarked, borrowing, pendingRequest, canRequest] = await Promise.all([
      Bookmark.exists({ user, book: book._id }),
      Borrow.findOne({ user, book: book._id, status: 'borrowed' }).select('code dueDate borrowedAt').lean(),
      BorrowRequest.findOne({ user, book: book._id, status: 'pending' }).select('code requestedAt expiresAt').lean(),
      checkRequestRules(req.user, book), // the same rules the server applies when the request is sent
    ]);
    res.json({ bookmarked: !!bookmarked, borrowing, pendingRequest, canRequest, availableCopies: book.availableCopies });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Bookmarks
// ---------------------------------------------------------------------------

// GET /api/me/bookmarks?page=&limit= + the same filters/sort as the feed (sort "recommended" =
// newest bookmark first). Archived books are left out. Each book has myStatus, and the member's
// block reason is sent once (requestBlock).
router.get('/bookmarks', [...pageRules(20), ...memberFilterRules(query)], validate, async (req, res, next) => {
  try {
    const user = req.user._id;
    const { page, limit, skip } = paging(req, 10);
    const q = matchedData(req, { locations: ['query'] });
    // At most 200 per member, so filtering + paging in memory after ONE query is cheap and simple
    const marks = await Bookmark.find({ user }).select('book createdAt').lean();
    const savedAt = new Map(marks.map((m) => [String(m.book), m.createdAt]));
    const filter = await buildMemberFilter(q, user); // archived books are always excluded
    const sort = memberSort(q.sort);
    let books = await Book.find({ $and: [filter, { _id: { $in: marks.map((m) => m.book) } }] })
      .sort(sort || { _id: 1 }).select(CARD_SELECT).lean();
    if (!sort) books.sort((a, b) => savedAt.get(String(b._id)) - savedAt.get(String(a._id))); // newest bookmark first
    const total = books.length;
    books = books.slice(skip, skip + limit);
    const [items, requestBlock] = await Promise.all([withMemberStatus(user, books), memberBlock(req.user)]);
    res.json({
      books: items.map((b) => ({ ...b, bookmarkedAt: savedAt.get(String(b._id)) })),
      total, page, hasMore: skip + limit < total, requestBlock,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/me/bookmarks { bookId } — save (doing it twice is harmless)
router.post('/bookmarks', bookIdRule(body), validate, async (req, res, next) => {
  try {
    const user = req.user._id;
    const book = await Book.findById(req.body.bookId).select('isArchived');
    if (!book || book.isArchived) return res.status(404).json({ message: 'Book not found' });
    const already = await Bookmark.exists({ user, book: book._id });
    if (!already && (await Bookmark.countDocuments({ user })) >= MAX_BOOKMARKS) {
      return res.status(400).json({ message: `You can save up to ${MAX_BOOKMARKS} books. Remove some bookmarks first.` });
    }
    try {
      // upsert + $setOnInsert: creates it once; a second click changes nothing
      await Bookmark.updateOne({ user, book: book._id }, { $setOnInsert: { user, book: book._id } }, { upsert: true });
    } catch (err) {
      if (err.code !== 11000) throw err; // two clicks at the same moment: the other one saved it
    }
    res.status(201).json({ bookmarked: true });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/me/bookmarks/:bookId — remove (only from YOUR bookmarks)
router.delete('/bookmarks/:bookId', bookIdRule(param), validate, async (req, res, next) => {
  try {
    await Bookmark.deleteOne({ user: req.user._id, book: req.params.bookId });
    res.json({ bookmarked: false });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// My Books
// ---------------------------------------------------------------------------
// Only the member's own transaction fields (never processedBy, notes or other borrowers)
const myLoan = (l, now) => ({
  _id: l._id, code: l.code, borrowedAt: l.borrowedAt, dueDate: l.dueDate, returnedAt: l.returnedAt,
  status: l.status, renewCount: l.renewCount ?? 0, derivedStatus: deriveStatus(l, now), book: memberBook(l.book),
});

// GET /api/me/borrowed — books the member has right now (at most 5), nearest return date first
router.get('/borrowed', async (req, res, next) => {
  try {
    const now = new Date();
    const loans = await Borrow.find({ user: req.user._id, status: 'borrowed' }).sort({ dueDate: 1 })
      .populate('book', CARD_SELECT).lean();
    res.json({ borrowed: loans.map((l) => myLoan(l, now)) });
  } catch (err) {
    next(err);
  }
});

// GET /api/me/requests?status=&page=&limit=
router.get(
  '/requests',
  [query('status').optional({ values: 'falsy' }).isIn(REQUEST_STATUSES).withMessage('Invalid status'), ...pageRules(20)],
  validate,
  async (req, res, next) => {
    try {
      const user = req.user._id;
      await expirePendingRequests({ user });
      const { page, limit, skip } = paging(req, 10);
      const { status } = matchedData(req, { locations: ['query'] });
      const filter = { user, ...(status ? { status } : {}) };
      const [rows, total] = await Promise.all([
        BorrowRequest.find(filter).sort({ requestedAt: -1, _id: -1 }).skip(skip).limit(limit)
          .populate('book', CARD_SELECT).populate('transaction', 'code dueDate status returnedAt').lean(),
        BorrowRequest.countDocuments(filter),
      ]);
      res.json({
        // decidedBy (which librarian) is not sent; the note is the librarian's message to the member
        requests: rows.map((r) => ({
          _id: r._id, code: r.code, status: r.status, note: r.note, requestedAt: r.requestedAt,
          expiresAt: r.expiresAt, decidedAt: r.decidedAt, book: memberBook(r.book), transaction: r.transaction,
        })),
        total, page, hasMore: skip + rows.length < total,
      });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/me/history?page=&limit= — everything the member ever borrowed, newest first.
// Page 1 also returns a small summary (this year, favourite category, on-time rate).
router.get('/history', pageRules(20), validate, async (req, res, next) => {
  try {
    const user = req.user._id;
    const now = new Date();
    const { page, limit, skip } = paging(req, 10);
    const [rows, total] = await Promise.all([
      Borrow.find({ user }).sort({ borrowedAt: -1, _id: -1 }).skip(skip).limit(limit).populate('book', CARD_SELECT).lean(),
      Borrow.countDocuments({ user }),
    ]);

    let summary;
    if (page === 1) {
      const yearStart = new Date(now.getFullYear(), 0, 1);
      const [thisYear, returned, onTime, fav] = await Promise.all([
        Borrow.countDocuments({ user, borrowedAt: { $gte: yearStart } }),
        Borrow.countDocuments({ user, status: 'returned' }),
        Borrow.countDocuments({ user, ...statusFilter('returned_on_time', now) }),
        // Favourite category: join each transaction's book, count per category, keep the top one
        Borrow.aggregate([
          { $match: { user } },
          { $lookup: { from: Book.collection.name, localField: 'book', foreignField: '_id', as: 'b', pipeline: [{ $project: { category: 1 } }] } },
          { $unwind: '$b' },
          { $group: { _id: '$b.category', n: { $sum: 1 } } },
          { $sort: { n: -1, _id: 1 } },
          { $limit: 1 },
        ]),
      ]);
      summary = {
        borrowedThisYear: thisYear,
        favouriteCategory: fav[0]?._id || null,
        onTimeRate: returned ? Math.round((onTime / returned) * 100) : null,
      };
    }
    res.json({ history: rows.map((l) => myLoan(l, now)), total, page, hasMore: skip + rows.length < total, summary });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
const NOTIFICATION_FIELDS = 'type title message link book request transaction readAt createdAt';

// GET /api/me/notifications?page=&limit= — latest first
router.get('/notifications', pageRules(50), validate, async (req, res, next) => {
  try {
    const user = req.user._id;
    await freshen(user);
    const { page, limit, skip } = paging(req, 20);
    const [items, total, unread, unseen] = await Promise.all([
      Notification.find({ user }).sort({ createdAt: -1, _id: -1 }).skip(skip).limit(limit).select(NOTIFICATION_FIELDS).lean(),
      Notification.countDocuments({ user }),
      Notification.countDocuments({ user, readAt: null }),
      Notification.countDocuments(unseenFilter(req.user)),
    ]);
    // seenAt: when the bell was last opened BEFORE now; the client groups "New" (after it) / "Earlier"
    res.json({ notifications: items, total, unread, unseen, seenAt: req.user.notificationsSeenAt, page, hasMore: skip + items.length < total });
  } catch (err) {
    next(err);
  }
});

// GET /api/me/notifications/unread-count — polled by the bell every 60 s and on window focus.
// unseen = the badge number (since the bell was last opened); unread = not clicked yet.
router.get('/notifications/unread-count', async (req, res, next) => {
  try {
    await freshen(req.user._id);
    const [unread, unseen] = await Promise.all([
      Notification.countDocuments({ user: req.user._id, readAt: null }),
      Notification.countDocuments(unseenFilter(req.user)),
    ]);
    res.json({ unread, unseen });
  } catch (err) {
    next(err);
  }
});

// PUT /api/me/notifications/seen — the bell was opened: the badge starts again from 0
// (only the logged-in member's own field is changed)
router.put('/notifications/seen', async (req, res, next) => {
  try {
    const seenAt = new Date();
    await User.updateOne({ _id: req.user._id }, { $set: { notificationsSeenAt: seenAt } });
    res.json({ seenAt });
  } catch (err) {
    next(err);
  }
});

// PUT /api/me/notifications/read-all
router.put('/notifications/read-all', async (req, res, next) => {
  try {
    const result = await Notification.updateMany({ user: req.user._id, readAt: null }, { $set: { readAt: new Date() } });
    res.json({ updated: result.modifiedCount });
  } catch (err) {
    next(err);
  }
});

// PUT /api/me/notifications/:id/read — the filter includes user, so only YOUR notification can change
router.put('/notifications/:id/read', [param('id').isMongoId().withMessage('Invalid notification ID')], validate, async (req, res, next) => {
  try {
    const n = await Notification.findOne({ _id: req.params.id, user: req.user._id });
    if (!n) return res.status(404).json({ message: 'Notification not found' });
    if (!n.readAt) { n.readAt = new Date(); await n.save(); } // the first read time is kept
    res.json({ notification: { _id: n._id, readAt: n.readAt } });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
