import { useEffect, useState } from 'react';
import { Button, Modal, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { Bookmark, BookmarkCheck, X } from 'lucide-react';
import Skeleton from 'react-loading-skeleton';
import api, { errMsg } from '../../api';
import { useToast } from '../../context/ToastContext';
import { useMember } from '../../context/MemberContext';
import ZoomableCover from '../books/ZoomableCover';
import CopyableText from '../CopyableText';
import ConfirmModal from '../ConfirmModal';
import DetailSkeleton from '../skeletons/DetailSkeleton';
import { AvailabilityBadge } from './BookPostCard';
import { formatDate, expiresText } from '../../utils/format';
import { languageLabel } from '../../utils/books';
import { MEMBER } from '../../utils/labels';

const LONG_TEXT = 700; // longer descriptions get "Show more"

// The book modal of the member portal (opened from any card, notification or ?book=<id> link).
// It loads the book (member-safe fields) and /me/book-status, which decides the footer:
//   borrowing it      -> "You're borrowing this · return by Oct 27" (no button)
//   requested it      -> "Requested · pick up within 3 days" + Cancel request
//   cannot request    -> Request disabled, the reason in a tooltip and under the button
//   otherwise         -> Request (with a confirmation)
export default function MemberBookModal({ bookId, onHide }) {
  const toast = useToast();
  const { isBookmarked, toggleBookmark, refreshSummary, setBookStatus } = useMember();
  const show = !!bookId;
  const [book, setBook] = useState(null);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [confirm, setConfirm] = useState(null); // 'request' | 'cancel'
  const [busy, setBusy] = useState(false);

  const loadStatus = (id, signal) => api.get(`/me/book-status/${id}`, { signal }).then((res) => setStatus(res.data));

  useEffect(() => {
    if (!bookId) return undefined;
    const ctrl = new AbortController();
    setBook(null); setStatus(null); setError(''); setExpanded(false);
    Promise.all([
      api.get(`/books/${bookId}`, { signal: ctrl.signal }).then((res) => setBook(res.data.book)),
      loadStatus(bookId, ctrl.signal),
    ]).catch((err) => { if (err.code !== 'ERR_CANCELED') setError(errMsg(err)); });
    return () => ctrl.abort();
  }, [bookId]);

  // The bookmark state shown here follows the cards (same source: MemberContext)
  const saved = book ? isBookmarked({ ...book, bookmarked: status?.bookmarked }) : false;

  const runConfirm = async () => {
    setBusy(true);
    try {
      if (confirm === 'request') {
        await api.post('/requests', { bookId: book._id });
        toast.success(MEMBER.requestSent);
        setBookStatus(book._id, 'requested'); // the card / tile behind the modal shows "Requested"
      } else {
        await api.put(`/requests/${status.pendingRequest._id}/cancel`);
        toast.success('Your request was cancelled');
        setBookStatus(book._id, 'none');
      }
      setConfirm(null);
      await loadStatus(book._id);
      refreshSummary(); // badges, "slots left"
    } catch (err) {
      toast.error(errMsg(err));
      setConfirm(null);
      loadStatus(book._id).catch(() => {});
    } finally {
      setBusy(false);
    }
  };

  const desc = book?.description || '';
  const longDesc = desc.length > LONG_TEXT;
  const can = status?.canRequest;

  // ---------- Footer: the main action depends on the member's situation ----------
  let footer = null;
  if (status && book) {
    if (status.borrowing) {
      footer = <span className="member-cta-note">You&apos;re borrowing this · return by <strong>{formatDate(status.borrowing.dueDate)}</strong></span>;
    } else if (status.pendingRequest) {
      footer = (
        <>
          <span className="member-cta-note">
            Requested · pick up within 3 days <span className="meta">({expiresText(status.pendingRequest.expiresAt).toLowerCase()})</span>
          </span>
          <Button variant="outline-secondary" onClick={() => setConfirm('cancel')}>Cancel request</Button>
        </>
      );
    } else if (can && !can.ok) {
      footer = (
        <>
          <span className="member-cta-note text-danger-emphasis">{can.message}</span>
          {/* Disabled button: the tooltip sits on a focusable wrapper (disabled buttons get no events) */}
          <OverlayTrigger overlay={<Tooltip>{can.message}</Tooltip>}>
            <span className="d-inline-block" tabIndex={0} aria-label={can.message}>
              <Button variant="primary" disabled>Request</Button>
            </span>
          </OverlayTrigger>
        </>
      );
    } else {
      footer = <Button variant="primary" onClick={() => setConfirm('request')}>Request</Button>;
    }
  }

  return (
    <>
      <Modal show={show} onHide={onHide} size="xl" fullscreen="sm-down" centered scrollable aria-labelledby="member-book-title">
        <Modal.Header>
          <Modal.Title id="member-book-title" className="h5">Book details</Modal.Title>
          <div className="ms-auto d-flex align-items-center gap-1">
            {book && (
              <OverlayTrigger overlay={<Tooltip>{saved ? 'Remove bookmark' : 'Save for later'}</Tooltip>}>
                <button type="button" className={`btn btn-icon ${saved ? 'is-on' : ''}`} aria-pressed={saved}
                  aria-label={saved ? 'Remove bookmark' : 'Save for later'}
                  onClick={() => toggleBookmark({ ...book, bookmarked: status?.bookmarked })}>
                  {saved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
                </button>
              </OverlayTrigger>
            )}
            <OverlayTrigger overlay={<Tooltip>Close</Tooltip>}>
              <button type="button" className="btn btn-icon" aria-label="Close" onClick={onHide}><X size={18} /></button>
            </OverlayTrigger>
          </div>
        </Modal.Header>
        <Modal.Body>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          {!book && !error && <DetailSkeleton variant="book" />}
          {book && (
            <div className="book-detail">
              <ZoomableCover book={book} size="lg" />
              <div className="min-w-0">
                <span className="tag mb-2">{book.category}</span>
                <h2 className="h4 mb-1">{book.title}</h2>
                {book.subtitle && <p className="text-muted mb-1">{book.subtitle}</p>}
                <p className="mb-3">by <strong className="fw-semibold">{book.authors?.join(', ')}</strong></p>
                <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                  <AvailabilityBadge book={book} />
                  {book.shelfLocation && <span className="meta">Find it on shelf <span className="mono">{book.shelfLocation}</span></span>}
                </div>
                <dl className="detail-grid mb-4">
                  <div><dt>ISBN</dt><dd><CopyableText value={book.isbn} label="ISBN" /></dd></div>
                  <div><dt>Publisher</dt><dd>{book.publisher || '—'}</dd></div>
                  <div><dt>Published</dt><dd>{book.publishedYear || '—'}</dd></div>
                  <div><dt>Pages</dt><dd>{book.pages || '—'}</dd></div>
                  <div><dt>Language</dt><dd>{languageLabel(book.language)}</dd></div>
                  <div><dt>Copies</dt><dd>{book.availableCopies} of {book.totalCopies} on the shelf</dd></div>
                </dl>
                <div className="section-label">Description</div>
                {desc ? (
                  <>
                    <p className="description mb-1">{expanded || !longDesc ? desc : `${desc.slice(0, LONG_TEXT).trim()}…`}</p>
                    {longDesc && (
                      <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
                        {expanded ? 'Show less' : 'Show more'}
                      </button>
                    )}
                  </>
                ) : <p className="meta">No description available.</p>}
              </div>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer className="member-modal-foot">
          <Button variant="outline-secondary" onClick={onHide}>Close</Button>
          <div className="d-flex flex-wrap align-items-center justify-content-end gap-2 ms-auto">
            {book && !status ? <Skeleton width={160} height={36} /> : footer}
          </div>
        </Modal.Footer>
      </Modal>

      <ConfirmModal
        show={!!confirm}
        title={confirm === 'request' ? `Request '${book?.title}'?` : 'Cancel this request?'}
        message={confirm === 'request' ? MEMBER.pickUp : 'The librarian will no longer prepare this book for you.'}
        confirmLabel={confirm === 'request' ? 'Send request' : 'Cancel request'}
        confirmVariant={confirm === 'request' ? 'primary' : 'danger'}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
        loading={busy}
      />
    </>
  );
}
