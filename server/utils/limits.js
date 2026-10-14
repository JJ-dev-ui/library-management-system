// Field limits, in ONE place. The client has the same numbers in client/src/utils/limits.js,
// so the forms stop typing at exactly the limit the server enforces.
const CURRENT_YEAR = new Date().getFullYear();

const BOOK = {
  title: 200, subtitle: 200, authors: 10, author: 120, isbnTyped: 17, publisher: 120, shelf: 10,
  description: 2000, subjects: 15, subject: 60, yearMin: 1000, yearMax: CURRENT_YEAR, pagesMax: 9999, copiesMax: 999,
};
const LANGUAGES = ['English', 'Filipino', 'Tagalog', 'Spanish', 'French', 'German', 'Japanese', 'Chinese', 'Other'];
// Shelf code like "PRG-B4": 2–4 letters, a dash, one letter and 1–2 digits
const SHELF_RX = /^[A-Z]{2,4}-[A-Z]\d{1,2}$/;

const MEMBER = { name: 80, email: 254, contact: 13, address: 200, notes: 500, passwordMin: 6, passwordMax: 72 };
// passwordMax 72: bcrypt only uses the first 72 bytes of a password, so longer ones would be misleading

module.exports = { BOOK, LANGUAGES, SHELF_RX, MEMBER, CURRENT_YEAR };
