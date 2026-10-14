const mongoose = require('mongoose');

// A member's request to borrow a book ("Request" button in the member portal).
// The librarian approves it at the counter (this creates the real Borrow transaction) or denies it.
// A pending request that nobody handles expires at the end of the 3rd day.
//
// Flow:  pending ──approve──> approved (transaction is set)
//                ├─deny─────> denied   (note = the librarian's reason, optional)
//                ├─cancel───> cancelled (by the member)
//                └─time─────> expired  (marked lazily, see utils/requestRules.js)
const STATUSES = ['pending', 'approved', 'denied', 'cancelled', 'expired'];

const borrowRequestSchema = new mongoose.Schema(
  {
    code: { type: String, unique: true, trim: true },                 // e.g. RQ-2026-000045
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    status: { type: String, enum: STATUSES, default: 'pending' },
    note: { type: String, trim: true, maxlength: 300, default: '' },  // reason when denied (optional)
    requestedAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },                       // requestedAt + 3 days, end of that day
    decidedAt: { type: Date, default: null },                        // approved / denied / cancelled / expired at
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Borrow', default: null }, // set when approved
  },
  { timestamps: true }
);

borrowRequestSchema.index({ user: 1, status: 1 });         // "my requests", pending count per member
borrowRequestSchema.index({ status: 1, requestedAt: 1 });  // Requests page tabs, oldest pending first, expiry
// The DATABASE refuses a 2nd PENDING request for the same book by the same member
// (partial index: only applies while status is 'pending'; old requests do not count)
borrowRequestSchema.index({ user: 1, book: 1 }, { unique: true, partialFilterExpression: { status: 'pending' } });

module.exports = mongoose.model('BorrowRequest', borrowRequestSchema);
module.exports.REQUEST_STATUSES = STATUSES;
