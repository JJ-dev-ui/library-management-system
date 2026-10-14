import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Modal, OverlayTrigger, Tooltip } from 'react-bootstrap';
import Skeleton from 'react-loading-skeleton';
import api, { errMsg } from '../../api';
import { useToast } from '../../context/ToastContext';
import Avatar from '../Avatar';
import ConfirmModal from '../ConfirmModal';
import CopyableText from '../CopyableText';
import ZoomableCover from '../books/ZoomableCover';
import BookDetailsModal from '../books/BookDetailsModal';
import StatusBadge from './StatusBadge';
import { formatDate, formatDateTime } from '../../utils/format';
import { levelProps } from '../../utils/modalLevel';
import { MAX_RENEWALS, extendBlockReason, extendMessage, extensionsUsed } from '../../utils/transactions';
import { LATE } from '../../utils/labels';

// Same size as the real content, so the modal does not jump when the data arrives
function TxSkeleton() {
  return (
    <div className="tx-detail" aria-hidden="true">
      <div className="tx-block d-flex gap-3">
        <Skeleton width={120} height={177} borderRadius={8} />
        <div className="flex-grow-1"><Skeleton width="80%" height={22} /><Skeleton width="50%" /><Skeleton count={3} /></div>
      </div>
      <div className="tx-block"><Skeleton circle width={56} height={56} /><Skeleton width="60%" /><Skeleton count={3} /></div>
      <div className="tx-block tx-span"><Skeleton count={4} height={22} /></div>
    </div>
  );
}

// One line of the timeline: label on the left, value (and an optional note) on the right
function Step({ label, value, note, tone }) {
  return (
    <li className="tx-step">
      <span className={`tx-dot ${tone || ''}`} aria-hidden="true" />
      <div className="tx-step-label">{label}</div>
      <div className="tx-step-value">
        {value}
        {note && <div className="cell-sub">{note}</div>}
      </div>
    </li>
  );
}

// Full details of one transaction: book, borrower, timeline, and the Return / Extend actions.
// level: 1 when opened on top of another modal (e.g. from a member's borrowing history).
export default function TransactionDetailsModal({ show, txId, onHide, onChanged, level = 0 }) {
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [pending, setPending] = useState(null); // 'return' | 'renew'
  const [acting, setActing] = useState(false);
  const [showBook, setShowBook] = useState(false);

  useEffect(() => {
    if (!show || !txId) return undefined;
    const ctrl = new AbortController();
    if (reload === 0) setData(null); // first open: skeleton. After an action: keep the old data until the new one arrives
    setError('');
    api.get(`/transactions/${txId}`, { signal: ctrl.signal })
      .then((res) => setData(res.data))
      .catch((err) => { if (err.code !== 'ERR_CANCELED') setError(errMsg(err)); });
    return () => ctrl.abort();
  }, [show, txId, reload]);

  useEffect(() => { if (!show) setReload(0); }, [show]);

  const tx = data?.transaction;
  const out = tx?.status === 'borrowed';
  const used = extensionsUsed(tx); // missing on old transactions -> 0
  const blocked = tx ? extendBlockReason(tx) : null; // reason Extend is disabled (late / maxed), or null

  const runAction = async () => {
    setActing(true);
    try {
      await api.put(`/transactions/${tx._id}/${pending}`);
      toast.success(pending === 'return'
        ? `"${tx.book?.title || 'Book'}" was marked as returned`
        : `Extended: "${tx.book?.title || 'Book'}" now has 7 more days`);
      setPending(null);
      setReload((k) => k + 1);
      onChanged?.();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setActing(false);
    }
  };

  return (
    <>
      <Modal show={show} onHide={onHide} size="xl" fullscreen="sm-down" centered scrollable aria-labelledby="tx-details-title" {...levelProps(level)}>
        <Modal.Header closeButton>
          <Modal.Title id="tx-details-title" className="d-flex flex-wrap align-items-center gap-2">
            Transaction
            {tx && <CopyableText value={tx.code} label="Transaction code" />}
            {tx && <StatusBadge status={tx.derivedStatus} />}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          {!tx && !error && <TxSkeleton />}
          {tx && (
            <div className="tx-detail">
              {/* ---------- Book ---------- */}
              <section className="tx-block" aria-label="Book">
                <div className="section-label">Book</div>
                {tx.book ? (
                  <div className="d-flex gap-3">
                    <ZoomableCover book={tx.book} size="lg" className="cover-preview" />
                    <div className="min-w-0">
                      <h2 className="h5 mb-1">{tx.book.title}</h2>
                      <p className="meta mb-3">by {tx.book.authors?.join(', ')}</p>
                      <dl className="tx-facts">
                        <dt>ISBN</dt><dd><CopyableText value={tx.book.isbn} label="ISBN" /></dd>
                        <dt>Category</dt><dd>{tx.book.category}</dd>
                        <dt>Shelf</dt><dd className="mono">{tx.book.shelfLocation || '—'}</dd>
                      </dl>
                    </div>
                  </div>
                ) : <p className="meta mb-0">This book was deleted from the catalog.</p>}
              </section>

              {/* ---------- Borrower ---------- */}
              <section className="tx-block" aria-label="Borrower">
                <div className="section-label">Borrower</div>
                {tx.user ? (
                  <>
                    <div className="d-flex align-items-center gap-3 mb-3">
                      <Avatar name={tx.user.name} avatarKey={tx.user.avatarKey} size="lg" />
                      <div className="min-w-0">
                        <div className="fw-semibold text-truncate">{tx.user.name}</div>
                        <div className="cell-sub mono">{tx.user.memberId || '—'}</div>
                      </div>
                    </div>
                    <dl className="tx-facts">
                      <dt>Email</dt><dd className="text-break">{tx.user.email}</dd>
                      <dt>Contact</dt><dd>{tx.user.contactNumber || '—'}</dd>
                      <dt>Borrowing now</dt><dd>{data.borrowerActive} {data.borrowerActive === 1 ? 'book' : 'books'}</dd>
                    </dl>
                  </>
                ) : <p className="meta mb-0">This account was deleted.</p>}
              </section>

              {/* ---------- Timeline ---------- */}
              <section className="tx-block tx-span" aria-label="Timeline">
                <div className="section-label">Timeline</div>
                <ol className="tx-timeline">
                  <Step label="Borrowed" value={formatDateTime(tx.borrowedAt)} note={tx.processedBy ? `Processed by ${tx.processedBy.name}` : null} tone="done" />
                  <Step label="Extended" value={used > 0 ? `${used} of ${MAX_RENEWALS} times (+7 days each)` : 'Not extended'} tone={used > 0 ? 'done' : ''} />
                  <Step label="Return date" value={formatDate(tx.dueDate)} tone={out && data.daysLate > 0 ? 'late' : ''} />
                  <Step
                    label="Returned"
                    value={out ? 'Not returned yet' : formatDateTime(tx.returnedAt)}
                    note={data.daysLate > 0 ? LATE.days(data.daysLate) : (!out ? 'On time' : null)}
                    tone={out ? (data.daysLate > 0 ? 'late' : '') : 'done'}
                  />
                </ol>
              </section>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer className="justify-content-between">
          <Button variant="outline-secondary" onClick={onHide}>Close</Button>
          {tx && (
            <div className="d-flex flex-wrap gap-2">
              {tx.book && (
                <Button variant="outline-secondary" onClick={() => setShowBook(true)}>
                  View book
                </Button>
              )}
              {out && (
                <>
                  {/* Disabled buttons get no mouse events: the tooltip sits on a focusable wrapper */}
                  <OverlayTrigger overlay={<Tooltip>{blocked || 'Add 7 days to the return date'}</Tooltip>}>
                    <span className="d-inline-block" tabIndex={blocked ? 0 : -1} aria-label={blocked || undefined}>
                      <Button variant="outline-secondary" onClick={() => setPending('renew')} disabled={!!blocked}>
                        Extend
                      </Button>
                    </span>
                  </OverlayTrigger>
                  <Button variant="primary" onClick={() => setPending('return')}>
                    Mark returned
                  </Button>
                </>
              )}
            </div>
          )}
        </Modal.Footer>
      </Modal>

      <ConfirmModal
        show={!!pending}
        title={pending === 'return' ? 'Mark as returned?' : 'Extend this book?'}
        message={tx && (pending === 'return'
          ? `"${tx.book?.title || 'This book'}" from ${tx.user?.name || 'this member'} goes back on the shelf.`
          : extendMessage(tx, formatDate))}
        confirmLabel={pending === 'return' ? 'Mark returned' : 'Extend'}
        confirmVariant="primary"
        onConfirm={runAction}
        onCancel={() => setPending(null)}
        loading={acting}
      />

      {/* "View book" opens the book details one layer above this modal */}
      {tx?.book && (
        <BookDetailsModal show={showBook} bookId={tx.book._id} onHide={() => setShowBook(false)} level={level + 1}
          onEdit={() => navigate(`/admin/books/${tx.book._id}/edit`)}
          onDeleted={() => { setShowBook(false); onHide(); onChanged?.(); }} />
      )}
    </>
  );
}

