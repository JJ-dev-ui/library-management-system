const mongoose = require('mongoose');

// One document = one book TITLE in our library.
// Catalog details were imported once from Open Library; copies/shelf are our own inventory data.
const bookSchema = new mongoose.Schema(
  {
    // ----- Catalog details (from the one-time Open Library import) -----
    title: { type: String, required: true, trim: true, maxlength: 200 },
    subtitle: { type: String, trim: true, maxlength: 200, default: '' },
    authors: {
      type: [{ type: String, trim: true, maxlength: 120 }],
      validate: [(arr) => arr.length > 0, 'At least one author is required'],
    },
    isbn: { type: String, required: true, unique: true, trim: true },
    description: { type: String, maxlength: 2000, default: '' },
    coverUrl: { type: String, default: '' }, // e.g. /covers/9780132350884.jpg (served by our frontend)
    category: { type: String, required: true, trim: true, default: 'General' },
    subjects: { type: [String], default: [] },
    publisher: { type: String, trim: true, default: '' },
    publishedYear: { type: Number, min: 0, max: 3000 },
    pages: { type: Number, min: 1 },
    language: { type: String, default: 'English' },
    openLibraryKey: { type: String, default: '' }, // reference to the source, e.g. /works/OL3702561W

    // ----- Our own inventory -----
    shelfLocation: { type: String, default: '' }, // e.g. PRG-B4
    totalCopies: { type: Number, required: true, min: 1, default: 1 },
    availableCopies: { type: Number, required: true, min: 0, default: 1 },
    // How many times this title was lent out (used for the "Most borrowed" sort). +1 on every new transaction.
    timesBorrowed: { type: Number, min: 0, default: 0 },
    // Cover photo uploaded by a librarian (stored in the BookCover collection, not here).
    // coverVersion goes up after every upload/removal and is added to the image URL (?v=3),
    // so browsers download the new picture instead of showing the old cached one.
    hasCustomCover: { type: Boolean, default: false },
    coverVersion: { type: Number, default: 0 },

    // ----- Member feed -----
    // A random number given once (create, import, seed). The Home feed sorts by
    // (feedRank + seed) mod 1,000,003: every visit uses a new seed, so the order looks shuffled,
    // but for ONE seed the order is fixed, so page 2 never repeats books from page 1.
    feedRank: { type: Number, min: 0, max: 999999, default: () => Math.floor(Math.random() * 1000000) },

    // ----- Archive (instead of deleting a book that has borrowing history) -----
    // An archived book is hidden from the catalog, filters and counts, but stays in the database,
    // so old transactions still show which book was borrowed. It can be restored anytime.
    isArchived: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date, default: null },
    archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true } // createdAt = date the book was added to our library
);

// Indexes make the filters and sorting fast with 1,000+ books
bookSchema.index({ category: 1, title: 1 });
bookSchema.index({ title: 1 });
bookSchema.index({ authors: 1 });       // author filter, author sort, author autocomplete
bookSchema.index({ publishedYear: 1 }); // year range filter + year sorts
bookSchema.index({ language: 1 });      // language filter
bookSchema.index({ createdAt: -1 });    // "Recently added" sort + "Date added" filter

module.exports = mongoose.model('Book', bookSchema);