import { API_BASE } from '../api';

const ISBN_RX = /^(\d{9}[\dX]|\d{13})$/;

// Every image we could show for a book, best first. <BookCover> tries them in this order and moves
// to the next one when an image fails to load (onError), ending with the initials placeholder.
//   1. a photo uploaded by a librarian   -> /api/books/:id/cover?v=<version>  (?v= changes after each
//      upload, so the browser never shows an old cached image)
//   2. the cover URL stored on the book   (e.g. /covers/9780132350884.jpg or an https:// link)
//   3. our imported cover file for the ISBN -> /covers/{isbn}.jpg
// previewSrc: a new photo chosen in the form but not saved yet (shown first).
export function coverCandidates(book, previewSrc) {
  if (!book) return [];
  const list = [];
  if (previewSrc) list.push({ src: previewSrc, kind: 'new' });
  if (book.hasCustomCover && book._id) list.push({ src: `${API_BASE}/books/${book._id}/cover?v=${book.coverVersion || 0}`, kind: 'custom' });
  const isbn = String(book.isbn || '').replace(/[\s-]/g, '').toUpperCase();
  const isbnSrc = ISBN_RX.test(isbn) ? `/covers/${isbn}.jpg` : null;
  if (book.coverUrl) list.push({ src: book.coverUrl, kind: book.coverUrl === isbnSrc ? 'isbn' : 'url' });
  if (isbnSrc && book.coverUrl !== isbnSrc) list.push({ src: isbnSrc, kind: 'isbn' });
  return list;
}

// Text for the "which cover is in use" line in the book form
export const COVER_KIND_LABEL = {
  new: 'New photo (saved when you save the book)',
  custom: 'Uploaded cover',
  isbn: 'Library cover (from ISBN)',
  url: 'Image from URL',
  none: 'No cover',
};
