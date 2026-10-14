const mongoose = require('mongoose');

// "Save for later": one document per (member, book). The limit of 200 per member is checked in
// routes/me.js before saving.
const bookmarkSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// unique: the same book can never be bookmarked twice by the same member (also the "is it saved?" lookup)
bookmarkSchema.index({ user: 1, book: 1 }, { unique: true });
bookmarkSchema.index({ user: 1, createdAt: -1 }); // Bookmarks page: newest first

module.exports = mongoose.model('Bookmark', bookmarkSchema);
