const express = require('express');
const { query } = require('express-validator');
const Book = require('../models/Book');
const Borrow = require('../models/Borrow');
const User = require('../models/User');
const ActivityLog = require('../models/ActivityLog');
const { protect, adminOnly } = require('../middleware/auth');
const { validate } = require('../middleware/error');
const { DAY_MS, deriveStatus, statusFilter } = require('../utils/transactionStatus');
const { libraryStats, NOT_ARCHIVED } = require('../utils/libraryStats');
const BorrowRequest = require('../models/BorrowRequest');
const { expirePendingRequests } = require('../utils/requestRules');

// GET /api/dashboard?range=7|30|90 — everything the admin dashboard shows, in ONE request.
const router = express.Router();
router.use(protect, adminOnly);

const TZ = 'Asia/Manila';                 // days are counted in the library's time zone
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000; // Manila is UTC+8 all year (no daylight saving time)
const RANGES = ['7', '30', '90'];

// Midnight (Manila) of the day `daysAgo` days before today, as a real Date
function manilaMidnight(now, daysAgo) {
  const m = new Date(now.getTime() + MANILA_OFFSET_MS); // UTC fields of m = Manila's clock
  return new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate() - daysAgo) - MANILA_OFFSET_MS);
}
// "2026-10-13" for a Date, in Manila
const manilaDay = (d) => new Date(d.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);

// Small field lists for the cards (cover info = what <BookCover> needs; avatarKey = profile photo)
const BOOK_CARD = 'title authors isbn coverUrl hasCustomCover coverVersion';
const USER_CARD = 'name memberId avatarKey';

router.get(
  '/',
  [query('range').optional().isIn(RANGES).withMessage('Range must be 7, 30 or 90 days')],
  validate,
  async (req, res, next) => {
    try {
      const range = Number(req.query.range || 30);
      const now = new Date();
      const start = manilaMidnight(now, range - 1);     // first day of the range (today counts as day 1)
      const prevStart = manilaMidnight(now, 2 * range - 1); // the previous range of the same length
      const todayStart = manilaMidnight(now, 0);
      const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
      // Groups dates by Manila calendar day ("%Y-%m-%d" with timezone), not by UTC day
      const byDay = (field) => ({ $dateToString: { format: '%Y-%m-%d', date: `$${field}`, timezone: TZ } });

      // All queries at the same time (Promise.all) instead of one after another
      const [
        shared, returnedToday, newMembersThisWeek,
        borrowedInRange, borrowedPrevRange, dailyBorrowed, dailyReturned,
        categories, returningSoon, lateList, mostBorrowed, recent, pendingRequests,
      ] = await Promise.all([
        // Titles, copies, borrowed now, late, due soon, active members: the SAME helper as the
        // Books and Transactions stat cards (utils/libraryStats.js), so the numbers always match
        libraryStats(now),
        Borrow.countDocuments({ status: 'returned', returnedAt: { $gte: todayStart } }),
        User.countDocuments({ role: 'member', createdAt: { $gte: weekAgo } }),
        Borrow.countDocuments({ borrowedAt: { $gte: start } }),
        Borrow.countDocuments({ borrowedAt: { $gte: prevStart, $lt: start } }),
        Borrow.aggregate([
          { $match: { borrowedAt: { $gte: start } } },
          { $group: { _id: byDay('borrowedAt'), n: { $sum: 1 } } },
        ]),
        Borrow.aggregate([
          { $match: { status: 'returned', returnedAt: { $gte: start } } },
          { $group: { _id: byDay('returnedAt'), n: { $sum: 1 } } },
        ]),
        // Borrowings per category in the range: join each transaction's book to read its category
        Borrow.aggregate([
          { $match: { borrowedAt: { $gte: start } } },
          { $lookup: { from: Book.collection.name, localField: 'book', foreignField: '_id', as: 'b', pipeline: [{ $project: { category: 1, isArchived: 1 } }] } },
          { $match: { 'b.isArchived': { $ne: true } } }, // archived books are left out of the chart
          { $group: { _id: { $ifNull: [{ $first: '$b.category' }, 'Deleted books'] }, n: { $sum: 1 } } },
          { $sort: { n: -1, _id: 1 } },
        ]),
        Borrow.find({ status: 'borrowed', dueDate: { $gte: now } }).sort({ dueDate: 1 }).limit(5)
          .populate('user', USER_CARD).populate('book', BOOK_CARD).lean(),
        Borrow.find(statusFilter('overdue', now)).sort({ dueDate: 1 }).limit(5) // oldest return date = most days late
          .populate('user', `${USER_CARD} email contactNumber`).populate('book', BOOK_CARD).lean(),
        Borrow.aggregate([
          { $match: { borrowedAt: { $gte: start } } },
          { $group: { _id: '$book', count: { $sum: 1 } } },
          { $sort: { count: -1, _id: 1 } },
          // Archived books are left out (the $lookup finds nothing for them, $unwind drops the row),
          // THEN the top 5 is taken
          { $lookup: { from: Book.collection.name, localField: '_id', foreignField: '_id', as: 'book', pipeline: [{ $match: NOT_ARCHIVED }, { $project: { title: 1, authors: 1, isbn: 1, coverUrl: 1, hasCustomCover: 1, coverVersion: 1 } }] } },
          { $unwind: '$book' },
          { $limit: 5 },
        ]),
        ActivityLog.find().sort({ createdAt: -1 }).limit(10)
          .populate('actor', 'name avatarKey').populate('member', USER_CARD)
          .populate('book', 'title').populate('transaction', 'code')
          .lean(),
        // "N pending requests" pill in the header (old ones are expired first)
        expirePendingRequests().then(() => BorrowRequest.countDocuments({ status: 'pending' })),
      ]);

      // One entry for EVERY day of the range (days without activity get 0)
      const bMap = Object.fromEntries(dailyBorrowed.map((x) => [x._id, x.n]));
      const rMap = Object.fromEntries(dailyReturned.map((x) => [x._id, x.n]));
      const daily = Array.from({ length: range }, (_, i) => {
        const date = manilaDay(new Date(start.getTime() + i * DAY_MS + 12 * 60 * 60 * 1000)); // noon avoids edge cases
        return { date, borrowed: bMap[date] || 0, returned: rMap[date] || 0 };
      });

      // Top 5 categories + everything else as "Other"
      const top = categories.slice(0, 5).map((c) => ({ name: c._id, count: c.n }));
      const other = categories.slice(5).reduce((s, c) => s + c.n, 0);
      if (other) top.push({ name: 'Other', count: other });

      res.json({
        range,
        pendingRequests,
        stats: {
          totalTitles: shared.titles,
          totalCopies: shared.totalCopies,
          borrowedNow: shared.borrowedNow,
          late: shared.late,
          returnedToday,
          activeMembers: shared.activeMembers,
          newMembersThisWeek,
          borrowedInRange,
          // % change vs the previous period (null when there is nothing to compare with)
          borrowTrend: borrowedPrevRange ? Math.round(((borrowedInRange - borrowedPrevRange) / borrowedPrevRange) * 100) : null,
        },
        daily,
        statusDonut: { onTime: shared.active, dueSoon: shared.dueSoon, late: shared.late },
        categoryDonut: top,
        returningSoon: returningSoon.map((t) => ({ ...t, derivedStatus: deriveStatus(t, now) })),
        lateFollowUps: lateList.map((t) => ({ ...t, daysLate: Math.ceil((now - t.dueDate) / DAY_MS) })),
        mostBorrowed: mostBorrowed.map((m) => ({ ...m.book, count: m.count })),
        recentActivity: recent,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
