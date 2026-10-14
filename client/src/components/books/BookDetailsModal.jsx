import { useEffect, useState } from 'react';
import { Button, Modal, OverlayTrigger, Tooltip } from 'react-bootstrap';
import api, { errMsg } from '../../api';
import { useToast } from '../../context/ToastContext';
import ZoomableCover from './ZoomableCover';
import BorrowerList from './BorrowerList';
import ConfirmModal from '../ConfirmModal';
import CopyableText from '../CopyableText';
import { levelProps } from '../../utils/modalLevel';
import DetailSkeleton from '../skeletons/DetailSkeleton';
import { formatDate } from '../../utils/format';
import { bookHasHistory, languageLabel, onLoanOf } from '../../utils/books';
import { MESSAGES } from '../../utils/labels';

const LONG_TEXT = 700; // descriptions longer than this get a "Show more" button

// Wraps a (possibly disabled) button with a tooltip that explains why it is disabled
function Explain({ when, text, children }) {
  if (!when) return children;
  return (
    <OverlayTrigger overlay={<Tooltip>{text}</Tooltip>}>
      <span className="d-inline-block" tabIndex={0}>{children}</span>
    </OverlayTrigger>
  );
}

// Full details of one book.
// mode 'admin': current borrowers + Edit / Delete / Lend.  mode 'member': a "Borrow" button (if onBorrow is given).
// reloadKey: change it to fetch the book again (e.g. after it was lent).
// level: 1 or 2 when it opens on top of other modals (see utils/modalLevel.js).
export default function BookDetailsModal({
  show, bookId, mode = 'admin', onHide, onEdit, onDeleted, onChanged, onLend, onBorrow, reloadKey = 0, level = 0,
}) {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!show || !bookId) return undefined;
    const ctrl = new AbortController();
    setData(null);
    setError('');
    setExpanded(false);
    api.get(`/books/${bookId}`, { signal: ctrl.signal })
      .then((res) => setData(res.data))
      .catch((err) => { if (err.code !== 'ERR_CANCELED') setError(errMsg(err)); });
    return () => ctrl.abort();
  }, [show, bookId, reloadKey]);

  const book = data?.book;
  const loans = data?.activeLoans || [];
  const onLoan = book ? onLoanOf(book) : 0;
  const isAdmin = mode === 'admin';
  // A book that was ever borrowed is ARCHIVED (kept for the records) instead of deleted
  const [archiveMode, setArchiveMode] = useState(false);
  useEffect(() => { setArchiveMode(bookHasHistory(book)); }, [book]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      if (archiveMode) await api.put(`/books/${book._id}/archive`);
      else await api.delete(`/books/${book._id}`);
      toast.success(`"${book.title}" was ${archiveMode ? 'archived' : 'deleted'}`);
      setConfirmDelete(false);
      onDeleted?.(book); // the parent closes this modal and reloads the list
    } catch (err) {
      // The server found borrowing history: the same dialog now offers "Archive"
      if (!archiveMode && /archive it instead/i.test(errMsg(err))) setArchiveMode(true);
      else toast.error(errMsg(err));
    } finally {
      setDeleting(false);
    }
  };

  const handleRestore = async () => {
    try {
      const res = await api.put(`/books/${book._id}/restore`);
      setData((d) => ({ ...d, book: res.data.book }));
      toast.success(`"${book.title}" was restored to the catalog`);
      onChanged?.();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const desc = book?.description || '';
  const longDesc = desc.length > LONG_TEXT;

  return (
    <>
      <Modal show={show} onHide={onHide} size="xl" fullscreen="sm-down" centered scrollable aria-labelledby="book-details-title" {...levelProps(level)}>
        <Modal.Header closeButton>
          <Modal.Title id="book-details-title">Book details</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          {!book && !error && <DetailSkeleton variant="book" />}
          {book && (
            <>
              <div className="book-detail">
                {/* Click the cover to see it big and zoom in */}
                <ZoomableCover book={book} size="lg" />
                <div className="min-w-0">
                  <h2 className="h4 mb-1">{book.title}</h2>
                  {book.isArchived && (
                    <p className="mb-2"><span className="status-badge badge-neutral">Archived</span>
                      <span className="meta ms-2">Hidden from the catalog{book.archivedAt ? ` since ${formatDate(book.archivedAt)}` : ''}</span></p>
                  )}
                  {book.subtitle && <p className="text-muted mb-1">{book.subtitle}</p>}
                  <p className="mb-3">by <strong className="fw-semibold">{book.authors?.join(', ')}</strong></p>

                  <div className="copies-row mb-4">
                    <div><div className="meta">Total</div><div className="num">{book.totalCopies}</div></div>
                    <div><div className="meta">Available</div><div className="num">{book.availableCopies}</div></div>
                    <div><div className="meta">Borrowed</div><div className="num">{onLoan}</div></div>
                    <div><div className="meta">Times borrowed</div><div className="num">{book.timesBorrowed || 0}</div></div>
                  </div>

                  <dl className="detail-grid mb-4">
                    <div>
                      <dt>ISBN</dt>
                      <dd>
                        {/* Click to copy; the icon turns into a check mark for 2 seconds */}
                        <CopyableText value={book.isbn} label="ISBN" />
                      </dd>
                    </div>
                    <div><dt>Category</dt><dd>{book.category}</dd></div>
                    <div><dt>Publisher</dt><dd>{book.publisher || '—'}</dd></div>
                    <div><dt>Published</dt><dd>{book.publishedYear || '—'}</dd></div>
                    <div><dt>Pages</dt><dd>{book.pages || '—'}</dd></div>
                    <div><dt>Language</dt><dd>{languageLabel(book.language)}</dd></div>
                    <div><dt>Shelf location</dt><dd className="mono">{book.shelfLocation || '—'}</dd></div>
                    <div><dt>Date added</dt><dd>{formatDate(book.createdAt)}</dd></div>
                  </dl>

                  {book.subjects?.length > 0 && (
                    <div className="mb-4">
                      <div className="section-label">Subjects</div>
                      <div className="d-flex flex-wrap gap-1">
                        {book.subjects.map((s) => <span key={s} className="tag">{s}</span>)}
                      </div>
                    </div>
                  )}

                  {desc && (
                    <div className="mb-2">
                      <div className="section-label">Description</div>
                      <p className="description mb-1">{expanded || !longDesc ? desc : `${desc.slice(0, LONG_TEXT).trim()}…`}</p>
                      {longDesc && (
                        <button type="button" className="btn btn-link btn-sm p-0" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}>
                          {expanded ? 'Show less' : 'Show more'}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {isAdmin && (
                <div className="mt-4">
                  <div className="section-label">Current borrowers ({loans.length})</div>
                  <BorrowerList loans={loans} />
                </div>
              )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer className="justify-content-between">
          <Button variant="outline-secondary" onClick={onHide}>Close</Button>
          {book && isAdmin && (
            <div className="d-flex flex-wrap gap-2">
              {book.isArchived ? (
                <Button variant="outline-secondary" onClick={handleRestore}>Restore</Button>
              ) : (
                <Explain when={onLoan > 0} text={`Cannot ${archiveMode ? 'archive' : 'delete'}: ${onLoan} ${onLoan === 1 ? 'copy is' : 'copies are'} borrowed`}>
                  <Button variant="outline-danger" onClick={() => setConfirmDelete(true)} disabled={onLoan > 0}>
                    {archiveMode ? 'Archive' : 'Delete'}
                  </Button>
                </Explain>
              )}
              <Button variant="outline-secondary" onClick={() => onEdit?.(book)}>
                Edit
              </Button>
              {/* Archived books cannot be lent (restore them first) */}
              {onLend && !book.isArchived && (
                <Explain when={book.availableCopies === 0} text="No copies on the shelf">
                  <Button variant="primary" onClick={() => onLend(book)} disabled={book.availableCopies === 0}>
                    Lend to member
                  </Button>
                </Explain>
              )}
            </div>
          )}
          {book && !isAdmin && onBorrow && (
            <Button variant="primary" onClick={() => onBorrow(book)} disabled={book.availableCopies === 0}>Borrow</Button>
          )}
        </Modal.Footer>
      </Modal>


      <ConfirmModal
        show={confirmDelete}
        title={archiveMode ? 'Archive this book?' : 'Delete this book?'}
        message={book && (archiveMode ? MESSAGES.archiveExplain : `"${book.title}" will be removed from the catalog. This cannot be undone.`)}
        confirmLabel={archiveMode ? 'Archive book' : 'Delete book'}
        confirmVariant={archiveMode ? 'primary' : 'danger'}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(false)}
        loading={deleting}
      />
    </>
  );
}
