import { useState } from 'react';
import { Button, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import BookCover from '../books/BookCover';
import CopyableText from '../CopyableText';
import { useMember } from '../../context/MemberContext';
import { addedAgo, shortDate } from '../../utils/format';

// "3 available" (green) or "All copies borrowed" (grey) — used in the book modal
export function AvailabilityBadge({ book }) {
  return book.availableCopies > 0
    ? <span className="status-badge badge-success">{book.availableCopies} available</span>
    : <span className="status-badge badge-neutral">All copies borrowed</span>;
}

// "Shelf PRG-B4 · 4 available" / "All copies borrowed" (quiet text, the card footer)
export const availabilityText = (book) => [
  book.shelfLocation ? `Shelf ${book.shelfLocation}` : null,
  book.availableCopies > 0 ? `${book.availableCopies} available` : 'All copies borrowed',
].filter(Boolean).join(' · ');

// Icon-only bookmark toggle (filled when saved) with a tooltip. stopPropagation: the click must not
// also open the card it sits on.
export function BookmarkToggle({ book, className = '' }) {
  const { isBookmarked, toggleBookmark } = useMember();
  const saved = isBookmarked(book);
  const label = saved ? 'Remove bookmark' : 'Save for later';
  return (
    <OverlayTrigger overlay={<Tooltip>{label}</Tooltip>}>
      <button type="button" className={`btn btn-icon bookmark-toggle ${saved ? 'is-on' : ''} ${className}`} aria-pressed={saved} aria-label={label}
        onClick={(e) => { e.stopPropagation(); toggleBookmark(book); }} onKeyDown={(e) => e.stopPropagation()}>
        {saved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
      </button>
    </OverlayTrigger>
  );
}

// The member's situation for this book instead of a plain button:
//   borrowing -> soft badge "Borrowing · return by Oct 27"
//   requested -> soft badge "Requested"
//   blocked   -> Request disabled, the reason in a tooltip (late book, 5-book limit, no copies)
//   otherwise -> Request (opens the confirmation)
export function RequestAction({ book, size = 'sm', className = '' }) {
  const { statusOf, requestBlock, askRequest } = useMember();
  const status = statusOf(book);
  if (status === 'borrowing') {
    return <span className="status-badge badge-brand">Borrowing{book.myDueDate ? ` · return by ${shortDate(book.myDueDate)}` : ''}</span>;
  }
  if (status === 'requested') return <span className="status-badge badge-warning">Requested</span>;
  const reason = requestBlock?.message || (book.availableCopies <= 0 ? 'No copies are available right now.' : null);
  const stop = (e) => e.stopPropagation();
  if (reason) {
    return (
      // Disabled buttons get no mouse events: the tooltip sits on a focusable wrapper
      <OverlayTrigger overlay={<Tooltip>{reason}</Tooltip>}>
        <span className={`d-inline-block ${className}`} tabIndex={0} aria-label={reason} onClick={stop} onKeyDown={stop}>
          <Button size={size} variant="primary" disabled>Request</Button>
        </span>
      </OverlayTrigger>
    );
  }
  return (
    <Button size={size} variant="primary" className={className} onClick={(e) => { stop(e); askRequest(book); }} onKeyDown={stop}>
      Request
    </Button>
  );
}

// A book shown like a Facebook post: header (category · added + bookmark icon), cover + text, and a
// footer row (shelf / availability on the left, Request or the member's status on the right).
//   compact: smaller variant for My Books (no description)
//   badge:   shown in the header instead of the bookmark icon (e.g. a status badge in My Books)
//   children: extra lines under the authors (dates, notes...)
//   actions: replaces the right side of the footer (null = no footer)
//   leaving: true while the card fades out (removed from Bookmarks)
export default function BookPostCard({ book, compact = false, badge = null, children, actions, leaving = false }) {
  const { openBook } = useMember();
  const [expanded, setExpanded] = useState(false);
  // A transaction whose book was deleted from the catalog (My Books history)
  if (!book) {
    return (
      <article className="post-card post-compact">
        <header className="post-head">{badge && <span className="ms-auto">{badge}</span>}</header>
        <div className="post-text px-4 pb-4"><p className="meta mb-1">This book is no longer in the catalog.</p>{children}</div>
      </article>
    );
  }
  const open = () => openBook(book._id);
  const preview = book.descriptionPreview || '';
  const cut = (book.descriptionLength || 0) > preview.length; // the server sent only the beginning

  // The card body opens the book; clicks on buttons inside it must not ALSO open it
  const stop = (fn) => (e) => { e.stopPropagation(); fn(); };
  const onKey = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  };
  const right = actions === undefined ? <RequestAction book={book} /> : actions;

  return (
    <article className={`post-card ${compact ? 'post-compact' : ''} ${leaving ? 'is-leaving' : ''}`} aria-label={book.title}>
      <header className="post-head">
        <span className="tag">{book.category}</span>
        <span className="meta">· {addedAgo(book.createdAt)}</span>
        <span className="ms-auto">{badge || <BookmarkToggle book={book} />}</span>
      </header>

      <div className="post-body" role="button" tabIndex={0} onClick={open} onKeyDown={onKey} aria-label={`Open ${book.title}`}>
        <div className="post-cover"><BookCover book={book} className="cover-fill" /></div>
        <div className="post-text min-w-0">
          <h3 className="post-title">{book.title}</h3>
          {book.subtitle && <p className="post-subtitle">{book.subtitle}</p>}
          <p className="post-authors">by {book.authors?.join(', ') || 'Unknown author'}</p>
          {!compact && (
            preview ? (
              <div className="post-desc-wrap">
                <p className={`post-desc ${expanded ? '' : 'clamp-3'}`}>{preview}{expanded && cut ? '…' : ''}</p>
                <button type="button" className="btn btn-link btn-sm p-0" onClick={stop(() => (expanded && cut ? open() : setExpanded((v) => !v)))}>
                  {!expanded ? 'See more' : cut ? 'Read the full description' : 'See less'}
                </button>
              </div>
            ) : <p className="post-desc meta">No description available.</p>
          )}
          {children}
          <div className="post-facts">
            <span className="meta">ISBN</span>
            <CopyableText value={book.isbn} label="ISBN" className="copy-chip-sm" />
          </div>
        </div>
      </div>

      {right !== null && (
        <footer className="post-foot">
          <span className={`meta text-truncate ${book.availableCopies > 0 ? '' : 'is-out'}`}>{availabilityText(book)}</span>
          <span className="ms-auto flex-none">{right}</span>
        </footer>
      )}
    </article>
  );
}

// Same size as a real post, so the feed does not jump when the books arrive
export function PostSkeleton({ compact = false }) {
  return (
    <div className={`post-card ${compact ? 'post-compact' : ''}`} aria-hidden="true">
      <div className="post-head"><Skeleton width={160} /></div>
      <div className="post-body">
        <div className="post-cover"><Skeleton height="100%" containerClassName="d-block h-100" borderRadius={0} /></div>
        <div className="post-text flex-grow-1">
          <Skeleton width="75%" height={20} /><Skeleton width="45%" />
          {!compact && <Skeleton count={3} className="mt-2" />}
          <Skeleton width="40%" className="mt-2" />
        </div>
      </div>
      <div className="post-foot"><Skeleton width={140} /><Skeleton width={80} height={32} /></div>
    </div>
  );
}
