import { useEffect, useRef, useState } from 'react';
import api, { errMsg } from '../api';

// Small in-memory cache of list pages (used for the "prefetch next page" trick).
// Key = url + every param. Entries expire after 30 seconds so data never gets old.
const cache = new Map();
const CACHE_MS = 30 * 1000;
const cacheKey = (path, params) => `${path}?${JSON.stringify(params)}`;
const readCache = (key) => {
  const hit = cache.get(key);
  return hit && Date.now() - hit.at < CACHE_MS ? hit.data : null;
};
// Called after a change (create/delete/return...) so old pages are not shown from the cache
export const clearListCache = (path) => {
  [...cache.keys()].forEach((k) => { if (k.startsWith(`${path}?`)) cache.delete(k); });
};

// ANY successful change (POST/PUT/DELETE: lend, return, edit, import...) empties the whole cache.
// A change on one page can affect the lists of other pages (lending a book on the Transactions page
// changes "5 of 5 available" on the Books page), so no list may be shown from before the change.
api.interceptors.response.use((res) => {
  if (res.config?.method && res.config.method !== 'get') cache.clear();
  return res;
});

// Loads one page of a list (books, members, transactions) and keeps the UI smooth:
// - status 'skeleton'   -> first load, or the page / page size changed (show skeleton rows)
// - status 'refreshing' -> search, filter or sort changed, or a reload: keep the OLD rows visible
//                          (dimmed, with a thin progress bar) instead of flashing skeletons
// - status 'idle'       -> data is ready
// Every request is cancelled (AbortController) when a newer one starts, so an older, slower
// response can never overwrite a newer one. After a page loads, the NEXT page is fetched quietly
// in the background, so clicking "next" feels instant.
export default function useListQuery(path, params, { page, pageSize, reloadKey = 0 }) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('skeleton');
  const [error, setError] = useState('');
  const prev = useRef({ filterKey: null, page: null, pageSize: null, reloadKey });

  const filterKey = JSON.stringify(params);

  // Fetch page+1 quietly into the cache (errors are ignored: it is only a speed-up)
  const prefetchNext = (pages) => {
    if (page >= (pages || 1)) return;
    const nextFull = { ...params, page: page + 1, limit: pageSize };
    const nextKey = cacheKey(path, nextFull);
    if (readCache(nextKey)) return;
    api.get(path, { params: nextFull })
      .then((r) => cache.set(nextKey, { data: r.data, at: Date.now() }))
      .catch(() => {});
  };

  useEffect(() => {
    const p = prev.current;
    const reloaded = p.reloadKey !== reloadKey;
    if (reloaded) clearListCache(path);
    prev.current = { filterKey, page, pageSize, reloadKey };

    const full = { ...params, page, limit: pageSize };
    const key = cacheKey(path, full);
    const cached = readCache(key);
    if (cached) { // already prefetched: show it right away, no loading state at all
      setData(cached);
      setStatus('idle');
      setError('');
      prefetchNext(cached.pages); // keep one page ahead, so the next click is instant too
      return undefined;
    }

    const pageMoved = p.page !== page || p.pageSize !== pageSize;
    setStatus(data === null || (pageMoved && !reloaded && p.filterKey === filterKey) ? 'skeleton' : 'refreshing');
    setError('');

    const ctrl = new AbortController();
    api.get(path, { params: full, signal: ctrl.signal })
      .then((res) => {
        cache.set(key, { data: res.data, at: Date.now() });
        setData(res.data);
        setStatus('idle');
        prefetchNext(res.data.pages); // the next page loads quietly in the background
      })
      .catch((err) => {
        if (err.code === 'ERR_CANCELED') return; // replaced by a newer request
        setError(errMsg(err));
        setStatus('idle');
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, filterKey, page, pageSize, reloadKey]);

  return { data, status, error, loading: status === 'skeleton', refreshing: status === 'refreshing' };
}
