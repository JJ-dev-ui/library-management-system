import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Avatar from '../Avatar';
import { formatDate, formatDateTime } from '../../utils/format';

const PER_PAGE = 5;
const DUE_SOON_MS = 3 * 24 * 60 * 60 * 1000;

// Small soft badge, only when it matters: "Late" (past the return date) or "Due soon" (within 3 days)
function ReturnBadge({ loan }) {
  const ms = new Date(loan.dueDate) - Date.now();
  if (loan.isOverdue || ms < 0) return <span className="status-badge badge-danger">Late</span>;
  if (ms <= DUE_SOON_MS) return <span className="status-badge badge-warning">Due soon</span>;
  return null;
}

// "Current borrowers" in the book details modal: one compact row per borrower, 5 per page.
export default function BorrowerList({ loans }) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [loans]); // new book -> back to the first page

  if (loans.length === 0) return <p className="meta mb-0">No one is borrowing this book right now.</p>;

  const pages = Math.ceil(loans.length / PER_PAGE);
  const start = (page - 1) * PER_PAGE;
  const shown = loans.slice(start, start + PER_PAGE);

  return (
    <>
      <ul className="borrower-list">
        {shown.map((l) => (
          <li key={l._id} className="borrower-row">
            <div className="d-flex align-items-center gap-2 min-w-0 borrower-who">
              <Avatar name={l.user?.name || '?'} avatarKey={l.user?.avatarKey} size="sm" />
              <div className="min-w-0">
                <div className="fw-medium text-truncate">{l.user?.name || 'Deleted user'}</div>
                <div className="cell-sub mono">{l.user?.memberId || '—'}</div>
              </div>
            </div>
            <div className="borrower-meta">
              <span>Borrowed {formatDateTime(l.borrowedAt)}</span>
              <span>Return by {formatDate(l.dueDate)}</span>
            </div>
            <div className="borrower-badge"><ReturnBadge loan={l} /></div>
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <div className="d-flex align-items-center justify-content-end gap-2 mt-2">
          <span className="meta">{start + 1}–{start + shown.length} of {loans.length}</span>
          <button type="button" className="btn btn-icon" onClick={() => setPage((p) => p - 1)} disabled={page === 1} aria-label="Previous borrowers">
            <ChevronLeft size={16} />
          </button>
          <button type="button" className="btn btn-icon" onClick={() => setPage((p) => p + 1)} disabled={page === pages} aria-label="Next borrowers">
            <ChevronRight size={16} />
          </button>
        </div>
      )}
    </>
  );
}
