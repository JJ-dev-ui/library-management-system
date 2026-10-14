import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { BookMarked, BookmarkCheck, SearchX } from 'lucide-react';
import api from '../../api';
import { useMember, useMemberPage } from '../../context/MemberContext';
import { useToast } from '../../context/ToastContext';
import usePagedList, { useSentinel } from '../../hooks/usePagedList';
import EmptyState from '../../components/EmptyState';
import MemberFilterBar, { useMemberFilters } from '../../components/member/MemberFilters';
import BookPostCard, { PostSkeleton, RequestAction } from '../../components/member/BookPostCard';
import BookTile, { TileGrid, TileSkeleton } from '../../components/member/BookTile';
import BackToTop from '../../components/member/BackToTop';

const LEAVE_MS = 260; // length of the fade-out animation (member.css .is-leaving)

// "/bookmarks" — the member's saved books with the same filters, sort and Feed/Grid views as Home.
// Removing one (the bookmark icon) fades the card out and offers "Undo" in the toast.
export default function BookmarksPage() {
  const toast = useToast();
  const filters = useMemberFilters();
  const { isBookmarked, toggleBookmark, view } = useMember();
  const grid = view === 'grid';
  const [leaving, setLeaving] = useState(() => new Set()); // ids fading out right now
  const list = usePagedList(
    (page) => api.get('/me/bookmarks', { params: { page, limit: 10, ...filters.apiParams } })
      .then((res) => ({ items: res.data.books, hasMore: res.data.hasMore })),
    `bookmarks|${filters.key}`
  );
  const sentinel = useSentinel(list.loadMore, list.hasMore && !list.loading && !list.error, list.items.length);
  const filtered = Object.keys(filters.apiParams).some((k) => k !== 'sort');

  // Removing from the Bookmarks page: animate out, then offer Undo
  const remove = async (book) => {
    const index = list.items.findIndex((b) => b._id === book._id);
    setLeaving((s) => new Set(s).add(book._id));
    const stillSaved = await toggleBookmark(book, { silent: true });
    const unmark = () => setLeaving((s) => { const n = new Set(s); n.delete(book._id); return n; });
    if (stillSaved) { unmark(); return; } // the server said no
    setTimeout(() => { list.setItems((items) => items.filter((b) => b._id !== book._id)); unmark(); }, LEAVE_MS);
    toast.success('Removed from your bookmarks', {
      id: 'bookmark',
      action: {
        label: 'Undo',
        onClick: async () => {
          if (await toggleBookmark(book, { silent: true })) {
            // Put the card back where it was
            list.setItems((items) => (items.some((b) => b._id === book._id) ? items : [...items.slice(0, index), book, ...items.slice(index)]));
          }
        },
      },
    });
  };

  // A bookmark removed elsewhere (the icon on a card, or the book modal) disappears here too —
  // with the fade-out when it was removed on this page
  const visible = list.items.filter((b) => isBookmarked(b) || leaving.has(b._id));
  // On this page the header icon removes WITH the animation + Undo
  const removeIcon = (b) => (
    <OverlayTrigger overlay={<Tooltip>Remove bookmark</Tooltip>}>
      <button type="button" className="btn btn-icon bookmark-toggle is-on" aria-pressed="true" aria-label="Remove bookmark" onClick={(e) => { e.stopPropagation(); remove(b); }}>
        <BookmarkCheck size={18} />
      </button>
    </OverlayTrigger>
  );

  // Side columns are in MemberLayout; this page only sets how they look
  useMemberPage({ wide: grid });
  return (
    <>
      <h1 className="member-page-title">Bookmarks</h1>
      <MemberFilterBar filters={filters} recommendedLabel="Recently saved" />
      {grid ? (
        <TileGrid>
          {visible.map((b) => <BookTile key={b._id} book={b} />)}
          {list.loading && Array.from({ length: 5 }, (_, i) => <TileSkeleton key={`s${i}`} />)}
        </TileGrid>
      ) : (
        <div className="feed-list">
          {visible.map((b) => <BookPostCard key={b._id} book={b} leaving={leaving.has(b._id)} badge={removeIcon(b)} actions={<RequestAction book={b} />} />)}
          {list.loading && Array.from({ length: visible.length ? 1 : 3 }, (_, i) => <PostSkeleton key={`s${i}`} />)}
        </div>
      )}
      {list.error && (
        <div className="alert alert-danger d-flex align-items-center justify-content-between gap-2">
          {list.error} <Button size="sm" variant="outline-danger" onClick={list.retry}>Try again</Button>
        </div>
      )}
      {!list.loading && !list.error && visible.length === 0 && (
        <div className="panel">
          {filtered ? (
            <EmptyState icon={SearchX} title="No saved books match" text="Try other filters.">
              <Button variant="outline-secondary" size="sm" onClick={filters.clear}>Clear all filters</Button>
            </EmptyState>
          ) : (
            <EmptyState icon={BookMarked} title="No bookmarks yet" text="Use the bookmark icon on any book to save it for later.">
              <Link to="/" className="btn btn-primary btn-sm">Browse books</Link>
            </EmptyState>
          )}
        </div>
      )}
      {!list.hasMore && visible.length > 0 && <p className="feed-end">That&apos;s everything you saved</p>}
      <div ref={sentinel} aria-hidden="true" />
      <BackToTop />
    </>
  );
}
