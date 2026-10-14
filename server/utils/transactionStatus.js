// "Derived" status of a transaction: calculated from the dates, never stored.
//   Active            borrowed, due in more than 3 days
//   Due soon          borrowed, due within the next 3 days
//   Overdue           borrowed, due date has passed
//   Returned on time  returned on or before the due date
//   Returned late     returned after the due date
const DAY_MS = 24 * 60 * 60 * 1000;
const DUE_SOON_DAYS = 3;

// Return dates are the END of a day (23:59:59.999, server time), so "return by Oct 27" means the
// member has the whole of Oct 27. addDaysEndOfDay(now, 14) = end of the 14th day from now.
// setDate() handles month/year changes and daylight-saving time correctly.
function addDaysEndOfDay(from, days) {
  const d = new Date(from);
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 999);
  return d;
}

// Visible labels live in utils/labels.js ("overdue" is shown as "Late"); re-exported here for old imports
const { STATUS_LABELS } = require('./labels');

// For one loan document (used when sending rows to the client)
function deriveStatus(loan, now = new Date()) {
  if (loan.status === 'returned') {
    return loan.returnedAt && loan.returnedAt > loan.dueDate ? 'returned_late' : 'returned_on_time';
  }
  if (loan.dueDate < now) return 'overdue';
  if (loan.dueDate <= new Date(now.getTime() + DUE_SOON_DAYS * DAY_MS)) return 'due_soon';
  return 'active';
}

// The SAME rules as a MongoDB filter (used for the status tabs / filters and the counts)
function statusFilter(key, now = new Date()) {
  const soon = new Date(now.getTime() + DUE_SOON_DAYS * DAY_MS);
  switch (key) {
    case 'active': return { status: 'borrowed', dueDate: { $gt: soon } };
    case 'due_soon': return { status: 'borrowed', dueDate: { $gte: now, $lte: soon } };
    case 'overdue': return { status: 'borrowed', dueDate: { $lt: now } };
    case 'returned': return { status: 'returned' };
    // $expr lets the filter compare two fields of the same document
    case 'returned_on_time': return { status: 'returned', $expr: { $lte: ['$returnedAt', '$dueDate'] } };
    case 'returned_late': return { status: 'returned', $expr: { $gt: ['$returnedAt', '$dueDate'] } };
    default: return {};
  }
}

module.exports = { DAY_MS, DUE_SOON_DAYS, STATUS_LABELS, deriveStatus, statusFilter, addDaysEndOfDay };
