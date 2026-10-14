// The columns of every export, in ONE place: the CSV, Excel and PDF writers all read these lists.
//
// Each column:
//   header  column title
//   type    'text' | 'number' | 'date' | 'datetime' | 'percent' (Excel uses it for real number/date cells)
//   get     row -> value (a string, a number, a Date or null)
//   width   Excel column width (characters)
//   pdf     weight of the column in the PDF table (only columns with a weight are printed in the PDF)
//
// PRIVACY (RA 10173, Data Privacy Act): password hashes, tokenVersion, avatarKey and IP addresses are
// NEVER listed here, so no export can contain them. The member queries also remove them before
// the rows reach this file (see queries/users.js).
const { STATUS_LABELS } = require('../utils/labels');

const join = (arr) => (Array.isArray(arr) ? arr.filter(Boolean).join('; ') : '');
const orNull = (n) => (typeof n === 'number' && Number.isFinite(n) ? n : null);

// Status labels as the UI shows them ("overdue" is called "Late"), from utils/labels.js
const TX_LABELS = STATUS_LABELS;

const BOOK_COLUMNS = [
  { header: 'Book ID', type: 'text', width: 26, get: (b) => String(b._id) },
  { header: 'ISBN', type: 'text', width: 16, pdf: 1.3, get: (b) => b.isbn },
  { header: 'Title', type: 'text', width: 40, pdf: 3.2, get: (b) => b.title },
  { header: 'Subtitle', type: 'text', width: 30, get: (b) => b.subtitle },
  { header: 'Authors', type: 'text', width: 30, pdf: 2.2, get: (b) => join(b.authors) },
  { header: 'Category', type: 'text', width: 18, pdf: 1.3, get: (b) => b.category },
  { header: 'Subjects', type: 'text', width: 36, get: (b) => join(b.subjects) },
  { header: 'Publisher', type: 'text', width: 24, get: (b) => b.publisher },
  { header: 'Published year', type: 'number', width: 10, pdf: 0.8, pdfHeader: 'Published', get: (b) => orNull(b.publishedYear) },
  { header: 'Pages', type: 'number', width: 8, get: (b) => orNull(b.pages) },
  { header: 'Language', type: 'text', width: 12, get: (b) => b.language },
  { header: 'Shelf', type: 'text', width: 10, pdf: 0.8, get: (b) => b.shelfLocation },
  { header: 'Total copies', type: 'number', width: 9, get: (b) => b.totalCopies },
  { header: 'Available', type: 'number', width: 9, get: (b) => b.availableCopies },
  // PDF only: "3 / 5" saves a column on a landscape page
  { header: 'Available/Total', type: 'text', pdfOnly: true, pdf: 1, get: (b) => `${b.availableCopies} / ${b.totalCopies}` },
  { header: 'Borrowed now', type: 'number', width: 9, get: (b) => b.totalCopies - b.availableCopies },
  { header: 'Times borrowed', type: 'number', width: 9, get: (b) => b.timesBorrowed || 0 },
  { header: 'Custom cover', type: 'text', width: 8, get: (b) => (b.hasCustomCover ? 'Yes' : 'No') },
  // Only "Yes" when the export included archived books ("Show archived books" switch)
  { header: 'Archived', type: 'text', width: 9, get: (b) => (b.isArchived ? 'Yes' : 'No') },
  { header: 'Description', type: 'text', width: 60, get: (b) => b.description },
  { header: 'Date added', type: 'datetime', width: 17, get: (b) => b.createdAt },
  { header: 'Last updated', type: 'datetime', width: 17, get: (b) => b.updatedAt },
];

const MEMBER_COLUMNS = [
  { header: 'Member ID', type: 'text', width: 15, pdf: 1.2, get: (u) => u.memberId },
  { header: 'Name', type: 'text', width: 26, pdf: 2, get: (u) => u.name },
  { header: 'Email', type: 'text', width: 30, pdf: 2.4, get: (u) => u.email },
  { header: 'Contact number', type: 'text', width: 15, pdf: 1.2, pdfHeader: 'Contact', get: (u) => u.contactNumber },
  { header: 'Address', type: 'text', width: 36, get: (u) => u.address },
  { header: 'Role', type: 'text', width: 10, pdf: 0.8, get: (u) => (u.role === 'admin' ? 'Librarian' : 'Member') },
  { header: 'Status', type: 'text', width: 12, pdf: 0.9, get: (u) => (u.isActive ? 'Active' : 'Deactivated') },
  { header: 'Joined', type: 'date', width: 12, pdf: 0.9, get: (u) => u.createdAt },
  { header: 'Last login', type: 'datetime', width: 17, get: (u) => u.lastLoginAt },
  { header: 'Last device', type: 'text', width: 20, get: (u) => u.lastLoginDevice }, // device name only, never the IP
  { header: 'Borrowed now', type: 'number', width: 9, pdf: 0.8, get: (u) => u.activeLoans || 0 },
  { header: 'Late now', type: 'number', width: 9, get: (u) => u.overdueLoans || 0 },
  { header: 'Total borrowed', type: 'number', width: 9, get: (u) => u.totalBorrowed || 0 },
  // null = no returned books yet (an empty cell is more honest than "0%")
  { header: 'Returned on time %', type: 'percent', width: 10, get: (u) => (u.returnedCount ? u.onTimeCount / u.returnedCount : null) },
  { header: 'Notes', type: 'text', width: 40, get: (u) => u.notes },
];

const TX_COLUMNS = [
  { header: 'Code', type: 'text', width: 16, pdf: 1.3, get: (t) => t.code },
  { header: 'Status', type: 'text', width: 16, pdf: 1.1, get: (t) => TX_LABELS[t.derivedStatus] || '' },
  { header: 'Book title', type: 'text', width: 40, pdf: 3, pdfHeader: 'Book', get: (t) => t.book?.title || '(deleted book)' },
  { header: 'ISBN', type: 'text', width: 16, get: (t) => t.book?.isbn },
  { header: 'Member ID', type: 'text', width: 15, get: (t) => t.user?.memberId },
  { header: 'Member name', type: 'text', width: 26, pdf: 2, pdfHeader: 'Member', get: (t) => t.user?.name || '(deleted member)' },
  { header: 'Member email', type: 'text', width: 30, get: (t) => t.user?.email },
  { header: 'Borrowed at', type: 'datetime', width: 17, pdf: 1.3, pdfHeader: 'Borrowed', get: (t) => t.borrowedAt },
  { header: 'Return date', type: 'date', width: 12, pdf: 1, get: (t) => t.dueDate },
  { header: 'Returned at', type: 'datetime', width: 17, pdf: 1.3, pdfHeader: 'Returned', get: (t) => t.returnedAt },
  { header: 'Days late', type: 'number', width: 8, get: (t) => t.daysLate },
  { header: 'Times extended', type: 'number', width: 9, get: (t) => t.renewCount ?? 0 }, // missing on old transactions = 0
  { header: 'Processed by', type: 'text', width: 22, get: (t) => t.processedBy?.name },
  { header: 'Created', type: 'datetime', width: 17, get: (t) => t.createdAt },
];

// The PDF prints only the key columns (so the table fits an A4 page); the order of the PDF
// columns is the order listed here. CSV and Excel print every column except the PDF-only ones.
const PDF_ORDER = {
  books: ['ISBN', 'Title', 'Authors', 'Category', 'Published year', 'Shelf', 'Available/Total'],
  members: ['Member ID', 'Name', 'Email', 'Contact number', 'Role', 'Status', 'Borrowed now', 'Joined'],
  transactions: ['Code', 'Book title', 'Member name', 'Borrowed at', 'Return date', 'Returned at', 'Status'],
};
const ALL = { books: BOOK_COLUMNS, members: MEMBER_COLUMNS, transactions: TX_COLUMNS };

function columnsFor(entity, format) {
  if (format === 'pdf') return PDF_ORDER[entity].map((h) => ALL[entity].find((c) => c.header === h));
  return ALL[entity].filter((c) => !c.pdfOnly);
}

module.exports = { columnsFor };
