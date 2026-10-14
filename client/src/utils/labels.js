// EVERY visible status / "late" wording lives here, so the words can never drift apart between
// pages again. The server has the same words in server/utils/labels.js (exports and messages).
//
// Wording rule: the UI never says "due", "overdue" or "loan". A book past its return date is "Late".
// Two exceptions are kept on purpose: the "Due soon" status badge and the "Returning soon" tab/card.
// Internal names (overdue, hasOverdue, dueDate, due_soon) are API values and stay unchanged.

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Derived transaction statuses (badge text)
export const STATUS_LABELS = {
  active: 'Active',
  due_soon: 'Due soon',
  overdue: 'Late',
  returned: 'Returned',
  returned_on_time: 'Returned on time',
  returned_late: 'Returned late',
};

// Status tabs on the Transactions page
export const TAB_LABELS = {
  all: 'All',
  active: 'Active',
  due_soon: 'Returning soon',
  overdue: 'Late',
  returned: 'Returned',
};

export const LATE = {
  statLabel: 'Late books',                 // stat cards (Dashboard, Books, Transactions)
  statHint: 'Past the return date',
  followUpTitle: 'Late books to follow up', // dashboard card
  membersStat: 'With late books',          // Members stat card
  filterLabel: 'Late books',               // Members filter panel
  hasLate: 'Has late books',
  noLate: 'No late books',
  sortMostLate: 'Most days late',
  count: (n) => `${n} late`,                                 // "1 late" next to "3 books"
  days: (n) => `${plural(n, 'day', 'days')} late`,           // "5 days late"
  memberBooks: (books, late) => `${plural(books, 'book', 'books')}${late ? ` · ${late} late` : ''}`, // "3 books · 1 late"
};

// Borrow requests (member portal + the librarians' Requests page)
export const REQUEST_STATUS = {
  pending: { label: 'Pending', badge: 'badge-warning' },
  approved: { label: 'Approved', badge: 'badge-success' },
  denied: { label: 'Denied', badge: 'badge-danger' },
  cancelled: { label: 'Cancelled', badge: 'badge-neutral' },
  expired: { label: 'Expired', badge: 'badge-neutral' },
};
export const REQUEST_TABS = [
  { value: 'pending', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'denied', label: 'Denied' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'expired', label: 'Expired' },
  { value: 'all', label: 'All' },
];

// Member portal wording
export const MEMBER = {
  lateAlert: (n) => `You have ${n === 1 ? '1 late book' : `${n} late books`}. Please return ${n === 1 ? 'it' : 'them'} to the library counter — you can't request books until then.`,
  requestSent: "Request sent. We'll notify you when it's approved.",
  pickUp: 'Pick it up at the library counter within 3 days.',
};

// Same words as the server's refusals (server/utils/labels.js), shown before the user even tries
export const MESSAGES = {
  memberHasHistory: 'This member has borrowing history. Deactivate the account instead.',
  hasLateBooks: (n) => `Has ${n === 1 ? 'a late book' : `${n} late books`}: it must be returned before borrowing more.`,
  archiveExplain: 'This book has borrowing history, so it will be archived: hidden from the catalog but kept in records. You can restore it anytime.',
};

// Why an Extend button is disabled (also used as the tooltip)
export const EXTEND = {
  label: 'Extend (+7 days)',
  lateReason: "Late books can't be extended. Mark it returned first.",
  maxedReason: (max) => `This book was already extended ${max} times.`,
};
