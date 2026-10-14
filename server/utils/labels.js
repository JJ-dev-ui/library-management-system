// Visible wording used by the SERVER (export files, filter descriptions, error messages).
// Same words as client/src/utils/labels.js; keep the two files in step.
// A book past its return date is "Late" (never "overdue"/"unreturned" on screen or in files).

const STATUS_LABELS = {
  active: 'Active',
  due_soon: 'Due soon',
  overdue: 'Late',
  returned: 'Returned',
  returned_on_time: 'Returned on time',
  returned_late: 'Returned late',
};

// Status filter / tab names (the tab for due_soon is "Returning soon")
const TAB_LABELS = { ...STATUS_LABELS, due_soon: 'Returning soon' };

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

const MESSAGES = {
  extendLate: "Late books can't be extended. Mark it returned first.",
  extendMaxed: (max) => `This book was already extended ${max} times.`,
  lendWhileLate: (name, late) => `${name} has ${plural(late, 'late book', 'late books')}. ${late === 1 ? 'It' : 'They'} must be returned before borrowing more.`,
  memberHasHistory: 'This member has borrowing history. Deactivate the account instead.',
  bookHasHistory: 'This book has borrowing history. Archive it instead of deleting it.',
  bookArchived: 'This book is archived. Restore it first.',
};

module.exports = { STATUS_LABELS, TAB_LABELS, MESSAGES };
