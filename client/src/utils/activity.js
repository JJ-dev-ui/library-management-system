// Labels and soft badge styles for the activity log ("Recent activity" on the dashboard)
export const ACTIVITY = {
  book_borrowed: { label: 'Borrowed', badge: 'badge-brand' },
  book_returned: { label: 'Returned', badge: 'badge-success' },
  borrow_extended: { label: 'Extended', badge: 'badge-info' },
  book_added: { label: 'Book added', badge: 'badge-neutral' },
  book_updated: { label: 'Book edited', badge: 'badge-neutral' },
  book_deleted: { label: 'Book deleted', badge: 'badge-danger' },
  book_archived: { label: 'Book archived', badge: 'badge-warning' },
  book_restored: { label: 'Book restored', badge: 'badge-success' },
  member_added: { label: 'New member', badge: 'badge-success' },
  member_registered: { label: 'New member', badge: 'badge-success' },
  member_updated: { label: 'Member updated', badge: 'badge-neutral' },
  member_activated: { label: 'Activated', badge: 'badge-success' },
  member_deactivated: { label: 'Deactivated', badge: 'badge-warning' },
  member_deleted: { label: 'Member deleted', badge: 'badge-danger' },
  password_changed: { label: 'Password changed', badge: 'badge-info' },
  request_created: { label: 'Requested', badge: 'badge-warning' },
  request_cancelled: { label: 'Request cancelled', badge: 'badge-neutral' },
  request_approved: { label: 'Request approved', badge: 'badge-success' },
  request_denied: { label: 'Request denied', badge: 'badge-danger' },
  request_expired: { label: 'Request expired', badge: 'badge-neutral' },
  data_exported: { label: 'Exported', badge: 'badge-info' },
  books_imported: { label: 'Imported', badge: 'badge-success' },
};

const FORMAT_LABELS = { csv: 'CSV', xlsx: 'Excel', pdf: 'PDF' };
const plural = (n, one, many) => `${Number(n || 0).toLocaleString()} ${n === 1 ? one : many}`;
const NOUNS = { books: ['book', 'books'], members: ['member', 'members'], transactions: ['transaction', 'transactions'] };

// One-line description for events that are not about one member/book (exports, imports).
// Returns null for the other events (they show the member and book columns instead).
export function activityDetail(a) {
  const m = a.meta || {};
  if (a.type === 'data_exported') {
    const [one, many] = NOUNS[m.entity] || ['row', 'rows'];
    return `Exported ${plural(m.count, one, many)} as ${FORMAT_LABELS[m.format] || m.format}`;
  }
  if (a.type === 'books_imported') {
    return `Imported ${plural(m.imported, 'book', 'books')}${m.skipped ? ` · ${m.skipped.toLocaleString()} skipped` : ''}`;
  }
  return null;
}

// Name to show for the member/book of a row: the live record, or the snapshot saved in meta
// (when the member or book was deleted later)
export const memberName = (a) => a.member?.name || a.meta?.memberName || '—';
export const bookTitle = (a) => a.book?.title || a.meta?.bookTitle || '—';
