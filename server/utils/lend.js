// Creating a borrow transaction, in ONE place. Used by "Lend to member" (routes/transactions.js) and
// by approving a member's request (routes/requests.js), so both work exactly the same way.
const Book = require('../models/Book');
const Borrow = require('../models/Borrow');
const { nextTransactionCode } = require('./counter');
const { addDaysEndOfDay } = require('./transactionStatus');
const { LOAN_DAYS } = require('./policy');

// Returns { loan, book } on success, or { error: { status, message } }.
// The member checks (active, limits, late books) are done by the caller BEFORE calling this.
async function createLoan({ member, bookId, processedBy }) {
  // 1) Take one copy off the shelf ATOMICALLY. The condition availableCopies > 0 and the -1 happen in
  //    ONE database operation, so two librarians lending the last copy at the same moment cannot both
  //    succeed (no negative stock). Archived books are never lent.
  const book = await Book.findOneAndUpdate(
    { _id: bookId, availableCopies: { $gt: 0 }, isArchived: { $ne: true } },
    { $inc: { availableCopies: -1, timesBorrowed: 1 } },
    { new: true }
  );
  if (!book) {
    const exists = await Book.findById(bookId).select('isArchived').lean();
    if (!exists) return { error: { status: 404, message: 'Book not found' } };
    if (exists.isArchived) return { error: { status: 400, message: 'This book is archived. Restore it first.' } };
    return { error: { status: 400, message: 'No copies of this book are available right now' } };
  }

  // 2) Create the transaction. If that fails, put the copy back (manual rollback).
  try {
    const now = new Date();
    const loan = await Borrow.create({
      code: await nextTransactionCode(),
      user: member._id,
      book: book._id,
      borrowedAt: now,
      dueDate: addDaysEndOfDay(now, LOAN_DAYS), // end of the 14th day
      processedBy,
    });
    return { loan, book };
  } catch (err) {
    await Book.updateOne({ _id: book._id }, { $inc: { availableCopies: 1, timesBorrowed: -1 } });
    // 11000 = the unique "one active loan per member and book" index (a double click)
    if (err.code === 11000) return { error: { status: 409, message: `${member.name} already has a copy of this book` } };
    throw err;
  }
}

module.exports = { createLoan };
