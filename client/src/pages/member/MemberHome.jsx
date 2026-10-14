import { useEffect, useState } from 'react';
import { Button } from 'react-bootstrap';
import { BookX, SearchX } from 'lucide-react';
import api from '../../api';
import { useMember, useMemberPage } from '../../context/MemberContext';
import usePagedList, { useSentinel } from '../../hooks/usePagedList';
import EmptyState from '../../components/EmptyState';
import MemberFilterBar, { useMemberFilters } from '../../components/member/MemberFilters';
import BookPostCard, { PostSkeleton } from '../../components/member/BookPostCard';
import BookTile, { TileGrid, TileSkeleton } from '../../components/member/BookTile';
import BackToTop from '../../components/member/BackToTop';

const PAGE_SIZE = 10;
// The server sorts by (feedRank + seed) mod 1,000,003: a new seed = a new shuffle
const newSeed = () => Math.floor(Math.random() * 1000003);

// "/" — the member Home feed: book "posts" (or a grid of tiles) with infinite scroll.
// Filters, search (?q=) and sort live in the URL. "Recommended" without a search = shuffled per visit.
export default function MemberHome() {
  const filters = useMemberFilters();
  const { homeNonce, view } = useMember();
  const grid = view === 'grid';
  const [seed, setSeed] = useState(newSeed);                          // a new one on every page load...
  useEffect(() => { if (homeNonce) setSeed(newSeed()); }, [homeNonce]); // ...and when Home is clicked on Home

  // New search / filter / sort / shuffle -> start again from page 1 (and from the top of the page)
  const resetKey = `${seed}|${filters.key}`;
  useEffect(() => { window.scrollTo({ top: 0 }); }, [resetKey]);

  const list = usePagedList(
    (page) => api.get('/feed', { params: { seed, page, limit: PAGE_SIZE, ...filters.apiParams } })
      .then((res) => ({ items: res.data.books, hasMore: res.data.hasMore })),
    resetKey
  );
  // Infinite scroll: the empty element after the last item loads the next 10 when it nears the screen
  const sentinel = useSentinel(list.loadMore, list.hasMore && !list.loading && !list.error, list.items.length);
  const filtered = Object.keys(filters.apiParams).some((k) => k !== 'sort');

  const skeletons = grid
    ? Array.from({ length: list.items.length ? 5 : 10 }, (_, i) => <TileSkeleton key={`s${i}`} />)
    : Array.from({ length: list.items.length ? 2 : 3 }, (_, i) => <PostSkeleton key={`s${i}`} />);

  // Side columns are in MemberLayout; this page only sets how they look
  useMemberPage({ wide: grid, home: true });
  return (
    <>
      <MemberFilterBar filters={filters} />

      {grid ? (
        <TileGrid>
          {list.items.map((b) => <BookTile key={b._id} book={b} />)}
          {list.loading && skeletons}
        </TileGrid>
      ) : (
        <div className="feed-list">
          {list.items.map((b) => <BookPostCard key={b._id} book={b} />)}
          {list.loading && skeletons}
        </div>
      )}

      {list.error && (
        <div className="alert alert-danger d-flex align-items-center justify-content-between gap-2">
          {list.error} <Button size="sm" variant="outline-danger" onClick={list.retry}>Try again</Button>
        </div>
      )}
      {!list.loading && !list.error && list.items.length === 0 && (
        filtered
          ? <div className="panel"><EmptyState icon={SearchX} title="No books found" text="Try another search word or remove some filters.">
            <Button variant="outline-secondary" size="sm" onClick={filters.clear}>Clear all filters</Button>
          </EmptyState></div>
          : <div className="panel"><EmptyState icon={BookX} title="No books yet" text="The catalog is empty." /></div>
      )}
      {!list.hasMore && list.items.length > 0 && <p className="feed-end">You&apos;re all caught up</p>}
      <div ref={sentinel} aria-hidden="true" />
      <BackToTop />
    </>
  );
}
