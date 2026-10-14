const mongoose = require('mongoose');

// One document = one loan ("transaction" in the UI): which member borrowed which book, and when it is due.
// The model/collection keeps its original name (Borrow) so existing data keeps working.
const borrowSchema = new mongoose.Schema(
  {
    // Human-readable ID shown in the UI, e.g. TX-2026-000123 (made by utils/counter.js).
    // sparse: older loans without a code do not break the unique index.
    code: { type: String, unique: true, sparse: true, trim: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    borrowedAt: { type: Date, default: Date.now },
    dueDate: { type: Date, required: true },
    returnedAt: { type: Date, default: null },
    // Only 2 values are STORED. "Active", "Due soon", "Overdue", "Returned on time/late" are
    // calculated from the dates (see utils/transactionStatus.js), so they are always up to date.
    status: { type: String, enum: ['borrowed', 'returned'], default: 'borrowed' },
    renewCount: { type: Number, default: 0, min: 0 },
    processedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // the librarian who lent the book
  },
  { timestamps: true }
);

// The database itself refuses a 2nd ACTIVE loan of the same book by the same member
// (partial index: only applies while status is 'borrowed').
borrowSchema.index({ user: 1, book: 1 }, { unique: true, partialFilterExpression: { status: 'borrowed' } });
borrowSchema.index({ status: 1, dueDate: 1 }); // status tabs, due-date sorts, overdue counts
borrowSchema.index({ borrowedAt: -1 });        // "Newest" sort

module.exports = mongoose.model('Borrow', borrowSchema);
