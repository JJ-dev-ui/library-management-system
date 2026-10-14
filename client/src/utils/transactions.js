// Display info for the derived transaction statuses (calculated by the server from the dates).
// The keys (overdue, due_soon) are API values; the visible words come from utils/labels.js.
import { EXTEND, LATE, STATUS_LABELS, TAB_LABELS } from './labels';

export const TX_STATUS = {
  active: { label: STATUS_LABELS.active, badge: 'badge-brand' },
  due_soon: { label: STATUS_LABELS.due_soon, badge: 'badge-warning' },
  overdue: { label: STATUS_LABELS.overdue, badge: 'badge-danger' },
  returned_on_time: { label: STATUS_LABELS.returned_on_time, badge: 'badge-success' },
  returned_late: { label: STATUS_LABELS.returned_late, badge: 'badge-neutral' },
};

// Status tabs on the Transactions page ('' = All)
export const TX_TABS = [
  { value: '', label: TAB_LABELS.all, countKey: 'all' },
  { value: 'active', label: TAB_LABELS.active, countKey: 'active' },
  { value: 'due_soon', label: TAB_LABELS.due_soon, countKey: 'due_soon' },
  { value: 'overdue', label: TAB_LABELS.overdue, countKey: 'overdue' },
  { value: 'returned', label: TAB_LABELS.returned, countKey: 'returned' },
];

export const TX_SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'due_soonest', label: 'Return date (soonest)' },
  { value: 'most_overdue', label: LATE.sortMostLate },
];

export const MAX_RENEWALS = 2;
export const MAX_ACTIVE_LOANS = 5;
export const LOAN_DAYS = 14;
export const RENEW_DAYS = 7;

// Old transactions (made before "renewCount" existed) have no value: treat missing as 0,
// otherwise "undefined + 1" shows "Extension NaN of 2".
export const extensionsUsed = (tx) => tx?.renewCount ?? 0;

// Is this borrowed book past its return date right now?
export const isLate = (tx) => tx?.status === 'borrowed' && new Date(tx.dueDate) < new Date();

// null when the book can be extended, otherwise the reason (shown in the tooltip)
export function extendBlockReason(tx) {
  if (!tx || tx.status !== 'borrowed') return 'Only borrowed books can be extended.';
  if (isLate(tx)) return EXTEND.lateReason;
  if (extensionsUsed(tx) >= MAX_RENEWALS) return EXTEND.maxedReason(MAX_RENEWALS);
  return null;
}

// Return date after one more extension: +7 days on the CURRENT return date (same end-of-day time)
export function extendedReturnDate(tx) {
  const d = new Date(tx.dueDate);
  d.setDate(d.getDate() + RENEW_DAYS);
  return d;
}

// "The return date moves from Oct 9, 2026 to Oct 16, 2026. This is extension 1 of 2."
export const extendMessage = (tx, formatDate) =>
  `The return date moves from ${formatDate(tx.dueDate)} to ${formatDate(extendedReturnDate(tx))}. This is extension ${extensionsUsed(tx) + 1} of ${MAX_RENEWALS}.`;
