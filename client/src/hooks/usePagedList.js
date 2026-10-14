import { useCallback, useEffect, useRef, useState } from 'react';
import { errMsg } from '../api';

// A list that grows page by page: used by the infinite feed (Home, Bookmarks) and the
// "Load more" lists (My Books).
//   fetchPage(page) -> Promise<{ items, hasMore }>   (may change on every render; the latest is used)
//   resetKey: when it changes (new search, filter or shuffle), the list starts again from page 1
export default function usePagedList(fetchPage, resetKey) {
  const fetchRef = useRef(fetchPage);
  fetchRef.current = fetchPage;

  const [items, setItems] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // gen goes up on every reset. An answer for an OLDER list (e.g. a search the user already
  // changed) is ignored, so results of two searches can never mix.
  const gen = useRef(0);
  const busy = useRef(false); // one page at a time

  const load = useCallback(async (nextPage) => {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError('');
    const myGen = gen.current;
    try {
      const res = await fetchRef.current(nextPage);
      if (myGen !== gen.current) return;
      setItems((list) => (nextPage === 1 ? res.items : [...list, ...res.items]));
      setPage(nextPage);
      setHasMore(res.hasMore);
    } catch (err) {
      if (myGen === gen.current) setError(errMsg(err));
    } finally {
      if (myGen === gen.current) { busy.current = false; setLoading(false); }
    }
  }, []);

  useEffect(() => {
    gen.current += 1;
    busy.current = false;
    setItems([]);
    setPage(0);
    setHasMore(true);
    load(1);
  }, [resetKey, load]);

  const loadMore = useCallback(() => {
    if (hasMore && !busy.current && !error) load(page + 1);
  }, [hasMore, page, load, error]);
  const retry = useCallback(() => load(page + 1), [page, load]);

  // initialLoading = nothing on screen yet (show skeletons)
  return { items, setItems, loading, initialLoading: loading && page === 0, hasMore, error, loadMore, retry };
}

// Infinite scroll: returns a ref for an empty element at the END of the list. When it comes near
// the screen (IntersectionObserver), onVisible() loads the next page. `watch` (e.g. the number of
// items) re-creates the observer, so a short page that keeps the sentinel visible loads again.
export function useSentinel(onVisible, enabled, watch) {
  const ref = useRef(null);
  const cb = useRef(onVisible);
  cb.current = onVisible;
  useEffect(() => {
    const el = ref.current;
    if (!enabled || !el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) cb.current();
    }, { rootMargin: '600px 0px' }); // start loading a bit BEFORE the end is reached
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, watch]);
  return ref;
}
