import Skeleton from 'react-loading-skeleton';
import BookCover from '../books/BookCover';
import { useMember } from '../../context/MemberContext';
import { BookmarkToggle, RequestAction } from './BookPostCard';

// Grid view tile: a dominant 2:3 cover with the bookmark icon on top, title (2 lines), authors (1 line),
// availability (dot + text) and the member's status. "Request" appears on hover (always on touch screens).
// Clicking the tile opens the book modal.
//   badge / children: My Books shows its own status and dates instead of Request
export default function BookTile({ book, badge = null, children, showRequest = true }) {
  const { openBook, statusOf } = useMember();
  if (!book) return <div className="book-tile is-missing"><p className="meta p-3 mb-0">This book is no longer in the catalog.</p>{children}</div>;
  const status = statusOf(book);
  const open = () => openBook(book._id);
  const onKey = (e) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); }
  };
  return (
    <article className="book-tile" role="button" tabIndex={0} onClick={open} onKeyDown={onKey} aria-label={`Open ${book.title}`}>
      <div className="tile-cover">
        <BookCover book={book} className="cover-fill" />
        <BookmarkToggle book={book} className="tile-bookmark" />
        {showRequest && status === 'none' && <div className="tile-hover"><RequestAction book={book} /></div>}
      </div>
      <div className="tile-body">
        <h3 className="tile-title">{book.title}</h3>
        <p className="tile-authors">{book.authors?.join(', ')}</p>
        <p className={`tile-avail ${book.availableCopies > 0 ? 'is-in' : 'is-out'}`}>
          {book.availableCopies > 0 ? `${book.availableCopies} available` : 'All copies borrowed'}
        </p>
        {badge || (status !== 'none' && <RequestAction book={book} />)}
        {children}
      </div>
    </article>
  );
}

export function TileSkeleton() {
  return (
    <div className="book-tile" aria-hidden="true">
      <div className="tile-cover"><Skeleton height="100%" containerClassName="d-block h-100" borderRadius={0} /></div>
      <div className="tile-body"><Skeleton width="85%" /><Skeleton width="60%" height={12} /><Skeleton width="45%" height={12} /></div>
    </div>
  );
}

// Grid wrapper: 5 per row ≥1400px, 4 ≥1200, 3 ≥768, 2 on phones (see member.css .tile-grid)
export function TileGrid({ children }) {
  return <div className="tile-grid">{children}</div>;
}
