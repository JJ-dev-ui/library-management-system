import { useEffect, useState } from 'react';
import { ArrowUp } from 'lucide-react';

// Floating "Back to top" button for long feeds.
// It is ALWAYS rendered and only its class changes, so CSS can fade + slide it in and out smoothly
// (removing it from the page would make it pop). Hidden = not focusable and hidden from screen readers.
export default function BackToTop() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    // requestAnimationFrame: at most one check per frame while scrolling
    let frame = 0;
    const onScroll = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setShow(window.scrollY > 900));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll); };
  }, []);
  return (
    <button type="button" className={`back-to-top ${show ? 'is-visible' : ''}`} tabIndex={show ? 0 : -1} aria-hidden={!show}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="Back to top" title="Back to top">
      <ArrowUp size={20} />
    </button>
  );
}
