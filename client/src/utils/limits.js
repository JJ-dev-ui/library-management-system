// Field limits. These MUST match server/utils/limits.js, so the inputs stop at exactly the
// length the server accepts.
export const CURRENT_YEAR = new Date().getFullYear();

export const BOOK = {
  title: 200, subtitle: 200, authors: 10, author: 120, isbnTyped: 17, publisher: 120, shelf: 10,
  description: 2000, subjects: 15, subject: 60, yearMin: 1000, yearMax: CURRENT_YEAR, pagesMax: 9999, copiesMax: 999,
};
export const LANGUAGES = ['English', 'Filipino', 'Tagalog', 'Spanish', 'French', 'German', 'Japanese', 'Chinese', 'Other'];
export const SHELF_RX = /^[A-Z]{2,4}-[A-Z]\d{1,2}$/; // e.g. PRG-B4

export const MEMBER = { name: 80, email: 254, contact: 13, address: 200, notes: 500, passwordMin: 6, passwordMax: 72 };
