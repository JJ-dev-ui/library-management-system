// ONE place for the library numbers that appear on several pages (Dashboard, Books, Transactions).
// Every page gets them from here, so "Late books" or "Borrowed now" can never show two different
// values on two screens.
const Book = require('../models/Book');
const Borrow = require('../models/Borrow');
const User = require('../models/User');
const { statusFilter } = require('./transactionStatus');

// Archived books are hidden from the catalog and from every count. "$ne: true" also matches books
// saved before the isArchived field existed (they have no value at all).
const NOT_ARCHIVED = { isArchived: { $ne: true } };

async function libraryStats(now = new Date()) {
  // Promise.all runs all the queries at the same time instead of one after another
  const [titles, copies, borrowedNow, active, dueSoon, late, activeMembers, totalMembers] = await Promise.all([
    Book.countDocuments(NOT_ARCHIVED),
    Book.aggregate([
      { $match: NOT_ARCHIVED },
      { $group: { _id: null, total: { $sum: '$totalCopies' }, available: { $sum: '$availableCopies' } } },
    ]),
    Borrow.countDocuments({ status: 'borrowed' }),
    // The same status rules as the Transactions tabs (utils/transactionStatus.js)
    Borrow.countDocuments(statusFilter('active', now)),
    Borrow.countDocuments(statusFilter('due_soon', now)),
    Borrow.countDocuments(statusFilter('overdue', now)),
    User.countDocuments({ role: 'member', isActive: true }),
    User.countDocuments({ role: 'member' }),
  ]);
  // Note: an archived book can never have borrowed copies (archiving is blocked while copies are
  // out), so the borrowed / late / due-soon counts never include archived books either.
  return {
    titles,
    totalCopies: copies[0]?.total || 0,
    availableCopies: copies[0]?.available || 0,
    borrowedNow, // active + due soon + late
    active,      // more than 3 days left
    dueSoon,     // return date within 3 days
    late,        // past the return date
    activeMembers,
    totalMembers,
  };
}

module.exports = { libraryStats, NOT_ARCHIVED };
