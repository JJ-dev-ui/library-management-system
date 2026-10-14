const mongoose = require('mongoose');

// Audit trail: one document per important action ("who did what, to which member/book, when").
// Shown in "Recent activity" on the dashboard.
const TYPES = [
  'book_borrowed', 'book_returned', 'borrow_extended',
  'book_added', 'book_updated', 'book_deleted', 'book_archived', 'book_restored',
  'member_added', 'member_updated', 'member_activated', 'member_deactivated', 'member_deleted', 'member_registered',
  'password_changed',
  'data_exported', 'books_imported',
  'request_created', 'request_cancelled', 'request_approved', 'request_denied', 'request_expired',
];

const activityLogSchema = new mongoose.Schema(
  {
    type: { type: String, enum: TYPES, required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },         // who did it
    member: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },        // the member it was about (optional)
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book' },          // the book it was about (optional)
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Borrow' }, // the transaction (optional)
    // Small extra details, e.g. { from, to } for an extension. It also keeps a readable SNAPSHOT
    // (bookTitle, memberName, code), so the row still makes sense after the book/member is deleted.
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

activityLogSchema.index({ createdAt: -1 });          // "latest 10" on the dashboard
activityLogSchema.index({ type: 1, createdAt: -1 }); // filter by event type

module.exports = mongoose.model('ActivityLog', activityLogSchema);
module.exports.ACTIVITY_TYPES = TYPES;
