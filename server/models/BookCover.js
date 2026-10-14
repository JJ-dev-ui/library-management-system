const mongoose = require('mongoose');

// A cover photo uploaded by a librarian, stored as binary data in its OWN collection.
// Keeping the image out of the Book document keeps the book lists small and fast:
// lists never load image bytes, only GET /api/books/:id/cover does.
const bookCoverSchema = new mongoose.Schema({
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true, unique: true }, // one cover per book
  data: { type: Buffer, required: true },      // the image bytes
  contentType: { type: String, required: true, enum: ['image/jpeg', 'image/png', 'image/webp'] },
  size: { type: Number, required: true },      // bytes
  width: { type: Number },
  height: { type: Number },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('BookCover', bookCoverSchema);
