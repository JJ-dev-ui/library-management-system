import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Dropdown } from 'react-bootstrap';
import { ArrowLeft, BookMarked, BookOpen, House, Search, UserRound } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { MemberProvider, useMember } from '../context/MemberContext';
import Avatar from '../components/Avatar';
import ConfirmModal from '../components/ConfirmModal';
import NotificationBell from '../components/member/NotificationBell';
import MemberBookModal from '../components/member/MemberBookModal';
import SearchBox from '../components/member/SearchBox';
import MemberColumns from '../components/member/Highlights';
import { MEMBER } from '../utils/labels';

const NAV = [
  { to: '/', label: 'Home', icon: House, end: true },
  { to: '/bookmarks', label: 'Bookmarks', icon: BookMarked },
  { to: '/my-books', label: 'My Books', icon: BookOpen },
  { to: '/profile', label: 'Profile', icon: UserRound },
];

// Member portal layout, like Facebook:
//   top bar: logo + search (with suggestions; "/" focuses it) | 4 nav items | bell + avatar menu
//   phones:  logo, a search icon (opens a full-width search) and the bell on top; the 4 nav items
//            move to a bottom tab bar
// The book modal and the "Request '…'?" confirmation live here, so ANY page can use them.
export default function MemberLayout() {
  return (
    <MemberProvider>
      <MemberShell />
    </MemberProvider>
  );
}

function MemberShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { summary, reshuffleHome, closeBook, asking, confirmRequest, cancelAsk, requesting, pageLayout } = useMember();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [mobileSearch, setMobileSearch] = useState(false);
  const searchRef = useRef(null);

  // A new tab starts at the top (instantly, before the new content is drawn)
  useLayoutEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);

  // Keyboard shortcut: "/" focuses the search (like GitHub / YouTube) — but not while typing somewhere
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      if (t instanceof Element && t.closest('input, textarea, select, [contenteditable="true"]')) return;
      e.preventDefault();
      if (window.matchMedia('(max-width: 767.98px)').matches) setMobileSearch(true);
      else searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Clicking "Home" while already on Home: back to the top + a new shuffle (like Facebook)
  const onNav = (to) => () => {
    if (to === '/' && location.pathname === '/') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      reshuffleHome();
    }
  };

  // My Books gets a small badge when something is late (red) or due soon (amber)
  const attention = summary ? summary.late + summary.dueSoon : 0;
  const badge = (to) => (to === '/my-books' && attention > 0
    ? <span className={`nav-badge ${summary.late ? 'is-late' : ''}`} aria-label={`${attention} need attention`}>{attention}</span>
    : null);

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div className="member-shell">
      <header className="member-topbar">
        {mobileSearch && (
          // Phones: the search takes the whole bar
          <div className="topbar-search-full d-md-none">
            <button type="button" className="topbar-icon" onClick={() => setMobileSearch(false)} aria-label="Close search"><ArrowLeft size={20} /></button>
            <SearchBox autoFocus onDone={() => setMobileSearch(false)} />
          </div>
        )}
        <div className={`topbar-left ${mobileSearch ? 'd-none d-md-flex' : ''}`}>
          <Link to="/" className="brand member-brand" onClick={onNav('/')}>Stacks<span className="brand-dot">.</span></Link>
          <div className="d-none d-md-block"><SearchBox inputRef={searchRef} /></div>
        </div>

        <nav className="topbar-nav d-none d-md-flex" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className="topbar-tab" onClick={onNav(to)}>
              <span className="tab-icon"><Icon size={20} aria-hidden="true" />{badge(to)}</span>
              <span className="tab-label">{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className={`topbar-right ${mobileSearch ? 'd-none d-md-flex' : ''}`}>
          <button type="button" className="topbar-icon d-md-none" onClick={() => setMobileSearch(true)} aria-label="Search">
            <Search size={20} />
          </button>
          <NotificationBell />
          <Dropdown align="end" className="d-none d-md-block">
            <Dropdown.Toggle variant="link" className="topbar-avatar" aria-label="Account menu">
              <Avatar name={user.name} avatarKey={user.avatarKey} size="sm" />
            </Dropdown.Toggle>
            <Dropdown.Menu>
              <Dropdown.Header className="text-truncate" style={{ maxWidth: 240 }}>{user.name}</Dropdown.Header>
              <Dropdown.Item as={Link} to="/profile">Profile</Dropdown.Item>
              <Dropdown.Item as="button" onClick={() => setConfirmLogout(true)}>Log out</Dropdown.Item>
            </Dropdown.Menu>
          </Dropdown>
        </div>
      </header>

      {/* The columns stay mounted while switching tabs: only the center (the page) changes, so the side
          cards do not reload or jump. Each page sets wide/home with useMemberPage(). */}
      <main className="member-main">
        <MemberColumns wide={pageLayout.wide} home={pageLayout.home}>
          <Outlet context={{ askLogout: () => setConfirmLogout(true) }} />
        </MemberColumns>
      </main>

      {/* Phones: the 4 nav items as a bottom tab bar (safe-area aware, see member.css) */}
      <nav className="member-tabbar d-md-none" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className="tabbar-item" onClick={onNav(to)}>
            <span className="tab-icon"><Icon size={22} aria-hidden="true" />{badge(to)}</span>
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>

      <MemberBookModal bookId={params.get('book')} onHide={closeBook} />

      {/* "Request" from any card or tile */}
      <ConfirmModal
        show={!!asking}
        title={`Request '${asking?.title || ''}'?`}
        message={MEMBER.pickUp}
        confirmLabel="Send request"
        confirmVariant="primary"
        onConfirm={confirmRequest}
        onCancel={cancelAsk}
        loading={requesting}
      />
      <ConfirmModal
        show={confirmLogout}
        title="Log out of Stacks?"
        message="You will need to log in again to see your books and requests."
        confirmLabel="Log out"
        confirmVariant="primary"
        onConfirm={handleLogout}
        onCancel={() => setConfirmLogout(false)}
      />
    </div>
  );
}
