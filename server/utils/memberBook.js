// What a MEMBER may see of a book. Admin-only data (archive info, who archived it, how often it was
// borrowed, who borrowed it, Open Library keys...) never leaves the server through member endpoints.

// Fields to load for a card / feed post
const CARD_SELECT = 'title subtitle authors isbn category description coverUrl hasCustomCover coverVersion availableCopies totalCopies createdAt shelfLocation';
// Extra fields for the full book modal
const DETAIL_SELECT = `${CARD_SELECT} publisher publishedYear pages language subjects`;

const PREVIEW_CHARS = 400;

// Book document -> member-safe object. full = the modal (whole description + catalog details).
// Array.from(...) splits by characters (code points), so "ñ" or an emoji is never cut in half.
function memberBook(b, { full = false } = {}) {
  if (!b) return null;
  const chars = Array.from(b.description || '');
  const out = {
    _id: b._id,
    title: b.title,
    subtitle: b.subtitle || '',
    authors: b.authors || [],
    isbn: b.isbn,
    category: b.category,
    coverUrl: b.coverUrl || '',
    hasCustomCover: !!b.hasCustomCover,
    coverVersion: b.coverVersion || 0,
    availableCopies: b.availableCopies,
    totalCopies: b.totalCopies,
    createdAt: b.createdAt,
    shelfLocation: b.shelfLocation || '', // "Shelf PRG-B4" in the card footer
    descriptionPreview: chars.slice(0, PREVIEW_CHARS).join(''),
    descriptionLength: chars.length, // the client shows "…" / "See more" when longer than the preview
  };
  if (full) {
    Object.assign(out, {
      description: b.description || '',
      publisher: b.publisher || '',
      publishedYear: b.publishedYear || null,
      pages: b.pages || null,
      language: b.language || '',
      subjects: b.subjects || [],
    });
  }
  return out;
}

module.exports = { CARD_SELECT, DETAIL_SELECT, memberBook };
