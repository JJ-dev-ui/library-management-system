import { useState } from 'react';
import { ZoomIn } from 'lucide-react';
import BookCover from './BookCover';
import ImageLightbox from '../ImageLightbox';

// A book cover that opens the big zoomable image (lightbox) when clicked.
// The button is disabled until a real image has loaded (nothing to zoom on the initials placeholder).
// It is ALWAYS rendered, so the image inside is not re-created when it finishes loading.
// hint: text of the hover overlay (e.g. "Click to zoom" in the book form).
export default function ZoomableCover({ book, size = 'lg', className = '', previewSrc, onSource, hint }) {
  const [src, setSrc] = useState(null);
  const [open, setOpen] = useState(false);

  const handleSource = (s) => {
    setSrc(s.src);
    onSource?.(s);
  };

  return (
    <>
      <button type="button" className="cover-zoom" onClick={() => setOpen(true)} disabled={!src} aria-label="Enlarge cover image">
        <BookCover book={book} size={size} className={className} previewSrc={previewSrc} onSource={handleSource} />
        {src && hint
          ? <span className="zoom-overlay" aria-hidden="true"><ZoomIn size={16} />{hint}</span>
          : src && <span className="zoom-hint" aria-hidden="true"><ZoomIn size={16} /></span>}
      </button>
      {src && <ImageLightbox show={open} onHide={() => setOpen(false)} src={src} alt={`Cover of ${book?.title || 'book'}`} />}
    </>
  );
}
