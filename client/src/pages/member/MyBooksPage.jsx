import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from 'react-bootstrap';
import { BookOpen, ClipboardList, History, LayoutGrid, List } from 'lucide-react';
import api, { errMsg } from '../../api';
import { useMember, useMemberPage } from '../../context/MemberContext';
import { useToast } from '../../context/ToastContext';
import usePagedList from '../../hooks/usePagedList';
import SegmentedControl from '../../components/SegmentedControl';
import EmptyState from '../../components/EmptyState';
import ConfirmModal from '../../components/ConfirmModal';
import StatusBadge from '../../components/transactions/StatusBadge';
import BookPostCard, { PostSkeleton } from '../../components/member/BookPostCard';
import BookTile, { TileGrid } from '../../components/member/BookTile';
import { expiresText, formatDate, formatDateTime, returnText } from '../../utils/format';
import { MEMBER, REQUEST_STATUS } from '../../utils/labels';

const TABS = [
  { value: 'borrowed', label: 'Borrowed' },
  { value: 'requests', label: 'Requests' },
  { value: 'history', label: 'History' },
];

const Skeletons = () => [0, 1, 2].map((i) => <PostSkeleton key={i} compact />);

// One book of My Books in the chosen view: a compact post (Feed) or a tile (Grid).
// The status badge, dates and actions are the same in both.
function BookItem({ book, badge, children, actions = null }) {
  const { view } = useMember();
  if (view === 'grid') return <BookTile book={book} badge={badge} showRequest={false}>{children}{actions}</BookTile>;
  return <BookPostCard book={book} compact badge={badge} actions={actions}>{children}</BookPostCard>;
}
// Grid view needs the tile grid around the items; Feed view is a plain list
function Items({ children }) {
  const { view } = useMember();
  return view === 'grid' ? <TileGrid>{children}</TileGrid> : <div className="feed-list">{children}</div>;
}
const stopThen = (fn) => (e) => { e.stopPropagation(); fn(); };
const LoadMore = ({ list }) => (list.hasMore && list.items.length > 0 ? (
  <div className="text-center my-3">
    <Button variant="outline-secondary" onClick={list.loadMore} disabled={list.loading}>{list.loading ? 'Loading…' : 'Load more'}</Button>
  </div>
) : null);

// ---------- Borrowed: the books the member has right now ----------
function BorrowedTab() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get('/me/borrowed').then((res) => setRows(res.data.borrowed)).catch((err) => setError(errMsg(err)));
  }, []);
  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!rows) return <Skeletons />;
  const late = rows.filter((r) => r.derivedStatus === 'overdue').length;
  return (
    <>
      {late > 0 && <div className="alert alert-danger" role="alert">{MEMBER.lateAlert(late)}</div>}
      {rows.length === 0 && <div className="panel"><EmptyState icon={BookOpen} title="No borrowed books" text="Request a book from Home and pick it up at the library counter." /></div>}
      <Items>
        {rows.map((r) => (
          <BookItem key={r._id} book={r.book} badge={<StatusBadge status={r.derivedStatus} />}>
            <p className="post-line">Borrowed {formatDateTime(r.borrowedAt)}</p>
            <p className={`post-line ${r.derivedStatus === 'overdue' ? 'text-danger fw-medium' : ''}`}>
              Return date {formatDate(r.dueDate)} · {returnText(r.dueDate)}
            </p>
          </BookItem>
        ))}
      </Items>
    </>
  );
}

// ---------- Requests: every request, with Cancel on pending ones ----------
function RequestsTab({ onBorrowedLink }) {
  const toast = useToast();
  const { refreshSummary, setBookStatus } = useMember();
  const [cancel, setCancel] = useState(null);
  const [busy, setBusy] = useState(false);
  const list = usePagedList(
    (page) => api.get('/me/requests', { params: { page, limit: 10 } }).then((res) => ({ items: res.data.requests, hasMore: res.data.hasMore })),
    'requests'
  );

  const runCancel = async () => {
    setBusy(true);
    try {
      await api.put(`/requests/${cancel._id}/cancel`);
      list.setItems((items) => items.map((r) => (r._id === cancel._id ? { ...r, status: 'cancelled', decidedAt: new Date().toISOString() } : r)));
      if (cancel.book) setBookStatus(cancel.book._id, 'none'); // cards/tiles show "Request" again
      toast.success('Your request was cancelled');
      refreshSummary();
      setCancel(null);
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  if (list.initialLoading) return <Skeletons />;
  return (
    <>
      {list.error && <div className="alert alert-danger">{list.error}</div>}
      {!list.loading && list.items.length === 0 && <div className="panel"><EmptyState icon={ClipboardList} title="No requests yet" text="Open a book and press Request." /></div>}
      <Items>
        {list.items.map((r) => {
          const look = REQUEST_STATUS[r.status];
          return (
            <BookItem key={r._id} book={r.book} badge={<span className={`status-badge ${look.badge}`}>{look.label}</span>}
              actions={r.status === 'pending' ? (
                <Button size="sm" variant="outline-secondary" onClick={stopThen(() => setCancel(r))}>Cancel request</Button>
              ) : null}>
              <p className="post-line">Requested {formatDateTime(r.requestedAt)} <span className="meta mono">· {r.code}</span></p>
              {r.status === 'pending' && <p className="post-line">{expiresText(r.expiresAt)} · {MEMBER.pickUp}</p>}
              {r.status === 'denied' && r.note && <p className="post-note">Librarian&apos;s note: “{r.note}”</p>}
              {r.status === 'approved' && r.transaction && (
                <p className="post-line">
                  Approved · {r.transaction.status === 'borrowed'
                    ? <button type="button" className="btn btn-link btn-sm p-0 align-baseline" onClick={stopThen(onBorrowedLink)}>see it in Borrowed (return by {formatDate(r.transaction.dueDate)})</button>
                    : `returned ${formatDate(r.transaction.returnedAt)}`}
                </p>
              )}
            </BookItem>
          );
        })}
      </Items>
      {list.loading && list.items.length > 0 && <PostSkeleton compact />}
      <LoadMore list={list} />
      <ConfirmModal
        show={!!cancel}
        title="Cancel this request?"
        message={cancel ? `The librarian will no longer prepare '${cancel.book?.title}' for you.` : ''}
        confirmLabel="Cancel request"
        onConfirm={runCancel}
        onCancel={() => setCancel(null)}
        loading={busy}
      />
    </>
  );
}

// ---------- History: everything ever borrowed + a small summary ----------
function HistoryTab() {
  const [summary, setSummary] = useState(null);
  const list = usePagedList(
    (page) => api.get('/me/history', { params: { page, limit: 10 } }).then((res) => {
      if (res.data.summary) setSummary(res.data.summary); // only page 1 sends it
      return { items: res.data.history, hasMore: res.data.hasMore };
    }),
    'history'
  );
  if (list.initialLoading) return <Skeletons />;
  return (
    <>
      {summary && (
        <div className="panel history-summary">
          <div><div className="meta">Borrowed this year</div><div className="num">{summary.borrowedThisYear}</div></div>
          <div><div className="meta">Favourite category</div><div className="num text-truncate">{summary.favouriteCategory || '—'}</div></div>
          <div><div className="meta">On-time returns</div><div className="num">{summary.onTimeRate === null ? '—' : `${summary.onTimeRate}%`}</div></div>
        </div>
      )}
      {list.error && <div className="alert alert-danger">{list.error}</div>}
      {!list.loading && list.items.length === 0 && <div className="panel"><EmptyState icon={History} title="No history yet" text="Books you borrow will be listed here." /></div>}
      <Items>
        {list.items.map((r) => (
          <BookItem key={r._id} book={r.book} badge={<StatusBadge status={r.derivedStatus} />}>
            <p className="post-line">Borrowed {formatDate(r.borrowedAt)} · return date {formatDate(r.dueDate)}</p>
            <p className="post-line">{r.returnedAt ? `Returned ${formatDateTime(r.returnedAt)}` : returnText(r.dueDate)}</p>
          </BookItem>
        ))}
      </Items>
      {list.loading && list.items.length > 0 && <PostSkeleton compact />}
      <LoadMore list={list} />
    </>
  );
}

// "/my-books?tab=borrowed|requests|history" — view only (returns happen at the library counter)
export default function MyBooksPage() {
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.value === params.get('tab')) ? params.get('tab') : 'borrowed';
  const setTab = (v) => setParams((p) => { const n = new URLSearchParams(p); n.set('tab', v); return n; });
  const { view, setView } = useMember();

  // Side columns are in MemberLayout; this page only sets how they look
  useMemberPage({ wide: view === 'grid' });
  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <h1 className="member-page-title mb-0 me-auto">My Books</h1>
        <SegmentedControl label="My Books section" options={TABS} value={tab} onChange={setTab} />
        {/* Feed / Grid, the same remembered choice as Home and Bookmarks */}
        <div className="segmented segmented-icons" role="group" aria-label="Layout">
          <button type="button" className={view === 'feed' ? 'active' : ''} aria-pressed={view === 'feed'} onClick={() => setView('feed')} aria-label="Feed view" title="Feed view"><List size={16} /></button>
          <button type="button" className={view === 'grid' ? 'active' : ''} aria-pressed={view === 'grid'} onClick={() => setView('grid')} aria-label="Grid view" title="Grid view"><LayoutGrid size={16} /></button>
        </div>
      </div>
      {/* key: switching tabs mounts the tab fresh, so it always shows current data */}
      {tab === 'borrowed' && <BorrowedTab key="b" />}
      {tab === 'requests' && <RequestsTab key="r" onBorrowedLink={() => setTab('borrowed')} />}
      {tab === 'history' && <HistoryTab key="h" />}
    </>
  );
}
