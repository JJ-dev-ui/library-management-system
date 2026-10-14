// Run: npm run seed
// Fills the database with realistic demo data:
//   - 1,000 books from server/data/books.json (made once by "npm run import-books"; no internet needed)
//   - 2 librarians + 30 members (Filipino names, PH mobile numbers, Metro Manila addresses)
//   - about 300 transactions over the last 90 days, the activity log and some login history
// DETERMINISTIC: all "random" choices come from a seeded generator (mulberry32 with a fixed seed),
// never Math.random, so every run produces the same data (relative to the day it is run).
// WARNING: deletes ALL users, photos, books, transactions, covers, logs and counters first.
// Only run it on your own dev database.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('./models/User');
const Book = require('./models/Book');
const BookCover = require('./models/BookCover');
const Borrow = require('./models/Borrow');
const Counter = require('./models/Counter');
const LoginActivity = require('./models/LoginActivity');
const ActivityLog = require('./models/ActivityLog');
const UserAvatar = require('./models/UserAvatar');
const BorrowRequest = require('./models/BorrowRequest');
const Bookmark = require('./models/Bookmark');
const Notification = require('./models/Notification');
const { addDaysEndOfDay, deriveStatus } = require('./utils/transactionStatus');
const { notifyRequest, refreshReminders } = require('./utils/notifications');

const BOOKS_FILE = path.join(__dirname, 'data', 'books.json');
const DAY_MS = 24 * 60 * 60 * 1000;
const HISTORY_DAYS = 90;      // transactions are spread over the last 90 days
const TARGET_LOANS = 300;     // roughly how many transactions to create
const MAX_ACTIVE = 5;         // same rule as the API: max 5 books per member at a time
const LOAN_DAYS = 14;
const EXTEND_DAYS = 7;
const DEMO_EMAIL = 'member@gmail.com'; // the demo member account (known state for the member portal)
const REQUEST_DAYS = 3;                // a pending request expires at the end of the 3rd day

// ---------------------------------------------------------------------------
// Seeded pseudo-random numbers. mulberry32 turns a number (the seed) into an endless,
// repeatable sequence of numbers between 0 and 1. Same seed -> same sequence -> same data.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20261013);
const int = (min, max) => min + Math.floor(rand() * (max - min + 1)); // whole number min..max
const chance = (p) => rand() < p;
// Picks one item; heavier weights are picked more often
function weighted(items, weightOf) {
  const total = items.reduce((s, x) => s + weightOf(x), 0);
  let r = rand() * total;
  for (const x of items) { r -= weightOf(x); if (r <= 0) return x; }
  return items[items.length - 1];
}

// ---------------------------------------------------------------------------
// Time helpers. The library is in Manila (UTC+8, no daylight saving time).
// "daysAgo" counts calendar days in Manila: 0 = today, 1 = yesterday, ...
// ---------------------------------------------------------------------------
const MANILA_MS = 8 * 60 * 60 * 1000;
const NOW = new Date();
const manilaNow = new Date(NOW.getTime() + MANILA_MS); // its UTC fields = Manila's clock
function manilaTime(daysAgo, hour, minute = 0) {
  const t = Date.UTC(manilaNow.getUTCFullYear(), manilaNow.getUTCMonth(), manilaNow.getUTCDate() - daysAgo, hour, minute);
  return new Date(Math.min(t - MANILA_MS, NOW.getTime() - 60 * 1000)); // never in the future
}
const manilaWeekday = (daysAgo) => new Date(manilaTime(daysAgo, 12).getTime() + MANILA_MS).getUTCDay(); // 0 = Sunday
// A moment during library hours (8:00 AM – 6:00 PM) on that day
// (Seeding before 8 AM: "today" has no library hours yet, so those borrowings move to yesterday.)
const OPEN_YET = manilaNow.getUTCHours() >= 8;
const libraryTime = (daysAgo) => manilaTime(daysAgo === 0 && !OPEN_YET ? 1 : daysAgo, int(8, 17), int(0, 59));
// Which Manila day (as "days ago") a Date falls on
const daysAgoOf = (date) => {
  const day = (d) => Math.floor((d.getTime() + MANILA_MS) / DAY_MS);
  return day(NOW) - day(date);
};
// A library-hours moment somewhere between two Dates (kept inside the window)
function libraryTimeBetween(lo, hi) {
  if (hi <= lo) return lo;
  const t = libraryTime(int(daysAgoOf(hi), daysAgoOf(lo)));
  return new Date(Math.min(hi.getTime(), Math.max(lo.getTime(), t.getTime())));
}

// ---------------------------------------------------------------------------
// Catalog helpers (unchanged: copies and shelves depend only on the ISBN)
// ---------------------------------------------------------------------------
const SHELF_CODES = {
  Programming: 'PRG', 'Computer Science': 'CSC', Fiction: 'FIC', 'Filipino Literature': 'FIL',
  'Classic Literature': 'CLS', History: 'HIS', Science: 'SCI', Mathematics: 'MTH',
  Business: 'BUS', 'Self-Help': 'SLF', Philosophy: 'PHI', 'Young Adult': 'YAD',
};
function stableNumber(text) {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) % 1000003;
  return h % 1000;
}
function copiesFor(isbn) {
  const n = stableNumber(isbn) % 100;
  if (n < 30) return 1;
  if (n < 55) return 2;
  if (n < 73) return 3;
  if (n < 83) return 4;
  if (n < 90) return 5;
  return 6 + (stableNumber(`${isbn}x`) % 5);
}
function shelfFor(book) {
  const n = stableNumber(book.isbn);
  const code = SHELF_CODES[book.category] || 'GEN';
  return `${code}-${'ABCDEF'[n % 6]}${1 + (Math.floor(n / 6) % 9)}`;
}

// Some categories are borrowed more than others
const CATEGORY_POPULARITY = {
  Fiction: 1.7, 'Young Adult': 1.5, Programming: 1.4, 'Self-Help': 1.3, 'Filipino Literature': 1.2,
  'Computer Science': 1.1, History: 1.0, Business: 1.0, 'Classic Literature': 0.9, Science: 0.8,
  Mathematics: 0.7, Philosophy: 0.6,
};

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
const EXTRA_MEMBERS = [
  'Andrea Reyes', 'Mark Bautista', 'Patricia Garcia', 'Joshua Mendoza', 'Kristine Santiago', 'Christian Villanueva',
  'Camille Ramos', 'Paolo Aquino', 'Bea Castillo', 'Miguel Flores', 'Angelica Torres', 'Carlo Gonzales',
  'Nicole Navarro', 'Jerome Domingo', 'Erika Salazar', 'Rafael Mercado', 'Janelle Lim', 'Adrian Tan',
  'Sofia Dizon', 'Gabriel Pascual', 'Bianca Cruz', 'Nathaniel Ocampo', 'Trisha Valdez', 'Kenneth Agustin',
  'Alyssa Manalo', 'Vincent Lopez',
];
const DEACTIVATED_EXTRA = new Set(['Jerome Domingo', 'Trisha Valdez', 'Vincent Lopez']);
// Five accounts for the class presentation (see the summary printed at the end)
const PRESENTATION_MEMBERS = [
  { name: 'Lara Villareal', email: 'user1@gmail.com', joined: 3, clean: true, contactNumber: '09171110001', address: '15 Coral Way, Pasay City' },
  { name: 'Ramon Delos Reyes', email: 'user2@gmail.com', joined: 160, contactNumber: '09171110002', address: '42 Taft Ave, Manila' },
  { name: 'Isabel Cruz', email: 'user3@gmail.com', joined: 140, contactNumber: '09171110003', address: '8 Shaw Blvd, Mandaluyong City' },
  { name: 'Daniel Ong', email: 'user4@gmail.com', joined: 120, contactNumber: '09171110004', address: '230 Katipunan Ave, Quezon City' },
  { name: 'Hannah Javier', email: 'user5@gmail.com', joined: 100, contactNumber: '09171110005', address: '77 Roxas Blvd, Parañaque City' },
];
const STREETS = ['Taft Ave', 'Roxas Blvd', 'EDSA', 'Shaw Blvd', 'Aurora Blvd', 'Katipunan Ave', 'Ortigas Ave',
  'Quezon Ave', 'España Blvd', 'Commonwealth Ave', 'Gil Puyat Ave', 'Macapagal Blvd'];
const CITIES = ['Pasay City', 'Manila', 'Makati City', 'Quezon City', 'Taguig City', 'Pasig City',
  'Mandaluyong City', 'Parañaque City', 'San Juan City', 'Caloocan City'];
const DEVICES = ['Chrome on Windows', 'Safari on iOS', 'Chrome on Android', 'Edge on Windows', 'Firefox on Windows', 'Safari on macOS'];

const phPhone = () => `09${String(int(100000000, 999999999))}`;
const address = () => `${int(1, 250)} ${STREETS[int(0, STREETS.length - 1)]}, ${CITIES[int(0, CITIES.length - 1)]}`;
const emailOf = (name) => `${name.toLowerCase().replace(/\s+/g, '.')}@gmail.com`;

(async () => {
  if (!fs.existsSync(BOOKS_FILE)) {
    console.error('server/data/books.json not found. Run "npm run import-books" first (one time only).');
    process.exit(1);
  }
  const catalog = JSON.parse(fs.readFileSync(BOOKS_FILE, 'utf8'));

  await mongoose.connect(process.env.MONGO_URI);
  // Wipe everything (counters too, so member IDs and transaction codes start again at 1)
  await Promise.all([User, UserAvatar, Book, BookCover, Borrow, Counter, LoginActivity, ActivityLog, BorrowRequest, Bookmark, Notification]
    .map((M) => M.deleteMany({})));

  // ===== 1. Users =====
  // The plan lists everyone with the day they joined. Accounts are created in that order, so
  // the member IDs (LIB-YYYY-0001, 0002, ...) from the Counter follow the joining order.
  const plan = [
    { name: 'Head Librarian', email: 'admin@gmail.com', password: 'admin123', role: 'admin', joined: 180,
      contactNumber: '09171234567', address: 'NU MOA Library, Coral Way, Pasay City' },
    { name: 'Demo Member', email: 'member@gmail.com', password: 'member123', joined: 178,
      contactNumber: '09181112222', address: 'Blk 4 Lot 12, Mall of Asia Complex, Pasay City', weight: 3 },
    { name: 'Juan Dela Cruz', email: 'juan@gmail.com', password: 'member123', joined: 176,
      contactNumber: '+639209876543', address: '27 Roxas Blvd, Baclaran, Parañaque City', notes: 'Often returns books late. Remind by text.', weight: 3 },
    { name: 'Maria Santos', email: 'maria@gmail.com', password: 'member123', isActive: false, joined: 170,
      contactNumber: '09351239876', address: '88 Aurora Blvd, Quezon City', notes: 'Deactivated: graduated in 2025.' },
    { name: 'Assistant Librarian', email: 'librarian2@gmail.com', password: 'admin123', role: 'admin', joined: 150,
      contactNumber: '09175550123', address: 'NU MOA Library, Coral Way, Pasay City' },
  ];
  // Presentation accounts (password member123):
  //   user1 = a CLEAN member: joined a few days ago, no transactions, requests, bookmarks,
  //           notifications or login history (shows the empty states and the first request)
  //   user2–user5 = normal members with random history like everyone else
  PRESENTATION_MEMBERS.forEach((p) => {
    plan.push({
      name: p.name, email: p.email, password: 'member123', joined: p.joined, clean: !!p.clean,
      contactNumber: p.contactNumber, address: p.address,
    });
  });
  EXTRA_MEMBERS.forEach((name, i) => {
    plan.push({
      name, email: emailOf(name), password: 'member123', isActive: !DEACTIVATED_EXTRA.has(name),
      // spread over the last 6 months, the newest ones joined in the last few days
      joined: Math.max(1, Math.round(172 - (i * 171) / (EXTRA_MEMBERS.length - 1)) - int(0, 2)),
      contactNumber: phPhone(), address: address(),
    });
  });
  plan.sort((a, b) => b.joined - a.joined); // oldest first

  const users = [];
  for (const p of plan) {
    // User.create runs the pre-save hooks: bcrypt hashes the password and the Counter gives the member ID
    const user = await User.create({
      name: p.name, email: p.email, password: p.password, role: p.role || 'member',
      isActive: p.isActive !== false, contactNumber: p.contactNumber, address: p.address, notes: p.notes || '',
    });
    const createdAt = libraryTime(p.joined);
    // timestamps would set "now", so the real joining date is written directly
    await User.collection.updateOne({ _id: user._id }, { $set: { createdAt, updatedAt: createdAt } });
    users.push({ doc: user, createdAt, weight: p.weight || 1, clean: !!p.clean });
  }
  const librarians = users.filter((u) => u.doc.role === 'admin');
  const members = users.filter((u) => u.doc.role === 'member');

  // ===== 2. Books =====
  // When each title was added to the library (Book.createdAt = "Date added"): about 8 in the last
  // 7 days, about 17 more in the last 30 days, the rest spread over the last 6 months. The order is
  // a seeded shuffle (Fisher–Yates with our generator), so it is the same on every run.
  const order = catalog.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = int(0, i); [order[i], order[j]] = [order[j], order[i]]; }
  const addedDaysAgo = new Array(catalog.length);
  order.forEach((bookIndex, k) => { addedDaysAgo[bookIndex] = k < 8 ? int(0, 6) : k < 25 ? int(7, 29) : int(30, 180); });

  const docs = catalog.map((b) => {
    const copies = copiesFor(b.isbn);
    return {
      ...b, shelfLocation: shelfFor(b), totalCopies: copies, availableCopies: copies, timesBorrowed: 0,
      feedRank: int(0, 999999), // shuffles the member Home feed (see models/Book.js)
    };
  });
  const books = await Book.insertMany(docs);
  // timestamps would set "now", so the real "date added" is written directly (like the users above)
  const addedAt = new Map(books.map((b, i) => [b, libraryTime(addedDaysAgo[i])]));
  await Book.collection.bulkWrite(books.map((b) => ({
    updateOne: { filter: { _id: b._id }, update: { $set: { createdAt: addedAt.get(b), updatedAt: addedAt.get(b) } } },
  })));
  // About 20 titles are "favourites" and get picked much more often (they top "Most borrowed")
  const bookWeight = (b) => (CATEGORY_POPULARITY[b.category] || 1) * (stableNumber(b.isbn) % 50 === 0 ? 30 : 1);

  // ===== 3. Transactions, simulated day by day =====
  // How many on each day: more on weekdays, fewer on Saturday, very few on Sunday,
  // and slowly growing over the 90 days (the library is getting busier).
  const dayWeight = (d) => {
    const wd = manilaWeekday(d);
    const week = wd === 0 ? 0.25 : wd === 6 ? 0.55 : 1;
    const trend = 0.7 + 0.6 * ((HISTORY_DAYS - 1 - d) / (HISTORY_DAYS - 1)); // 0.7 (oldest) -> 1.3 (today)
    return week * trend;
  };
  const days = Array.from({ length: HISTORY_DAYS }, (_, i) => HISTORY_DAYS - 1 - i); // 89 days ago ... today
  const totalWeight = days.reduce((s, d) => s + dayWeight(d), 0);

  // Every loan is an interval [borrowedAt, returnedAt). Business rules are checked against the
  // loans that are OUT at the moment of each new borrowing, so they hold at every point in time.
  const loans = [];
  const isOut = (l, t) => l.borrowedAt <= t && (!l.returnedAt || l.returnedAt > t);
  let skipped = 0;

  for (const d of days) {
    const count = Math.floor((TARGET_LOANS * dayWeight(d)) / totalWeight + rand()); // expected value + random rounding
    const times = Array.from({ length: count }, () => libraryTime(d)).sort((a, b) => a - b);
    for (const borrowedAt of times) {
      const out = loans.filter((l) => isOut(l, borrowedAt));
      // Try a few member/book combinations until one respects every rule
      let made = false;
      for (let attempt = 0; attempt < 12 && !made; attempt++) {
        // (clean = the presentation account user1: it never borrows anything)
        const member = weighted(members.filter((m) => !m.clean && m.createdAt < borrowedAt), (m) => m.weight);
        const book = weighted(books, bookWeight);
        if (!member) break;
        if (addedAt.get(book) >= borrowedAt) continue;                     // not in the library yet
        const memberOut = out.filter((l) => l.member === member);
        if (memberOut.length >= MAX_ACTIVE) continue;                       // max 5 at a time
        if (memberOut.some((l) => l.book === book)) continue;               // no 2nd copy of the same book
        if (out.filter((l) => l.book === book).length >= book.totalCopies) continue; // never more out than owned

        // Extensions: most loans are never extended
        const renewCount = chance(0.8) ? 0 : chance(0.75) ? 1 : 2;
        let dueDate = addDaysEndOfDay(borrowedAt, LOAN_DAYS);
        const extensions = [];
        for (let r = 0; r < renewCount; r++) {
          const from = dueDate;
          dueDate = addDaysEndOfDay(dueDate, EXTEND_DAYS);
          extensions.push({ from, to: dueDate });
        }
        const dueDaysAgo = d - LOAN_DAYS - EXTEND_DAYS * renewCount; // negative = return date in the future

        // Was it returned? Deactivated members have returned everything. Older than 12 days past the
        // return date -> always returned. Otherwise about 60% are returned, the rest are still out
        // (on time, due soon, or 1–12 days late).
        // The demo member (member@gmail.com) must have NO late books, so everything of theirs whose
        // return date has passed was returned (on time or late).
        const mustReturn = !member.doc.isActive || dueDaysAgo > 12 || (member.doc.email === DEMO_EMAIL && dueDate < NOW);
        let returnedAt = null;
        if (d > 0 && (mustReturn || chance(0.6))) {
          const late = dueDaysAgo >= 1 && chance(0.28); // about 20% of all returns end up late (only possible once the date has passed)
          const retDay = late
            ? int(Math.max(0, dueDaysAgo - 10), dueDaysAgo - 1)   // 1–10 days after the return date
            : int(Math.max(0, dueDaysAgo), d - 1);               // between the next day and the return date
          returnedAt = libraryTime(retDay);
          if (returnedAt <= borrowedAt) returnedAt = new Date(borrowedAt.getTime() + 2 * 60 * 60 * 1000);
          if (returnedAt > NOW) returnedAt = new Date(NOW.getTime() - 60 * 1000);
        }
        // A member who still has a book must be active (a deactivated member's book borrowed today
        // cannot be returned yet, so that combination is skipped)
        if (!returnedAt && !member.doc.isActive) continue;

        loans.push({
          member, book, borrowedAt, dueDate, returnedAt, renewCount, extensions,
          processedBy: librarians[int(0, librarians.length - 1)].doc,
        });
        made = true;
      }
      if (!made) skipped++;
    }
  }

  // ===== 3b. Demo accounts with a known state (for the member portal demo) =====
  // member@gmail.com: no late books, 2–3 borrowed books, one of them due soon.
  // juan@gmail.com:   at least one late book.
  const demo = members.find((m) => m.doc.email === DEMO_EMAIL);
  const juan = members.find((m) => m.doc.email === 'juan@gmail.com');
  const outNow = (m) => loans.filter((l) => l.member === m && !l.returnedAt);
  const isDueSoon = (l) => deriveStatus({ status: 'borrowed', dueDate: l.dueDate }, NOW) === 'due_soon';
  const isLateNow = (l) => !l.returnedAt && l.dueDate < NOW;

  // Would a NEW, still-open loan (member, book, from `at` until now) break any rule at any moment?
  // It is checked at `at` and at every later borrowing (the only moments the counts go up).
  function fitsOpenLoan(member, book, at) {
    if (addedAt.get(book) >= at || at < member.createdAt) return false;
    const moments = [at, ...loans.filter((l) => l.borrowedAt > at).map((l) => l.borrowedAt)];
    return moments.every((t) => {
      const out = loans.filter((l) => isOut(l, t));
      return out.filter((l) => l.book === book).length < book.totalCopies
        && out.filter((l) => l.member === member).length < MAX_ACTIVE
        && !out.some((l) => l.member === member && l.book === book);
    });
  }
  // Adds one open loan for the member, borrowed `daysAgo` days ago (tries up to 300 books)
  function addOpenLoan(member, daysAgo) {
    const at = libraryTime(daysAgo);
    for (let i = 0; i < 300; i++) {
      const book = weighted(books, bookWeight);
      if (!fitsOpenLoan(member, book, at)) continue;
      const loan = {
        member, book, borrowedAt: at, dueDate: addDaysEndOfDay(at, LOAN_DAYS), returnedAt: null,
        renewCount: 0, extensions: [], processedBy: librarians[int(0, librarians.length - 1)].doc,
      };
      loans.push(loan);
      return loan;
    }
    return null;
  }
  // Borrowed 12 days ago -> the return date is in 2 days ("Due soon")
  if (!outNow(demo).some(isDueSoon)) addOpenLoan(demo, 12);
  while (outNow(demo).length < 2) if (!addOpenLoan(demo, int(1, 5))) break;
  // More than 3 out: the extra ones are returned (returning earlier can never break a rule)
  while (outNow(demo).length > 3) {
    const extra = outNow(demo).filter((l) => !isDueSoon(l)).sort((a, b) => a.borrowedAt - b.borrowedAt)[0];
    if (!extra) break;
    extra.returnedAt = libraryTimeBetween(new Date(extra.borrowedAt.getTime() + 2 * 60 * 60 * 1000), new Date(NOW.getTime() - 60 * 1000));
  }
  // Juan: borrowed 16–24 days ago and not returned = 2–10 days late
  for (let tries = 0; tries < 9 && !loans.some((l) => l.member === juan && isLateNow(l)); tries++) addOpenLoan(juan, 16 + tries);
  if (!loans.some((l) => l.member === juan && isLateNow(l))) console.warn('Note: could not give juan@gmail.com a late book.');

  loans.sort((a, b) => a.borrowedAt - b.borrowedAt);

  // Transaction codes in borrowedAt order, numbered per year (TX-2026-000001, ...).
  // The Counter normally hands out one number per request; here all numbers are given at once and
  // the Counter is set to the last one, so new transactions made in the app continue from there.
  const perYear = {};
  const borrowDocs = loans.map((l) => {
    const year = l.borrowedAt.getFullYear();
    perYear[year] = (perYear[year] || 0) + 1;
    l.code = `TX-${year}-${String(perYear[year]).padStart(6, '0')}`;
    return {
      code: l.code, user: l.member.doc._id, book: l.book._id, borrowedAt: l.borrowedAt, dueDate: l.dueDate,
      returnedAt: l.returnedAt, status: l.returnedAt ? 'returned' : 'borrowed', renewCount: l.renewCount,
      processedBy: l.processedBy._id,
    };
  });
  const saved = await Borrow.insertMany(borrowDocs);
  saved.forEach((s, i) => { loans[i].id = s._id; });
  await Promise.all(Object.entries(perYear).map(([year, n]) =>
    Counter.updateOne({ _id: `transaction-${year}` }, { $max: { seq: n } }, { upsert: true })));

  // ===== 4. Make every book consistent with its transactions =====
  const stats = new Map(books.map((b) => [String(b._id), { out: 0, total: 0 }]));
  for (const l of loans) {
    const s = stats.get(String(l.book._id));
    s.total += 1;
    if (!l.returnedAt) s.out += 1;
  }
  await Book.bulkWrite(books.map((b) => {
    const s = stats.get(String(b._id));
    return { updateOne: { filter: { _id: b._id }, update: { $set: { availableCopies: b.totalCopies - s.out, timesBorrowed: s.total } } } };
  }));

  // ===== 5. Activity log (matches the history above) =====
  const activity = [];
  for (const u of members) {
    activity.push({ type: 'member_registered', actor: u.doc._id, member: u.doc._id, meta: { memberName: u.doc.name }, createdAt: u.createdAt });
  }
  for (const l of loans) {
    const base = { member: l.member.doc._id, book: l.book._id, transaction: l.id };
    const snap = { code: l.code, bookTitle: l.book.title, memberName: l.member.doc.name };
    activity.push({ ...base, type: 'book_borrowed', actor: l.processedBy._id, meta: snap, createdAt: l.borrowedAt });
    l.extensions.forEach((x) => {
      // Extended during library hours, at least a day after borrowing and before the old return date
      // (and never in the future)
      const at = libraryTimeBetween(
        new Date(l.borrowedAt.getTime() + DAY_MS),
        new Date(Math.min(x.from.getTime() - 60 * 60 * 1000, NOW.getTime() - 60 * 1000))
      );
      if (l.returnedAt && at >= l.returnedAt) return; // (a book returned early by step 3b: no extension after it)
      activity.push({ ...base, type: 'borrow_extended', actor: l.processedBy._id, meta: { ...snap, from: x.from, to: x.to }, createdAt: at });
    });
    if (l.returnedAt) {
      activity.push({ ...base, type: 'book_returned', actor: librarians[int(0, librarians.length - 1)].doc._id, meta: { ...snap, late: l.returnedAt > l.dueDate }, createdAt: l.returnedAt });
    }
  }
  // Raw insert: keeps our createdAt values exactly as given
  await ActivityLog.collection.insertMany(activity);

  // ===== 6. Login history: a few logins per active account in the last 30 days =====
  const logins = [];
  for (const u of users.filter((x) => x.doc.isActive && !x.clean)) { // the clean account has never logged in
    const device = DEVICES[int(0, DEVICES.length - 1)];
    const ip = `112.198.${int(1, 254)}.${int(1, 254)}`;
    const n = int(2, 5);
    let last = null;
    for (let i = 0; i < n; i++) {
      const at = manilaTime(int(0, 29), int(7, 21), int(0, 59));
      if (at < u.createdAt) continue;
      logins.push({ user: u.doc._id, ip, device, userAgent: '', createdAt: at });
      if (!last || at > last) last = at;
    }
    if (last) await User.collection.updateOne({ _id: u.doc._id }, { $set: { lastLoginAt: last, lastLoginIp: ip, lastLoginDevice: device } });
  }
  if (logins.length) await LoginActivity.collection.insertMany(logins);

  // ===== 7. Borrow requests (member portal) =====
  // The clean presentation account gets no requests, bookmarks or notifications either
  const activeMembers = members.filter((m) => m.doc.isActive && !m.clean);
  const outByBook = new Map(books.map((b) => [b, 0]));
  loans.filter((l) => !l.returnedAt).forEach((l) => outByBook.set(l.book, outByBook.get(l.book) + 1));
  const availableNow = (b) => b.totalCopies - outByBook.get(b);
  const lateMember = (m) => loans.some((l) => l.member === m && isLateNow(l));
  const borrowingNow = (m, b) => loans.some((l) => l.member === m && l.book === b && !l.returnedAt);
  const after = (...dates) => new Date(Math.max(...dates.map((d) => d.getTime())) + 60 * 1000);
  const hours = (n) => n * 60 * 60 * 1000;
  const requests = [];
  const pendingOf = (m) => requests.filter((r) => r.member === m && r.status === 'pending');

  // Approved (~12): each one is a real transaction above. Requested 1–30 hours before it was lent,
  // approved at the moment of lending by the librarian who lent it.
  const recentLoans = loans.filter((l) => l.borrowedAt > new Date(NOW.getTime() - 60 * DAY_MS) && l.member.doc.isActive);
  const approvedLoans = [
    outNow(demo).sort((a, b) => b.borrowedAt - a.borrowedAt)[0],                                   // demo: a current book
    recentLoans.filter((l) => l.member === demo && l.returnedAt).sort((a, b) => b.borrowedAt - a.borrowedAt)[0], // demo: a returned one
  ].filter(Boolean);
  for (let i = 0; approvedLoans.length < 12 && i < 500; i++) {
    const l = recentLoans[int(0, recentLoans.length - 1)];
    if (l && !approvedLoans.includes(l)) approvedLoans.push(l);
  }
  for (const l of approvedLoans) {
    let requestedAt = new Date(l.borrowedAt.getTime() - hours(int(1, 30)));
    requestedAt = new Date(Math.max(requestedAt.getTime(), after(l.member.createdAt, addedAt.get(l.book)).getTime()));
    if (requestedAt >= l.borrowedAt) requestedAt = new Date(l.borrowedAt.getTime() - 30 * 60 * 1000);
    requests.push({ member: l.member, book: l.book, status: 'approved', requestedAt, decidedAt: l.borrowedAt, decidedBy: l.processedBy._id, loan: l });
  }

  // Pending (~6, none expired): requested in the last 2 days by active members WITHOUT late books,
  // for an available book they are not borrowing, and only while borrowed + pending < 5
  const addPending = (m) => {
    for (let i = 0; i < 300; i++) {
      const b = weighted(books, bookWeight);
      const requestedAt = libraryTime(int(0, 2));
      if (availableNow(b) <= 0 || borrowingNow(m, b) || pendingOf(m).some((r) => r.book === b)) continue;
      if (addedAt.get(b) >= requestedAt || m.createdAt >= requestedAt) continue;
      requests.push({ member: m, book: b, status: 'pending', requestedAt });
      return true;
    }
    return false;
  };
  const canAddPending = (m) => !lateMember(m) && outNow(m).length + pendingOf(m).length < MAX_ACTIVE;
  addPending(demo);
  for (let i = 0; i < 200 && requests.filter((r) => r.status === 'pending').length < 6; i++) {
    const m = activeMembers[int(0, activeMembers.length - 1)];
    if (m !== demo && canAddPending(m)) addPending(m);
  }

  // Denied (~5), cancelled (~4), expired (~3): older history (they never held a copy)
  const NOTES = [
    'All copies are reserved for the Grade 12 research class this week.',
    'This copy is being repaired. Please request it again next week.',
    'Reference copy only — you can read it inside the library.',
    'Please return your late book first, then request again.',
  ];
  const addPast = (m, status, daysAgo, extra = {}) => {
    for (let i = 0; i < 100; i++) {
      const b = weighted(books, bookWeight);
      const requestedAt = libraryTime(daysAgo);
      if (addedAt.get(b) >= requestedAt || m.createdAt >= requestedAt) continue;
      const expiresAt = addDaysEndOfDay(requestedAt, REQUEST_DAYS);
      const decidedAt = status === 'expired' ? expiresAt
        : new Date(Math.min(requestedAt.getTime() + hours(int(1, 20)), expiresAt.getTime(), NOW.getTime() - 60 * 1000));
      const decidedBy = status === 'cancelled' ? m.doc._id : status === 'denied' ? librarians[int(0, librarians.length - 1)].doc._id : null;
      requests.push({ member: m, book: b, status, requestedAt, decidedAt, decidedBy, ...extra });
      return;
    }
  };
  const others = activeMembers.filter((m) => m !== demo); // the demo member's history is set separately
  const someone = () => others[int(0, others.length - 1)];
  addPast(demo, 'denied', 1, { note: NOTES[0] });              // recent, so its notification is still unread
  for (let i = 0; i < 4; i++) addPast(someone(), 'denied', int(3, 55), { note: i < 3 ? NOTES[(i + 1) % NOTES.length] : '' });
  for (let i = 0; i < 4; i++) addPast(someone(), 'cancelled', int(2, 55));
  addPast(demo, 'expired', int(6, 12));
  for (let i = 0; i < 2; i++) addPast(someone(), 'expired', int(6, 55));

  // Request codes in requestedAt order (RQ-2026-000001, ...); the Counter continues from the last one
  requests.sort((a, b) => a.requestedAt - b.requestedAt);
  const rqPerYear = {};
  const requestDocs = requests.map((r) => {
    const year = r.requestedAt.getFullYear();
    rqPerYear[year] = (rqPerYear[year] || 0) + 1;
    r.code = `RQ-${year}-${String(rqPerYear[year]).padStart(6, '0')}`;
    r._id = new mongoose.Types.ObjectId();
    return {
      _id: r._id, code: r.code, user: r.member.doc._id, book: r.book._id, status: r.status, note: r.note || '',
      requestedAt: r.requestedAt, expiresAt: addDaysEndOfDay(r.requestedAt, REQUEST_DAYS),
      decidedAt: r.decidedAt || null, decidedBy: r.decidedBy || null, transaction: r.loan ? r.loan.id : null,
      createdAt: r.requestedAt, updatedAt: r.decidedAt || r.requestedAt,
    };
  });
  // Raw insert: keeps our dates exactly as given
  if (requestDocs.length) await BorrowRequest.collection.insertMany(requestDocs);
  await Promise.all(Object.entries(rqPerYear).map(([year, n]) =>
    Counter.updateOne({ _id: `request-${year}` }, { $max: { seq: n } }, { upsert: true })));

  // Activity log rows for the requests
  const requestActivity = [];
  for (const r of requests) {
    const base = { member: r.member.doc._id, book: r.book._id, meta: { code: r.code, bookTitle: r.book.title, memberName: r.member.doc.name } };
    requestActivity.push({ ...base, type: 'request_created', actor: r.member.doc._id, createdAt: r.requestedAt });
    if (r.status === 'approved') requestActivity.push({ ...base, type: 'request_approved', actor: r.decidedBy, transaction: r.loan.id, createdAt: r.decidedAt });
    if (r.status === 'denied') requestActivity.push({ ...base, type: 'request_denied', actor: r.decidedBy, meta: { ...base.meta, note: r.note || '' }, createdAt: r.decidedAt });
    if (r.status === 'cancelled') requestActivity.push({ ...base, type: 'request_cancelled', actor: r.member.doc._id, createdAt: r.decidedAt });
    if (r.status === 'expired') requestActivity.push({ ...base, type: 'request_expired', actor: r.member.doc._id, createdAt: r.decidedAt });
  }
  if (requestActivity.length) await ActivityLog.collection.insertMany(requestActivity);

  // ===== 8. Notifications (the same helper the API uses, so texts and dedupe keys match) =====
  // Request events: read when older than 3 days, unread when recent
  for (const r of requests.filter((x) => x.status !== 'pending')) {
    const type = `request_${r.status}`;
    const old = NOW - r.decidedAt > 3 * DAY_MS;
    await notifyRequest(type, { _id: r._id, user: r.member.doc._id }, r.book, {
      note: r.note, dueDate: r.loan?.dueDate, transaction: r.loan?.id, createdAt: r.decidedAt,
      readAt: old || r.status === 'cancelled' ? new Date(r.decidedAt.getTime() + DAY_MS) : null,
    });
  }
  // Return-soon / late reminders and this week's "new books" digest for every active member
  for (const m of activeMembers) await refreshReminders(m.doc._id, NOW);

  // ===== 9. Bookmarks: about 8 for the demo member, 0–12 for the other active members =====
  const bookmarks = [];
  for (const m of activeMembers) {
    const n = m === demo ? 8 : int(0, 12);
    const chosen = new Set();
    for (let i = 0; i < 100 && chosen.size < n; i++) chosen.add(books[int(0, books.length - 1)]);
    for (const b of chosen) {
      const from = after(m.createdAt, addedAt.get(b));
      if (from >= NOW) continue;
      bookmarks.push({ user: m.doc._id, book: b._id, createdAt: libraryTimeBetween(from, new Date(NOW.getTime() - 60 * 1000)) });
    }
  }
  if (bookmarks.length) await Bookmark.collection.insertMany(bookmarks);

  // ===== Summary =====
  const byStatus = {};
  for (const l of loans) {
    const s = deriveStatus({ status: l.returnedAt ? 'returned' : 'borrowed', returnedAt: l.returnedAt, dueDate: l.dueDate }, NOW);
    byStatus[s] = (byStatus[s] || 0) + 1;
  }
  const totalCopies = docs.reduce((sum, b) => sum + b.totalCopies, 0);
  console.log('Seed finished:');
  console.log(`  Users:        ${users.length} (${librarians.length} librarians, ${members.length} members, ${users.filter((u) => !u.doc.isActive).length} deactivated)`);
  console.log(`  Books:        ${books.length} titles, ${totalCopies} copies`);
  console.log(`  Transactions: ${loans.length} over ${HISTORY_DAYS} days (${skipped} skipped by the rules)`);
  console.log(`                ${Object.entries(byStatus).map(([k, v]) => `${k}: ${v}`).join(', ')}`);
  console.log(`  Activity log: ${activity.length + requestActivity.length} rows · Logins: ${logins.length} rows`);
  const reqCount = (s) => requests.filter((r) => r.status === s).length;
  console.log(`  Requests:     ${requests.length} (pending ${reqCount('pending')}, approved ${reqCount('approved')}, denied ${reqCount('denied')}, cancelled ${reqCount('cancelled')}, expired ${reqCount('expired')})`);
  const notificationCount = await Notification.countDocuments();
  console.log(`  Bookmarks:    ${bookmarks.length} · Notifications: ${notificationCount}`);
  const addedRecently = (days) => books.filter((b) => NOW - addedAt.get(b) <= days * DAY_MS).length;
  console.log(`  New books:    ${addedRecently(7)} added in the last 7 days, ${addedRecently(30)} in the last 30 days`);
  const demoOut = outNow(demo);
  console.log(`  Demo member:  ${demoOut.length} borrowed (${demoOut.filter(isDueSoon).length} due soon, ${demoOut.filter(isLateNow).length} late), `
    + `${pendingOf(demo).length} pending request, ${bookmarks.filter((b) => b.user.equals(demo.doc._id)).length} bookmarks, `
    + `${await Notification.countDocuments({ user: demo.doc._id })} notifications`);
  console.log(`  Juan:         ${loans.filter((l) => l.member === juan && isLateNow(l)).length} late book(s)`);
  console.log('Admin:  admin@gmail.com / admin123   (also librarian2@gmail.com / admin123)');
  console.log('Member: member@gmail.com / member123  (juan@gmail.com and the other members also use member123; maria@gmail.com is deactivated)');
  console.log('Presentation: user1@gmail.com (clean, no history) and user2@gmail.com … user5@gmail.com, all with password member123');
  for (const p of PRESENTATION_MEMBERS) {
    const m = members.find((x) => x.doc.email === p.email);
    const mine = loans.filter((l) => l.member === m);
    console.log(`  ${p.email.padEnd(16)} ${p.name.padEnd(18)} transactions: ${mine.length}, borrowed now: ${mine.filter((l) => !l.returnedAt).length}, late: ${mine.filter(isLateNow).length}`);
  }
  process.exit(0);
})().catch((err) => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
