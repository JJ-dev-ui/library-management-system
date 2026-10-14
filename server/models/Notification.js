const mongoose = require('mongoose');

// A member's notification (the bell in the member portal).
// dedupeKey makes every notification happen ONCE: e.g. "return_soon:<transactionId>" or
// "request:<requestId>:request_denied". A unique index on { user, dedupeKey } lets the database itself
// refuse a duplicate, even when two requests try to create the same reminder at the same moment.
const TYPES = [
  'request_approved', 'request_denied', 'request_expired', 'request_cancelled', 'return_soon', 'late', 'new_books',
  'new_books_today', 'top_book_month', 'bookmark_available',
];

const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: TYPES, required: true },
    title: { type: String, required: true, maxlength: 120 },
    message: { type: String, required: true, maxlength: 400 },
    link: { type: String, default: '' }, // client route to open, e.g. /my-books?tab=requests
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book' },
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'BorrowRequest' },
    transaction: { type: mongoose.Schema.Types.ObjectId, ref: 'Borrow' },
    dedupeKey: { type: String, required: true },
    readAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

notificationSchema.index({ user: 1, dedupeKey: 1 }, { unique: true });
notificationSchema.index({ user: 1, createdAt: -1 }); // latest first
// Old notifications are deleted automatically after 90 days (TTL index), like the login records
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('Notification', notificationSchema);
module.exports.NOTIFICATION_TYPES = TYPES;
