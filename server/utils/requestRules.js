// The rules for borrow REQUESTS, in ONE place. Used when a member sends a request, when the librarian
// approves it, and by the member portal to show WHY the Request button is disabled.
const Borrow = require('../models/Borrow');
const BorrowRequest = require('../models/BorrowRequest');
const { statusFilter, addDaysEndOfDay } = require('./transactionStatus');
const { MAX_ACTIVE_LOANS, REQUEST_DAYS } = require('./policy');
const { logActivity } = require('./activity');
const { notifyRequest } = require('./notifications');

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// When a request made now expires: the end of the 3rd day
const requestExpiry = (from = new Date()) => addDaysEndOfDay(from, REQUEST_DAYS);

// Member-level block (the same for EVERY book): deactivated, a late book, or the 5-book limit.
// Returns { reason, message } or null. Used by the feed/bookmarks so a whole page needs ONE check
// instead of one per book (no N+1 queries).
async function memberBlock(member) {
  if (!member || !member.isActive) return { reason: 'inactive', message: 'This account is deactivated.' };
  const [late, borrowed, pending] = await Promise.all([
    Borrow.countDocuments({ user: member._id, ...statusFilter('overdue', new Date()) }),
    Borrow.countDocuments({ user: member._id, status: 'borrowed' }),
    BorrowRequest.countDocuments({ user: member._id, status: 'pending' }),
  ]);
  if (late > 0) return { reason: 'late', message: `You have ${plural(late, 'late book', 'late books')}. Return ${late === 1 ? 'it' : 'them'} before requesting more.` };
  if (borrowed + pending >= MAX_ACTIVE_LOANS) {
    return { reason: 'limit', message: `You've reached the ${MAX_ACTIVE_LOANS}-book limit (${borrowed} borrowed, ${pending} requested).` };
  }
  return null;
}

// Can this member get this book? Returns { ok: true } or { ok: false, reason, message }.
//   member, book: documents (book may be null = not found)
//   requestId: when APPROVING, that request itself is not counted as "another pending request"
//   forAdmin: the message talks about the member by name instead of "You"
async function checkRequestRules(member, book, { requestId = null, forAdmin = false } = {}) {
  const fail = (reason, message) => ({ ok: false, reason, message });
  const who = forAdmin ? member.name : 'You';
  const has = forAdmin ? 'has' : 'have';

  if (!member || !member.isActive) return fail('inactive', 'This account is deactivated.');
  if (member.role !== 'member') return fail('not_member', 'Only member accounts can borrow books.');
  if (!book) return fail('not_found', 'Book not found.');
  if (book.isArchived) return fail('archived', 'This book is no longer in the catalog.');

  const otherPending = { user: member._id, status: 'pending', ...(requestId ? { _id: { $ne: requestId } } : {}) };
  const [late, borrowed, pending, borrowingThis, requestedThis] = await Promise.all([
    Borrow.countDocuments({ user: member._id, ...statusFilter('overdue', new Date()) }),
    Borrow.countDocuments({ user: member._id, status: 'borrowed' }),
    BorrowRequest.countDocuments(otherPending),
    Borrow.exists({ user: member._id, book: book._id, status: 'borrowed' }),
    BorrowRequest.exists({ ...otherPending, book: book._id }),
  ]);

  if (late > 0) {
    return fail('late', `${who} ${has} ${plural(late, 'late book', 'late books')}. Return ${late === 1 ? 'it' : 'them'} before ${forAdmin ? 'borrowing' : 'requesting'} more.`);
  }
  if (borrowingThis) return fail('already_borrowing', `${who} ${forAdmin ? 'is' : 'are'} already borrowing this book.`);
  if (requestedThis) return fail('already_requested', `${who} already requested this book.`);
  // Borrowed books + pending requests together may not pass the limit
  if (borrowed + pending >= MAX_ACTIVE_LOANS) {
    return fail('limit', `${forAdmin ? `${member.name} has` : "You've"} reached the ${MAX_ACTIVE_LOANS}-book limit (${borrowed} borrowed, ${pending} requested).`);
  }
  if (book.availableCopies <= 0) return fail('unavailable', 'No copies are available right now.');
  return { ok: true };
}

// LAZY EXPIRY: there is no background timer. Before requests are read anywhere, the pending ones
// past their expiry time are marked "expired" here. Each one is changed with its own conditional
// update ({ status: 'pending' } in the filter), so even when two pages load at the same moment a
// request expires only ONCE, and the activity log + member notification are created only once.
// filter: e.g. { user } to only check one member's requests.
async function expirePendingRequests(filter = {}) {
  const now = new Date();
  const due = await BorrowRequest.find({ ...filter, status: 'pending', expiresAt: { $lt: now } })
    .populate('book', 'title').populate('user', 'name').lean();
  for (const r of due) {
    const updated = await BorrowRequest.findOneAndUpdate(
      { _id: r._id, status: 'pending' },
      { $set: { status: 'expired', decidedAt: r.expiresAt } },
      { new: true }
    );
    if (!updated) continue; // someone else expired / decided it first
    await logActivity({
      type: 'request_expired', actor: r.user?._id, member: r.user?._id, book: r.book?._id,
      meta: { code: r.code, bookTitle: r.book?.title, memberName: r.user?.name }, createdAt: r.expiresAt,
    });
    await notifyRequest('request_expired', updated, r.book, { createdAt: r.expiresAt });
  }
  return due.length;
}

module.exports = { checkRequestRules, memberBlock, expirePendingRequests, requestExpiry };
