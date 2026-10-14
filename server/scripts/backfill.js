// Run: npm run backfill
// Gives a transaction code (TX-YYYY-NNNNNN) to every loan that has none, and a member ID
// (LIB-YYYY-NNNN) to every user that has none, and renewCount: 0 to every transaction that has
// no extension count. For data created before these fields existed.
//
// SAFE TO RUN MANY TIMES (idempotent) and NON-destructive:
// - it never changes a code/ID that already exists, and never deletes anything
// - a 2nd run finds nothing to do and changes nothing
// - before numbering, each counter is raised ABOVE the highest number already in use,
//   so a new number can never duplicate an existing one
require('dotenv').config();
const mongoose = require('mongoose');
const Borrow = require('../models/Borrow');
const User = require('../models/User');
const Book = require('../models/Book');
const Counter = require('../models/Counter');
const { nextSeq } = require('../utils/counter');

// "Has no value" = the field is missing, null or an empty string
const MISSING = (field) => ({ $or: [{ [field]: { $exists: false } }, { [field]: null }, { [field]: '' }] });

// Reads existing values like "TX-2026-000123" and returns { 2026: 123, ... } (highest number per year)
async function highestPerYear(Model, field, regex) {
  const docs = await Model.find({ [field]: { $regex: regex } }).select(field).lean();
  const max = {};
  for (const d of docs) {
    const m = d[field].match(regex);
    const year = m[1];
    max[year] = Math.max(max[year] || 0, Number(m[2]));
  }
  return max;
}

// $max only ever RAISES a number: if the counter is already higher, nothing changes
async function raiseCounters(prefix, maxPerYear) {
  for (const [year, n] of Object.entries(maxPerYear)) {
    await Counter.updateOne({ _id: `${prefix}-${year}` }, { $max: { seq: n } }, { upsert: true });
  }
}

async function backfill({ Model, field, dateField, prefix, counterName, regex, pad, label }) {
  await raiseCounters(counterName, await highestPerYear(Model, field, regex));

  // Oldest first, so the numbers follow the real order (borrowedAt for loans, createdAt for users)
  const todo = await Model.find(MISSING(field)).sort({ [dateField]: 1, _id: 1 }).select(dateField).lean();
  let updated = 0;
  for (const doc of todo) {
    const year = new Date(doc[dateField] || Date.now()).getFullYear(); // the year it really happened
    const value = `${prefix}-${year}-${String(await nextSeq(`${counterName}-${year}`)).padStart(pad, '0')}`;
    // The filter repeats the "missing" condition: if the record got a value in the meantime, it is skipped
    const res = await Model.updateOne({ _id: doc._id, ...MISSING(field) }, { $set: { [field]: value } });
    updated += res.modifiedCount;
  }
  console.log(`${label}: ${updated} updated (${todo.length} were missing a ${field})`);
  return updated;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const loans = await backfill({
    Model: Borrow, field: 'code', dateField: 'borrowedAt', prefix: 'TX', counterName: 'transaction',
    regex: /^TX-(\d{4})-(\d+)$/, pad: 6, label: 'Transactions',
  });
  const users = await backfill({
    Model: User, field: 'memberId', dateField: 'createdAt', prefix: 'LIB', counterName: 'member',
    regex: /^LIB-(\d{4})-(\d+)$/, pad: 4, label: 'Users',
  });

  // Transactions saved before "renewCount" existed have no value, which the screens used to show as
  // "Extension NaN of 2". A missing (or null) value means "never extended", so it becomes 0.
  // The filter only matches missing/null values: a real count (1 or 2) is never touched.
  const renew = await Borrow.updateMany(
    { $or: [{ renewCount: { $exists: false } }, { renewCount: null }] },
    { $set: { renewCount: 0 } }
  );
  console.log(`Transactions: ${renew.modifiedCount} given renewCount 0 (times extended)`);

  // Books saved before the member feed existed have no feedRank (used to shuffle the Home feed):
  // each gets its own random number once. Books that already have one are never touched.
  const noRank = await Book.find({ feedRank: { $exists: false } }).select('_id').lean();
  if (noRank.length) {
    await Book.bulkWrite(noRank.map((b) => ({
      updateOne: { filter: { _id: b._id, feedRank: { $exists: false } }, update: { $set: { feedRank: Math.floor(Math.random() * 1000000) } } },
    })));
  }
  console.log(`Books: ${noRank.length} given a feedRank (Home feed order)`);

  const total = loans + users + renew.modifiedCount + noRank.length;
  console.log(total === 0 ? 'Nothing to do: every record already has its code/ID and extension count.' : 'Backfill finished.');
  process.exit(0);
})().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
