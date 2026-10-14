import { useEffect, useState } from 'react';
import { Button, Form, Modal, OverlayTrigger, Tooltip } from 'react-bootstrap';
import Skeleton from 'react-loading-skeleton';
import { Search } from 'lucide-react';
import api, { errMsg } from '../../api';
import useDebounce from '../../hooks/useDebounce';
import { useToast } from '../../context/ToastContext';
import Avatar from '../Avatar';
import BookCover from '../books/BookCover';
import LoadingButton from '../LoadingButton';
import { formatDate, formatDateTime } from '../../utils/format';
import { LOAN_DAYS, MAX_ACTIVE_LOANS } from '../../utils/transactions';
import { LATE, MESSAGES } from '../../utils/labels';

const PICKER_SIZE = 6;

// Loads picker results whenever the (debounced) search text changes
function usePickerSearch(enabled, url, buildParams, text) {
  const q = useDebounce(text, 300);
  const [state, setState] = useState({ items: [], loading: true });
  useEffect(() => {
    if (!enabled) return undefined;
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    api.get(url, { params: buildParams(q.trim()), signal: ctrl.signal })
      .then((res) => setState({ items: res.data.users || res.data.books || [], loading: false }))
      .catch((err) => { if (err.code !== 'ERR_CANCELED') setState({ items: [], loading: false }); });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, url, q]);
  return state;
}

// Same height as a real picker row, so the list does not jump while results load
const PickerSkeleton = () => Array.from({ length: 3 }, (_, i) => (
  <div key={i} className="picker-item" aria-hidden="true">
    <Skeleton circle width={36} height={36} />
    <div className="flex-grow-1"><Skeleton width="50%" /><Skeleton width="30%" height={12} /></div>
  </div>
));

// "Lend to member": pick an active member and an available book, then create the transaction.
// presetBook: open with a book already chosen (from the book details modal).
// stacked: true when opened on top of another modal.
export default function LendModal({ show, onHide, presetBook = null, onLent, stacked = false }) {
  const toast = useToast();
  const [member, setMember] = useState(null);
  const [book, setBook] = useState(presetBook);
  const [memberText, setMemberText] = useState('');
  const [bookText, setBookText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Fresh form every time the modal opens
  useEffect(() => {
    if (!show) return;
    setMember(null);
    setBook(presetBook);
    setMemberText('');
    setBookText('');
    setError('');
  }, [show, presetBook]);

  const members = usePickerSearch(show && !member, '/users', (q) => ({
    search: q || undefined, role: 'member', status: 'active', sort: 'name', limit: PICKER_SIZE,
  }), memberText);
  const books = usePickerSearch(show && !book, '/books', (q) => ({
    search: q || undefined, availability: 'available', sort: 'title', limit: PICKER_SIZE,
  }), bookText);

  // Preview of what the server will save: borrowed = now, return date = END of the 14th day
  const now = new Date();
  const dueDate = new Date(now);
  dueDate.setDate(dueDate.getDate() + LOAN_DAYS);
  dueDate.setHours(23, 59, 59, 999);

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/transactions', { bookId: book._id, userId: member._id });
      // The toast uses the dates the SERVER saved, so it shows exactly what is in the database
      const tx = res.data.transaction;
      toast.success(`"${book.title}" was lent to ${member.name}. Borrowed ${formatDateTime(tx.borrowedAt)} · return by ${formatDate(tx.dueDate)}`);
      onLent?.(res.data.transaction);
      onHide();
    } catch (err) {
      setError(errMsg(err));
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const stackProps = stacked ? { className: 'modal-stacked', backdropClassName: 'modal-backdrop-stacked' } : {};

  return (
    <Modal show={show} onHide={saving ? undefined : onHide} size="lg" fullscreen="sm-down" centered scrollable aria-labelledby="lend-title" {...stackProps}>
      <Modal.Header closeButton={!saving}>
        <Modal.Title id="lend-title">{presetBook ? 'Lend to member' : 'New transaction'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <div className="alert alert-danger" role="alert">{error}</div>}

        {/* ---------- Member ---------- */}
        <div className="section-label">1. Member</div>
        {member ? (
          <div className="picker-selected mb-4">
            <Avatar name={member.name} avatarKey={member.avatarKey} />
            <div className="min-w-0 flex-grow-1">
              <div className="cell-title text-truncate">{member.name}</div>
              <div className="cell-sub text-truncate">{member.memberId} · {member.email}</div>
            </div>
            <Button variant="link" size="sm" onClick={() => setMember(null)} disabled={saving}>Change</Button>
          </div>
        ) : (
          <div className="mb-4">
            <div className="input-group mb-2">
              <span className="input-group-text"><Search size={16} aria-hidden="true" /></span>
              <Form.Control type="search" placeholder="Search active members by name, email or member ID" aria-label="Search members"
                value={memberText} onChange={(e) => setMemberText(e.target.value)} maxLength={100} />
            </div>
            <div className="picker-list" role="listbox" aria-label="Members">
              {members.loading ? <PickerSkeleton /> : members.items.length === 0 ? (
                <p className="meta text-center my-3">No active members found.</p>
              ) : members.items.map((m) => {
                const full = m.activeLoans >= MAX_ACTIVE_LOANS;
                const late = m.overdueLoans > 0; // the server refuses lending while a book is late
                const reason = late ? MESSAGES.hasLateBooks(m.overdueLoans)
                  : full ? `Already has ${MAX_ACTIVE_LOANS} borrowed books (the maximum).` : null;
                const row = (
                  <button key={m._id} type="button" className="picker-item" onClick={() => setMember(m)} disabled={!!reason} role="option" aria-selected="false">
                    <Avatar name={m.name} avatarKey={m.avatarKey} />
                    <div className="min-w-0 flex-grow-1">
                      <div className="cell-title text-truncate">{m.name}</div>
                      <div className="cell-sub text-truncate">{m.memberId} · {m.email}</div>
                    </div>
                    {late
                      ? <span className="status-badge badge-danger">{LATE.hasLate}</span>
                      : <span className={`status-badge ${full ? 'badge-danger' : 'badge-neutral'}`}>{m.activeLoans}/{MAX_ACTIVE_LOANS} books</span>}
                  </button>
                );
                if (!reason) return row;
                // Cannot be chosen: the focusable wrapper shows WHY in a tooltip (also for keyboard users)
                return (
                  <OverlayTrigger key={m._id} overlay={<Tooltip>{reason}</Tooltip>}>
                    <div className="picker-item-wrap" tabIndex={0} aria-label={`${m.name}: ${reason}`}>{row}</div>
                  </OverlayTrigger>
                );
              })}
            </div>
          </div>
        )}

        {/* ---------- Book ---------- */}
        <div className="section-label">2. Book</div>
        {book ? (
          <div className="picker-selected">
            <BookCover book={book} size="sm" />
            <div className="min-w-0 flex-grow-1">
              <div className="cell-title text-truncate">{book.title}</div>
              <div className="cell-sub text-truncate">{book.authors?.join(', ')} · {book.availableCopies} available</div>
            </div>
            {!presetBook && <Button variant="link" size="sm" onClick={() => setBook(null)} disabled={saving}>Change</Button>}
          </div>
        ) : (
          <div>
            <div className="input-group mb-2">
              <span className="input-group-text"><Search size={16} aria-hidden="true" /></span>
              <Form.Control type="search" placeholder="Search available books by title, author or ISBN" aria-label="Search books"
                value={bookText} onChange={(e) => setBookText(e.target.value)} maxLength={100} />
            </div>
            <div className="picker-list" role="listbox" aria-label="Books">
              {books.loading ? <PickerSkeleton /> : books.items.length === 0 ? (
                <p className="meta text-center my-3">No available books found.</p>
              ) : books.items.map((b) => (
                <button key={b._id} type="button" className="picker-item" onClick={() => setBook(b)} role="option" aria-selected="false">
                  <BookCover book={b} size="sm" />
                  <div className="min-w-0 flex-grow-1">
                    <div className="cell-title text-truncate">{b.title}</div>
                    <div className="cell-sub text-truncate">{b.authors?.join(', ')}</div>
                  </div>
                  <span className="status-badge badge-success">{b.availableCopies} available</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {member && book && (
          <div className="alert alert-info mt-4 mb-0">
            Borrowed <strong>{formatDateTime(now)}</strong> · Return by <strong>{formatDate(dueDate)}</strong> ({LOAN_DAYS} days).
            Can be extended up to 2 times, 7 days each.
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={saving}>Cancel</Button>
        <LoadingButton variant="primary" onClick={submit} loading={saving} loadingText="Lending..." disabled={!member || !book}>
          Lend book
        </LoadingButton>
      </Modal.Footer>
    </Modal>
  );
}
