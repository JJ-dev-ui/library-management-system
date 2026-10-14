import Skeleton from 'react-loading-skeleton';
import BookCover from './BookCover';
import Availability from './Availability';
import BookActions, { ArchivedBadge } from './BookActions';
import RowCheckbox from '../table/RowCheckbox';

// Card layout for the books (the other choice of the Table / Cards toggle).
// Each card opens the details modal: click, or Tab to it and press Enter/Space.
// selection (optional, from hooks/useSelection): a checkbox in the corner of every card.
export default function BookCards({ books, loading, rows = 10, showActions = false, onOpen, onEdit, onDelete, onRestore, selection }) {
  if (loading) {
    // Same card size as the real ones, so nothing jumps when the books arrive
    return (
      <div className="book-grid" aria-busy="true">
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="book-card" aria-hidden="true">
            <div className="book-card-cover"><Skeleton height="100%" containerClassName="d-block h-100" borderRadius={0} /></div>
            <div className="book-card-body">
              <Skeleton width="85%" /><Skeleton width="60%" height={12} /><Skeleton width="45%" height={12} />
              <Skeleton width="70%" className="mt-2" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const onKey = (b) => (e) => {
    if (e.target !== e.currentTarget) return; // keys pressed on the Edit/Delete buttons are not for the card
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(b); }
  };

  return (
    <div className="book-grid">
      {books.map((b, index) => (
        <article key={b._id} className={`book-card ${selection?.ids.has(b._id) ? 'is-selected' : ''}`} tabIndex={0} onClick={() => onOpen(b)} onKeyDown={onKey(b)} aria-label={`View details of ${b.title}`}>
          {selection && (
            <span className="card-check" onClick={(e) => e.stopPropagation()}>
              <RowCheckbox checked={selection.ids.has(b._id)} onToggle={(shift) => selection.toggle(books, index, shift)} label={`Select ${b.title}`} />
            </span>
          )}
          <div className="book-card-cover">
            <BookCover book={b} className="cover-fill" />
          </div>
          <div className="book-card-body">
            <h3 className="book-card-title cell-clamp">{b.title}</h3>
            {b.isArchived && <ArchivedBadge />}
            <div className="cell-sub text-truncate">{b.authors?.join(', ')}</div>
            <div className="cell-sub text-truncate">{b.publisher || '—'}</div>
            <div className="book-card-foot">
              <Availability book={b} />
              {showActions && (
                // stopPropagation: the buttons must not also open the details modal
                <span className="d-inline-flex" onClick={(e) => e.stopPropagation()}>
                  <BookActions book={b} onEdit={onEdit} onDelete={onDelete} onRestore={onRestore} />
                </span>
              )}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}
