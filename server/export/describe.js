// Turns the (validated) filters of an export into readable lines for the file's header / "Report info"
// sheet, e.g. ["Search: tolkien (in Author)", "Category: Fiction", "Sort: Title A–Z"].
// The labels are the same words the filter panels show on screen.
const { formatManila } = require('../utils/manila');
const { TAB_LABELS } = require('../utils/labels');

const day = (iso) => formatManila(iso, false);
const range = (label, from, to) => {
  if (from && to) return `${label}: ${day(from)} to ${day(to)}`;
  if (from) return `${label}: from ${day(from)}`;
  if (to) return `${label}: until ${day(to)}`;
  return null;
};

const BOOKS = {
  searchIn: { all: 'All fields', title: 'Title', author: 'Author', isbn: 'ISBN', publisher: 'Publisher', subject: 'Subject' },
  availability: { available: 'Available', low: 'Low stock', out: 'All borrowed' },
  length: { short: 'Short (< 200 pages)', medium: 'Medium (200–400 pages)', long: 'Long (400+ pages)' },
  copies: { single: '1 copy', few: '2–5 copies', many: '6+ copies' },
  addedWithin: { today: 'Today', 7: 'Last 7 days', 30: 'Last 30 days', 90: 'Last 90 days' },
  sort: {
    title: 'Title A–Z', title_desc: 'Title Z–A', author: 'Author A–Z', newest: 'Recently added',
    year_desc: 'Year (newest)', year_asc: 'Year (oldest)', available: 'Most available', popular: 'Most borrowed',
  },
};
const MEMBERS = {
  role: { member: 'Members', admin: 'Librarians' },
  status: { active: 'Active', deactivated: 'Deactivated' },
  hasOverdue: { yes: 'Has late books', no: 'No late books' },
  lastLogin: { today: 'Today', '7d': 'In the last 7 days', '30d': 'In the last 30 days', never: 'Never logged in' },
  sort: { name: 'Name A–Z', newest: 'Newest first', last_login: 'Last login', most_loans: 'Most borrowed now' },
};
const TX = {
  status: TAB_LABELS, // "Late", "Returning soon", ... from utils/labels.js
  sort: { newest: 'Newest first', due_soonest: 'Return date (soonest)', most_overdue: 'Most days late' },
};

function describeFilters(entity, f = {}) {
  const out = [];
  const add = (line) => line && out.push(line);
  if (entity === 'books') {
    if (f.search) add(`Search: ${f.search}${f.searchIn && f.searchIn !== 'all' ? ` (in ${BOOKS.searchIn[f.searchIn]})` : ''}`);
    if (f.category && f.category !== 'All') add(`Category: ${f.category}`);
    if (f.availability) add(`Availability: ${BOOKS.availability[f.availability]}`);
    if (f.author) add(`Author: ${f.author}`);
    if (f.language) add(`Language: ${f.language}`);
    if (f.publisher) add(`Publisher: ${f.publisher}`);
    if (f.shelf) add(`Shelf: ${f.shelf}`);
    if (f.yearFrom || f.yearTo) add(`Published: ${f.yearFrom || '…'}–${f.yearTo || '…'}`);
    if (f.length) add(`Length: ${BOOKS.length[f.length]}`);
    if (f.copies) add(`Copies: ${BOOKS.copies[f.copies]}`);
    if (f.addedWithin) add(`Date added: ${BOOKS.addedWithin[f.addedWithin]}`);
    if (f.archived) add('Archived books included');
  } else if (entity === 'members') {
    if (f.search) add(`Search: ${f.search}`);
    if (f.role) add(`Role: ${MEMBERS.role[f.role]}`);
    if (f.status) add(`Status: ${MEMBERS.status[f.status]}`);
    if (f.hasOverdue) add(MEMBERS.hasOverdue[f.hasOverdue]);
    if (f.lastLogin) add(`Last login: ${MEMBERS.lastLogin[f.lastLogin]}`);
    add(range('Joined', f.joinedFrom, f.joinedTo));
  } else {
    if (f.search) add(`Search: ${f.search}`);
    if (f.status) add(`Status: ${TX.status[f.status]}`);
    add(range('Borrowed', f.borrowedFrom, f.borrowedTo));
    add(range('Return date', f.dueFrom, f.dueTo));
  }
  return out;
}

const sortLabel = (entity, key) => ({ books: BOOKS, members: MEMBERS, transactions: TX }[entity].sort[key] || null);

module.exports = { describeFilters, sortLabel };
