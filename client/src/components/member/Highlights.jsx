import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Skeleton from 'react-loading-skeleton';
import { BookOpen, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import SegmentedControl from '../SegmentedControl';
import EmptyState from '../EmptyState';
import Avatar from '../Avatar';
import BookCover from '../books/BookCover';
import { useAuth } from '../../context/AuthContext';
import { useMember } from '../../context/MemberContext';
import { getHighlights } from '../../utils/highlights';
import { addedAgo } from '../../utils/format';

const NEW_RANGES = [{ value: '7', label: '7 days' }, { value: '30', label: '30 days' }];
const POPULAR_RANGES = [{ value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }];

// Loads one list of the highlights for the chosen range (shared request, see utils/highlights.js)
function useHighlightList(key, newRange, popularRange) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let alive = true;
    setItems(null);
    getHighlights(newRange, popularRange)
      .then((data) => { if (alive) setItems(data[key]); })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [key, newRange, popularRange]);
  return items;
}

const RowsSkeleton = ({ n }) => Array.from({ length: n }, (_, i) => (
  <div key={i} className="hl-row" aria-hidden="true">
    <Skeleton width={40} height={58} />
    <div className="flex-grow-1 min-w-0"><Skeleton width="80%" /><Skeleton width="50%" height={12} /></div>
  </div>
));

// One clickable row: small cover, title (2 lines), authors (1 line), a muted line
function HighlightRow({ book, rank, sub }) {
  const { openBook } = useMember();
  return (
    <button type="button" className="hl-row" onClick={() => openBook(book._id)}>
      {rank && <span className="hl-rank" aria-hidden="true">{rank}</span>}
      <BookCover book={book} />
      <span className="hl-text">
        <span className="hl-title">{book.title}</span>
        <span className="hl-sub text-truncate">{book.authors?.join(', ')}</span>
        <span className="hl-sub">{sub}</span>
      </span>
    </button>
  );
}

// Card header: title on the left, the period toggle on the SAME line (it never wraps or clips)
const CardHead = ({ id, title, children }) => (
  <div className="hl-head">
    <h2 id={id} className="hl-heading">{title}</h2>
    {children}
  </div>
);

// LEFT column: "New arrivals" (last 7 / 30 days), up to 6 books
export function NewArrivals() {
  const [range, setRange] = useState('7');
  const items = useHighlightList('newArrivals', range, 'week');
  return (
    <section className="panel hl-card" aria-labelledby="hl-new">
      <CardHead id="hl-new" title="New arrivals">
        <SegmentedControl label="New arrivals period" options={NEW_RANGES} value={range} onChange={setRange} />
      </CardHead>
      {items === null ? <RowsSkeleton n={4} /> : items.length === 0 ? (
        <EmptyState icon={Sparkles} title={`No new books in the last ${range} days`} />
      ) : items.map((b) => <HighlightRow key={b._id} book={b} sub={addedAgo(b.createdAt)} />)}
    </section>
  );
}

// RIGHT column: "Most borrowed" (this week / this month), top 5
export function MostBorrowed() {
  const [range, setRange] = useState('week');
  const items = useHighlightList('mostBorrowed', '7', range);
  return (
    <section className="panel hl-card" aria-labelledby="hl-popular">
      <CardHead id="hl-popular" title="Most borrowed">
        <SegmentedControl label="Most borrowed period" options={POPULAR_RANGES} value={range} onChange={setRange} />
      </CardHead>
      {items === null ? <RowsSkeleton n={5} /> : items.length === 0 ? (
        <EmptyState icon={BookOpen} title="No borrowings yet in this period" />
      ) : items.map((b, i) => <HighlightRow key={b._id} book={b} rank={i + 1} sub={`${b.borrows} ${b.borrows === 1 ? 'borrow' : 'borrows'}`} />)}
    </section>
  );
}

// The 3 numbers of the profile utility. "To return" = due soon + late (red when anything is late).
function profileNumbers(summary) {
  if (!summary) return null;
  return [
    { label: 'Completed', value: summary.completedCount },
    { label: 'Borrowed now', value: summary.borrowedNow },
    { label: 'To return', value: summary.dueSoon + summary.late, danger: summary.late > 0 },
  ];
}

// RIGHT column, top: the member's own profile at a glance
export function ProfileCard() {
  const { user } = useAuth();
  const { summary } = useMember();
  const numbers = profileNumbers(summary);
  return (
    <section className="panel hl-card" aria-label="Your profile">
      <div className="profile-mini">
        <Avatar name={user.name} avatarKey={user.avatarKey} size="lg" />
        <div className="min-w-0">
          <div className="fw-semibold text-truncate">{user.name}</div>
          <div className="meta text-truncate">{user.email}</div>
        </div>
      </div>
      <div className="profile-stats">
        {numbers ? numbers.map((n) => (
          <div key={n.label}>
            <div className={`num ${n.danger ? 'text-danger' : ''}`}>{n.value}</div>
            <div className="meta">{n.label}</div>
          </div>
        )) : <Skeleton count={2} />}
      </div>
      <Link to="/my-books" className="hl-link">View my books</Link>
    </section>
  );
}

// Horizontal carousel of compact book chips (grid view, tablets and phones).
// No scrollbar: the ‹ › buttons slide it smoothly by about one screen-width of chips (scrollBy with
// behavior: 'smooth'); touch screens can also swipe. Soft fades on the edges show there is more.
// The buttons hide at the start / end (updated on scroll and when the size changes).
function Strip({ title, items, sub, rank = false }) {
  const { openBook } = useMember();
  const ref = useRef(null);
  const [edges, setEdges] = useState({ start: true, end: true });

  const update = () => {
    const el = ref.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 2, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 });
  };
  useEffect(() => {
    update();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items]);
  const slide = (dir) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  return (
    <section className="hl-strip" aria-label={title}>
      <div className="hl-strip-head">
        <h2 className="hl-heading">{title}</h2>
        <div className="d-flex gap-1">
          <button type="button" className="strip-arrow" onClick={() => slide(-1)} disabled={edges.start} aria-label={`Previous ${title}`}><ChevronLeft size={18} /></button>
          <button type="button" className="strip-arrow" onClick={() => slide(1)} disabled={edges.end} aria-label={`Next ${title}`}><ChevronRight size={18} /></button>
        </div>
      </div>
      <div className={`hl-strip-viewport ${edges.start ? '' : 'fade-start'} ${edges.end ? '' : 'fade-end'}`}>
        <div className="hl-strip-row" ref={ref} onScroll={update}>
          {items === null ? <Skeleton width={260} height={70} /> : items.length === 0 ? <span className="meta">Nothing yet.</span> : items.map((b, i) => (
            // --i: a small stagger, so the chips glide in one after another
            <button key={b._id} type="button" className="hl-chip" style={{ '--i': i }} onClick={() => openBook(b._id)}>
              {rank && <span className="hl-rank" aria-hidden="true">{i + 1}</span>}
              <BookCover book={b} />
              <span className="hl-text"><span className="hl-title">{b.title}</span><span className="hl-sub">{sub(b)}</span></span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export function NewArrivalsStrip() {
  const items = useHighlightList('newArrivals', '30', 'week');
  return <Strip title="New arrivals" items={items} sub={(b) => addedAgo(b.createdAt)} />;
}

// Phones / small tablets, Home only: profile numbers + both lists as compact strips above the feed
function MobileHighlights() {
  const { summary } = useMember();
  const popular = useHighlightList('mostBorrowed', '30', 'month');
  const numbers = profileNumbers(summary);
  return (
    <div className="d-lg-none mb-3">
      {numbers && (
        <Link to="/my-books" className="profile-strip">
          {numbers.map((n) => (
            <span key={n.label}><strong className={`num ${n.danger ? 'text-danger' : ''}`}>{n.value}</strong> <span className="meta">{n.label}</span></span>
          ))}
        </Link>
      )}
      <NewArrivalsStrip />
      <Strip title="Most borrowed this month" items={popular} rank sub={(b) => `${b.borrows} ${b.borrows === 1 ? 'borrow' : 'borrows'}`} />
    </div>
  );
}

// The Facebook-like page body used by Home, Bookmarks, My Books and Profile:
//   ≥1200px: New arrivals | center | Profile + Most borrowed
//   992–1199px: no left column; New arrivals becomes a strip above the center
//   <992px: center only; Home (home prop) shows compact strips above the feed
//   wide (grid view): the left column slides away, the center grows into its space, and the New
//   arrivals strip folds open above the grid. Both stay MOUNTED, so CSS can animate the change in
//   both directions (see .member-columns in member.css). inert: a hidden part cannot get keyboard focus.
export default function MemberColumns({ children, home = false, wide = false }) {
  return (
    <div className={`member-columns ${wide ? 'is-wide' : ''}`}>
      <aside className="member-col member-col-left" aria-label="New arrivals" aria-hidden={wide || undefined} inert={wide ? '' : undefined}>
        <div className="member-sticky"><NewArrivals /></div>
      </aside>
      <div className="member-col member-col-center">
        {/* Closed = visibility: hidden in CSS, so it is also hidden from screen readers and Tab */}
        <div className="strip-reveal">
          <div className="strip-reveal-inner"><NewArrivalsStrip /></div>
        </div>
        {home && <MobileHighlights />}
        {children}
      </div>
      <aside className="member-col member-col-right d-none d-lg-block" aria-label="Your profile and highlights">
        <div className="member-sticky">
          <ProfileCard />
          <MostBorrowed />
        </div>
      </aside>
    </div>
  );
}
