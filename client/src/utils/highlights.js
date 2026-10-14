import api from '../api';

// "New arrivals" + "Most borrowed" (the member side columns). The same columns can be on screen
// twice (desktop column + phone strip), so answers are shared: one request per range combination,
// kept for 60 seconds (the server caches them for 60 seconds too).
const cache = new Map();
const TTL = 60 * 1000;

export function getHighlights(newRange, popularRange) {
  const key = `${newRange}|${popularRange}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.promise;
  const promise = api.get('/member/highlights', { params: { newRange, popularRange } }).then((res) => res.data);
  promise.catch(() => cache.delete(key)); // a failed request may be retried
  cache.set(key, { promise, at: Date.now() });
  return promise;
}
