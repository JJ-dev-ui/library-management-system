const Counter = require('../models/Counter');

// Atomically adds 1 to a named counter and returns the new number.
// $inc is done INSIDE MongoDB in one step, so two requests at the same moment can never get the
// same number. upsert: true creates the counter the first time it is used.
async function nextSeq(name) {
  const counter = await Counter.findByIdAndUpdate(name, { $inc: { seq: 1 } }, { new: true, upsert: true });
  return counter.seq;
}

// "TX-2026-000123" — numbering starts again every year
async function nextTransactionCode() {
  const year = new Date().getFullYear();
  const n = await nextSeq(`transaction-${year}`);
  return `TX-${year}-${String(n).padStart(6, '0')}`;
}

// "LIB-2026-0001"
async function nextMemberId() {
  const year = new Date().getFullYear();
  const n = await nextSeq(`member-${year}`);
  return `LIB-${year}-${String(n).padStart(4, '0')}`;
}

// "RQ-2026-000045" (borrow requests from the member portal)
async function nextRequestCode() {
  const year = new Date().getFullYear();
  const n = await nextSeq(`request-${year}`);
  return `RQ-${year}-${String(n).padStart(6, '0')}`;
}

module.exports = { nextSeq, nextTransactionCode, nextMemberId, nextRequestCode };
