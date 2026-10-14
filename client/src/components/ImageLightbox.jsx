import { useEffect, useState } from 'react';
import { Modal } from 'react-bootstrap';
import { X } from 'lucide-react';

// Bootstrap has no image zoom/lightbox, so this is a small one built on a react-bootstrap Modal.
// Click the image (or press Enter/Space) to zoom in 2.2x; while zoomed, moving the mouse moves the
// zoomed area (transform-origin follows the pointer). Escape or the X closes it.
export default function ImageLightbox({ show, onHide, src, alt }) {
  const [zoomed, setZoomed] = useState(false);
  const [origin, setOrigin] = useState('50% 50%');

  useEffect(() => { if (show) { setZoomed(false); setOrigin('50% 50%'); } }, [show]);

  // Pointer position inside the image, in %, used as the zoom centre
  const originFrom = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    return `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
  };

  return (
    <Modal
      show={show}
      onHide={onHide}
      centered
      size="lg"
      className="modal-top"
      backdropClassName="modal-backdrop-top lightbox-backdrop"
      contentClassName="lightbox-content"
      aria-label={alt}
    >
      <div className="position-relative">
        <button type="button" className="lightbox-close" onClick={onHide} aria-label="Close image">
          <X size={18} />
        </button>
        <div className="lightbox-stage">
          <img
            src={src}
            alt={alt}
            className={`lightbox-img ${zoomed ? 'is-zoomed' : ''}`}
            style={{ transformOrigin: origin }}
            onClick={(e) => { setOrigin(originFrom(e)); setZoomed((z) => !z); }}
            onMouseMove={(e) => { if (zoomed) setOrigin(originFrom(e)); }}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setZoomed((z) => !z); } }}
            tabIndex={0}
            role="button"
            aria-pressed={zoomed}
            aria-label={zoomed ? 'Zoom out' : 'Zoom in'}
          />
        </div>
        <div className="lightbox-help"><span>{zoomed ? 'Move the mouse to look around · click to zoom out' : 'Click the image to zoom in'}</span></div>
      </div>
    </Modal>
  );
}
