// Member notifications (the bell). Two kinds:
// 1. EVENT notifications, created the moment something happens (request approved / denied / expired /
//    cancelled) — see notifyRequest().
// 2. REMINDERS, created lazily: whenever a member's summary or notifications are loaded,
//    refreshReminders() checks their borrowed books and the new books of this week.
// Every notification has a dedupeKey; the unique index { user, dedupeKey } guarantees "only once".
const Notification = require('../models/Notification');
const Borrow = require('../models/Borrow');
const Book = require('../models/Book');
const { DAY_MS } = require('./transactionStatus');
const { manilaMidnight } = require('./manila');

const OFFSET_MS = 8 * 60 * 60 * 1000; // Asia/Manila = UTC+8 all year
const REMIND_DAYS = 2;                 // "return soon" reminder when the return date is within 2 days

// "Oct 28" in Manila time
const shortDate = (d) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'Asia/Manila' });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Creates the notification unless one with the same dedupeKey exists for this member.
// upsert + $setOnInsert: an existing one is left exactly as it is (its read state is kept).
async function notify({ user, dedupeKey, createdAt = new Date(), readAt = null, ...fields }) {
  try {
    await Notification.updateOne(
      { user, dedupeKey },
      { $setOnInsert: { user, dedupeKey, createdAt, readAt, ...fields } },
      { upsert: true }
    );
  } catch (err) {
    // 11000 = two requests created the same reminder at the same moment: the other one won, fine
    if (err.code !== 11000) console.error('Could not create notification:', err.message);
  }
}

const REQUEST_TEXT = {
  request_approved: (title, extra) => ({
    title: 'Request approved',
    message: `Approved — enjoy '${title}'! Return it by ${extra.dueDate ? shortDate(extra.dueDate) : 'the return date'}.`,
    link: '/my-books?tab=borrowed',
  }),
  request_denied: (title, extra) => ({
    title: 'Request denied',
    message: `Your request for '${title}' was denied.${extra.note ? ` Librarian's note: "${extra.note}"` : ''}`,
    link: '/my-books?tab=requests',
  }),
  request_expired: (title) => ({
    title: 'Request expired',
    message: `Your request for '${title}' expired because it was not picked up within 3 days.`,
    link: '/my-books?tab=requests',
  }),
  request_cancelled: (title) => ({
    title: 'Request cancelled',
    message: `You cancelled your request for '${title}'.`,
    link: '/my-books?tab=requests',
  }),
};

// One notification per request + type (dedupeKey "request:<id>:<type>")
function notifyRequest(type, request, book, extra = {}) {
  const text = REQUEST_TEXT[type](book?.title || 'a book', extra);
  return notify({
    user: request.user?._id || request.user,
    type,
    ...text,
    book: book?._id,
    request: request._id,
    transaction: extra.transaction,
    dedupeKey: `request:${request._id}:${type}`,
    createdAt: extra.createdAt || new Date(),
    readAt: extra.readAt || null, // e.g. "cancelled" is the member's own action: already read
  });
}

// ISO week "2026-W42" (Manila time), used for the weekly "new books" digest
function isoWeek(now = new Date()) {
  const d = new Date(now.getTime() + OFFSET_MS); // UTC fields = Manila clock
  const day = (d.getUTCDay() + 6) % 7;            // Monday = 0
  const thursday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3));
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = 1 + Math.floor((thursday - yearStart) / (7 * DAY_MS));
  // Monday 00:00 Manila of this week, as a real Date
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day) - OFFSET_MS);
  return { key: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, '0')}`, monday };
}

// Lazy reminders for ONE member: return soon / late (once per transaction) + the weekly new-books digest.
async function refreshReminders(userId, now = new Date()) {
  const soon = new Date(now.getTime() + REMIND_DAYS * DAY_MS);
  const { key, monday } = isoWeek(now);
  const [loans, newBooks] = await Promise.all([
    Borrow.find({ user: userId, status: 'borrowed', dueDate: { $lte: soon } }).populate('book', 'title').lean(),
    Book.countDocuments({ isArchived: { $ne: true }, createdAt: { $gte: monday } }),
  ]);
  const jobs = loans.map((l) => {
    const title = l.book?.title || 'a book';
    if (l.dueDate < now) {
      const days = Math.max(1, Math.ceil((now - l.dueDate) / DAY_MS));
      return notify({
        user: userId, type: 'late', title: 'Late book',
        message: `'${title}' is ${plural(days, 'day', 'days')} late. Please return it to the library counter.`,
        link: '/my-books?tab=borrowed', book: l.book?._id, transaction: l._id, dedupeKey: `late:${l._id}`,
      });
    }
    return notify({
      user: userId, type: 'return_soon', title: 'Return soon',
      message: `Return '${title}' by ${shortDate(l.dueDate)}.`,
      link: '/my-books?tab=borrowed', book: l.book?._id, transaction: l._id, dedupeKey: `return_soon:${l._id}`,
    });
  });
  if (newBooks > 0) {
    jobs.push(notify({
      user: userId, type: 'new_books', title: 'New arrivals',
      message: `${plural(newBooks, 'new book was', 'new books were')} added this week.`,
      link: '/?added=week&sort=newest', dedupeKey: `new_books:${key}`,
    }));
  }
  jobs.push(newBooksToday(userId, now), topBookOfLastMonth(userId, now));
  await Promise.all(jobs);
}

// ----- Calendar helpers in Manila time -----
const manilaParts = (d) => { const m = new Date(d.getTime() + OFFSET_MS); return { y: m.getUTCFullYear(), mo: m.getUTCMonth(), day: m.getUTCDate() }; };
const manilaDateKey = (d) => { const p = manilaParts(d); return `${p.y}-${String(p.mo + 1).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`; };
// Midnight (Manila) of the 1st of a month, as a real Date (monthOffset -1 = last month)
const manilaMonthStart = (d, monthOffset = 0) => { const p = manilaParts(d); return new Date(Date.UTC(p.y, p.mo + monthOffset, 1) - OFFSET_MS); };

// "5 new books were added today" — once per Manila day, only when there are new books
async function newBooksToday(userId, now) {
  const today = manilaDateKey(now);
  const count = await Book.countDocuments({ isArchived: { $ne: true }, createdAt: { $gte: manilaMidnight(now, 0) } });
  if (!count) return;
  await notify({
    user: userId, type: 'new_books_today', title: 'New today',
    message: `${plural(count, 'new book was', 'new books were')} added today.`,
    link: '/?sort=newest', dedupeKey: `new_books_today:${today}`,
  });
}

// "Last month's most borrowed book: 'Sapiens'" — once per month (on the first fetch of a new month)
async function topBookOfLastMonth(userId, now) {
  const monthKey = manilaDateKey(now).slice(0, 7); // "2026-10"
  const dedupeKey = `top_book_month:${monthKey}`;
  if (await Notification.exists({ user: userId, dedupeKey })) return; // already told this month
  const [top] = await Borrow.aggregate([
    { $match: { borrowedAt: { $gte: manilaMonthStart(now, -1), $lt: manilaMonthStart(now, 0) } } },
    { $group: { _id: '$book', n: { $sum: 1 } } },
    { $sort: { n: -1, _id: 1 } },
    // archived books are skipped ($lookup finds nothing, $unwind drops the row)
    { $lookup: { from: Book.collection.name, localField: '_id', foreignField: '_id', as: 'book', pipeline: [{ $match: { isArchived: { $ne: true } } }, { $project: { title: 1 } }] } },
    { $unwind: '$book' },
    { $limit: 1 },
  ]);
  if (!top) return;
  await notify({
    user: userId, type: 'top_book_month', title: 'Top book of last month',
    message: `Last month's most borrowed book: '${top.book.title}'`,
    link: `/?book=${top._id}`, book: top._id, dedupeKey,
  });
}

// A return made a fully-borrowed book available again (0 -> 1 copy): tell every member who bookmarked
// it. Called by the return handler (not lazily). Once per book per Manila day (dedupeKey).
// exceptUserId: the member who just returned it does not need the news.
async function notifyBookmarkers(book, exceptUserId) {
  // required here (not at the top) so this file does not depend on the Bookmark model at load time
  const Bookmark = require('../models/Bookmark');
  const marks = await Bookmark.find({ book: book._id, ...(exceptUserId ? { user: { $ne: exceptUserId } } : {}) }).select('user').lean();
  const day = manilaDateKey(new Date());
  await Promise.all(marks.map((m) => notify({
    user: m.user, type: 'bookmark_available', title: 'Available again',
    message: `'${book.title}' is available again — request it before it's gone.`,
    link: `/?book=${book._id}`, book: book._id, dedupeKey: `available:${book._id}:${day}`,
  })));
}

module.exports = { notify, notifyRequest, refreshReminders, notifyBookmarkers, shortDate, isoWeek };
