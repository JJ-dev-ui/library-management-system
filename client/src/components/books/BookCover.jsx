import { useEffect, useMemo, useState } from 'react';
import { coverCandidates } from '../../utils/cover';

// Book cover with a fixed size (so rows never jump while images load).
// Tries each possible image in order (uploaded photo -> stored URL -> ISBN cover file); when one fails
// to load it moves to the next, and finally shows a tinted block with the title's initials.
// size: 'sm' | 'md' | 'lg'. previewSrc: unsaved new photo (book form).
// onSource({ kind, src }): tells the parent which image is shown (kind 'none' = placeholder).
export default function BookCover({ book, size = 'md', className = '', previewSrc, onSource }) {
  const candidates = useMemo(
    () => coverCandidates(book, previewSrc),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [book?._id, book?.hasCustomCover, book?.coverVersion, book?.coverUrl, book?.isbn, previewSrc]
  );
  const key = candidates.map((c) => c.src).join('|');
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [key]); // different images -> start again with the best one

  const current = candidates[index];
  useEffect(() => {
    if (!current) onSource?.({ kind: 'none', src: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.src]);

  const cls = ['cover', size !== 'md' && `cover-${size}`, className].filter(Boolean).join(' ');

  if (!current) {
    return <div className={`${cls} cover-fallback`} aria-hidden="true">{(book?.title || '?').slice(0, 2)}</div>;
  }
  return (
    <img
      key={current.src}
      className={cls}
      src={current.src}
      alt=""
      loading="lazy"
      onLoad={() => onSource?.(current)}
      onError={() => setIndex((i) => i + 1)} // try the next image
    />
  );
}
