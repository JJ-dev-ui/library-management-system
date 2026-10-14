import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api, { errMsg } from '../api';
import { useToast } from './ToastContext';
import { MEMBER } from '../utils/labels';
import { MAX_ACTIVE_LOANS } from '../utils/transactions';

const MemberContext = createContext(null);

// useMember() -> shared state of the member portal (only inside MemberLayout):
//   summary              { borrowedNow, dueSoon, late, pendingRequests, slotsLeft, completedCount, ... }
//   unseen               the bell badge: notifications since the bell was last opened (polled every 60 s + on focus)
//   markSeen()           the bell was opened: badge -> 0 at once (optimistic) + PUT /me/notifications/seen
//   openBook(id)         open the book modal (?book=<id> in the URL, so Back closes it)
//   isBookmarked / toggleBookmark   one source of truth for every card, tile and the modal
//   statusOf(book)       'none' | 'requested' | 'borrowing' (server value + changes made in this session)
//   requestBlock         why the member can't request ANY book right now (late book / 5-book limit) or null
//   askRequest(book)     opens the "Request '…'?" confirmation (rendered by MemberLayout)
//   view / setView       'feed' | 'grid', remembered in this browser (localStorage stacks.memberView)
//   homeNonce / reshuffleHome()  clicking "Home" while on Home reshuffles the feed (like Facebook)
export const useMember = () => useContext(MemberContext);

// The side columns live in MemberLayout (they stay on screen while switching tabs; only the center
// changes). Each page tells the layout how it wants them: wide (grid view) and home (phone strips).
// useLayoutEffect: applied BEFORE the browser paints, so the columns never flash in the wrong state.
export function useMemberPage({ wide = false, home = false } = {}) {
  const { setPageLayout } = useMember();
  useLayoutEffect(() => { setPageLayout({ wide, home }); }, [wide, home, setPageLayout]);
}

const POLL_MS = 60 * 1000;
const VIEW_KEY = 'stacks.memberView';
const readView = () => { try { return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'feed'; } catch { return 'feed'; } };

export function MemberProvider({ children }) {
  const toast = useToast();
  const [, setParams] = useSearchParams();
  const [summary, setSummary] = useState(null);
  const [unseen, setUnseen] = useState(0);
  const [overrides, setOverrides] = useState({});      // bookId -> bookmarked true/false (this session)
  const [statusOverrides, setStatusOverrides] = useState({}); // bookId -> 'requested' | 'none' (this session)
  const [asking, setAsking] = useState(null);           // book waiting for the Request confirmation
  const [requesting, setRequesting] = useState(false);
  const [homeNonce, setHomeNonce] = useState(0);
  const [view, setViewState] = useState(readView);
  const [pageLayout, setPageLayout] = useState({ wide: false, home: false });

  const setView = useCallback((v) => {
    setViewState(v);
    try { localStorage.setItem(VIEW_KEY, v); } catch { /* storage blocked: the choice lasts until reload */ }
  }, []);

  const refreshSummary = useCallback(() => api.get('/me/summary')
    .then((res) => { setSummary(res.data); setUnseen(res.data.unseenNotifications); })
    .catch(() => {}), []);
  const refreshUnseen = useCallback(() => api.get('/me/notifications/unread-count')
    .then((res) => setUnseen(res.data.unseen))
    .catch(() => {}), []);

  // First load, then poll the badge every 60 s, and refresh everything when the tab gets focus again
  // (no websockets: simple and enough for a school library)
  useEffect(() => {
    refreshSummary();
    const timer = setInterval(refreshUnseen, POLL_MS);
    const onFocus = () => { refreshSummary(); };
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [refreshSummary, refreshUnseen]);

  // Opening the bell = "seen": the badge resets at once; the server remembers the moment
  const markSeen = useCallback(() => {
    setUnseen(0);
    api.put('/me/notifications/seen').catch(() => {});
  }, []);

  const openBook = useCallback((id) => setParams((p) => { const n = new URLSearchParams(p); n.set('book', id); return n; }), [setParams]);
  const closeBook = useCallback(() => setParams((p) => { const n = new URLSearchParams(p); n.delete('book'); return n; }, { replace: true }), [setParams]);

  const isBookmarked = useCallback((book) => (book ? overrides[book._id] ?? !!book.bookmarked : false), [overrides]);

  // Saves / removes a bookmark. Optimistic: the icon changes at once and goes back if the server says no.
  const toggleBookmark = useCallback(async (book, { silent = false } = {}) => {
    const next = !(overrides[book._id] ?? !!book.bookmarked);
    setOverrides((o) => ({ ...o, [book._id]: next }));
    try {
      if (next) await api.post('/me/bookmarks', { bookId: book._id });
      else await api.delete(`/me/bookmarks/${book._id}`);
      if (!silent) toast.success(next ? 'Saved to your bookmarks' : 'Removed from your bookmarks', { id: 'bookmark' });
      return next;
    } catch (err) {
      setOverrides((o) => ({ ...o, [book._id]: !next }));
      toast.error(errMsg(err));
      return !next;
    }
  }, [overrides, toast]);

  const statusOf = useCallback((book) => statusOverrides[book?._id] || book?.myStatus || 'none', [statusOverrides]);
  const setBookStatus = useCallback((bookId, status) => setStatusOverrides((s) => ({ ...s, [bookId]: status })), []);

  // Member-level block, from the latest summary (same words as the server's utils/requestRules.js)
  const requestBlock = useMemo(() => {
    if (!summary) return null;
    if (summary.late > 0) {
      const n = summary.late;
      return { reason: 'late', message: `You have ${n === 1 ? '1 late book' : `${n} late books`}. Return ${n === 1 ? 'it' : 'them'} before requesting more.` };
    }
    if (summary.borrowedNow + summary.pendingRequests >= MAX_ACTIVE_LOANS) {
      return { reason: 'limit', message: `You've reached the ${MAX_ACTIVE_LOANS}-book limit (${summary.borrowedNow} borrowed, ${summary.pendingRequests} requested).` };
    }
    return null;
  }, [summary]);

  const askRequest = useCallback((book) => setAsking(book), []);
  const confirmRequest = useCallback(async () => {
    const book = asking;
    setRequesting(true);
    try {
      await api.post('/requests', { bookId: book._id });
      toast.success(MEMBER.requestSent);
      setBookStatus(book._id, 'requested');
      setAsking(null);
      refreshSummary(); // slots left, badges
    } catch (err) {
      toast.error(errMsg(err));
      setAsking(null);
    } finally {
      setRequesting(false);
    }
  }, [asking, toast, setBookStatus, refreshSummary]);

  const reshuffleHome = useCallback(() => setHomeNonce((n) => n + 1), []);

  const value = useMemo(() => ({
    summary, unseen, setUnseen, markSeen, refreshSummary, refreshUnseen, openBook, closeBook,
    isBookmarked, toggleBookmark, statusOf, setBookStatus, requestBlock,
    asking, askRequest, confirmRequest, cancelAsk: () => setAsking(null), requesting,
    view, setView, homeNonce, reshuffleHome, pageLayout, setPageLayout,
  }), [summary, unseen, markSeen, refreshSummary, refreshUnseen, openBook, closeBook, isBookmarked, toggleBookmark,
    statusOf, setBookStatus, requestBlock, asking, askRequest, confirmRequest, requesting, view, setView, homeNonce, reshuffleHome, pageLayout]);

  return <MemberContext.Provider value={value}>{children}</MemberContext.Provider>;
}
