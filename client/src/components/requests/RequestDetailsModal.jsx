import { useEffect, useState } from 'react';
import { Button, Modal, OverlayTrigger, Tooltip } from 'react-bootstrap';
import api, { errMsg } from '../../api';
import Avatar from '../Avatar';
import CopyableText from '../CopyableText';
import BookCover from '../books/BookCover';
import DetailSkeleton from '../skeletons/DetailSkeleton';
import TransactionDetailsModal from '../transactions/TransactionDetailsModal';
import { expiresText, formatDateTime, formatDate } from '../../utils/format';
import { REQUEST_STATUS } from '../../utils/labels';

// Status badge of a borrow request
export function RequestStatusBadge({ status }) {
  const look = REQUEST_STATUS[status] || { label: status, badge: 'badge-neutral' };
  return <span className={`status-badge ${look.badge}`}>{look.label}</span>;
}

// One line of the timeline
const Step = ({ label, value, note, tone }) => (
  <li className="tx-step">
    <span className={`tx-dot ${tone || ''}`} aria-hidden="true" />
    <div className="tx-step-label">{label}</div>
    <div className="tx-step-value">{value}{note && <div className="cell-sub">{note}</div>}</div>
  </li>
);

// Details of one request (admin): member, book, timeline, the denial note and the transaction it created.
// onApprove / onDeny: the same actions as on the table row (only for pending requests).
export default function RequestDetailsModal({ requestId, onHide, onApprove, onDeny, reloadKey = 0 }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [txId, setTxId] = useState(null);

  useEffect(() => {
    if (!requestId) return undefined;
    const ctrl = new AbortController();
    setData(null); setError('');
    api.get(`/requests/${requestId}`, { signal: ctrl.signal })
      .then((res) => setData(res.data.request))
      .catch((err) => { if (err.code !== 'ERR_CANCELED') setError(errMsg(err)); });
    return () => ctrl.abort();
  }, [requestId, reloadKey]);

  const r = data;
  const decidedLabel = { approved: 'Approved', denied: 'Denied', cancelled: 'Cancelled by the member', expired: 'Expired (not picked up)' };

  return (
    <>
      <Modal show={!!requestId} onHide={onHide} size="lg" fullscreen="sm-down" centered scrollable aria-labelledby="rq-title">
        <Modal.Header closeButton>
          <Modal.Title id="rq-title" className="d-flex flex-wrap align-items-center gap-2 h5">
            Request {r && <CopyableText value={r.code} label="Request code" />} {r && <RequestStatusBadge status={r.status} />}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <div className="alert alert-danger">{error}</div>}
          {!r && !error && <DetailSkeleton variant="profile" />}
          {r && (
            <div className="tx-detail">
              <section className="tx-block" aria-label="Member">
                <div className="section-label">Member</div>
                <div className="d-flex align-items-center gap-3 mb-2">
                  <Avatar name={r.user?.name || '?'} avatarKey={r.user?.avatarKey} size="lg" />
                  <div className="min-w-0">
                    <div className="fw-semibold text-truncate">{r.user?.name || 'Deleted account'}</div>
                    <div className="cell-sub mono">{r.user?.memberId || '—'}</div>
                  </div>
                </div>
                <dl className="tx-facts">
                  <dt>Email</dt><dd className="text-break">{r.user?.email || '—'}</dd>
                  <dt>Contact</dt><dd>{r.user?.contactNumber || '—'}</dd>
                </dl>
              </section>
              <section className="tx-block" aria-label="Book">
                <div className="section-label">Book</div>
                {r.book ? (
                  <div className="d-flex gap-3">
                    <BookCover book={r.book} size="lg" className="cover-preview" />
                    <div className="min-w-0">
                      <div className="fw-semibold">{r.book.title}</div>
                      <div className="cell-sub mb-2">{r.book.authors?.join(', ')}</div>
                      <dl className="tx-facts">
                        <dt>ISBN</dt><dd><CopyableText value={r.book.isbn} label="ISBN" /></dd>
                        <dt>Shelf</dt><dd className="mono">{r.book.shelfLocation || '—'}</dd>
                        <dt>On the shelf</dt><dd>{r.book.availableCopies} of {r.book.totalCopies}{r.book.isArchived ? ' · archived' : ''}</dd>
                      </dl>
                    </div>
                  </div>
                ) : <p className="meta mb-0">This book was deleted from the catalog.</p>}
              </section>
              <section className="tx-block tx-span" aria-label="Timeline">
                <div className="section-label">Timeline</div>
                <ol className="tx-timeline">
                  <Step label="Requested" value={formatDateTime(r.requestedAt)} tone="done" />
                  {r.status === 'pending'
                    ? <Step label="Expires" value={formatDateTime(r.expiresAt)} note={expiresText(r.expiresAt)} />
                    : <Step label={decidedLabel[r.status]} value={formatDateTime(r.decidedAt)}
                      note={r.decidedBy && r.status !== 'cancelled' ? `By ${r.decidedBy.name}` : null}
                      tone={r.status === 'approved' ? 'done' : r.status === 'denied' ? 'late' : ''} />}
                  {r.transaction && (
                    <Step label="Transaction" tone="done" value={
                      <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={() => setTxId(r.transaction._id)}>
                        {r.transaction.code}
                      </button>
                    } note={`Return date ${formatDate(r.transaction.dueDate)}`} />
                  )}
                </ol>
                {r.note && <p className="mt-3 mb-0"><span className="meta">Note to the member:</span> “{r.note}”</p>}
              </section>
            </div>
          )}
        </Modal.Body>
        <Modal.Footer className="justify-content-between">
          <Button variant="outline-secondary" onClick={onHide}>Close</Button>
          {r?.status === 'pending' && (
            <div className="d-flex gap-2">
              <Button variant="outline-danger" onClick={() => onDeny(r)}>Deny</Button>
              <OverlayTrigger overlay={<Tooltip>{r.approval?.ok ? 'Hand the book over now' : r.approval?.message}</Tooltip>}>
                <span className="d-inline-block" tabIndex={r.approval?.ok ? -1 : 0}>
                  <Button variant="primary" onClick={() => onApprove(r)} disabled={!r.approval?.ok}>Approve</Button>
                </span>
              </OverlayTrigger>
            </div>
          )}
        </Modal.Footer>
      </Modal>
      <TransactionDetailsModal show={!!txId} txId={txId} level={1} onHide={() => setTxId(null)} />
    </>
  );
}
