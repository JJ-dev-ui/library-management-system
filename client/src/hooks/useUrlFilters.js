import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import useDebounce from './useDebounce';

// Rows-per-page choices (the server accepts up to 100)
export const PAGE_SIZES = [10, 20, 50, 100];

// Keeps filters, sort and page in the URL query string (?search=rizal&category=Fiction&page=2).
// Why: refresh and the Back button keep the state, and the link can be shared.
// `defaults` = every filter key with its default value (default values are NOT written to the URL).
export default function useUrlFilters(defaults) {
  const [params, setParams] = useSearchParams();
  const defaultsRef = useRef(defaults); // defaults never change, a ref keeps callbacks stable

  // Current values = defaults, overridden by whatever is in the URL
  const filters = useMemo(() => {
    const f = { ...defaultsRef.current };
    Object.keys(f).forEach((k) => {
      const v = params.get(k);
      if (v !== null) f[k] = v;
    });
    return f;
  }, [params]);

  const page = Math.max(1, parseInt(params.get('page'), 10) || 1);
  // ?limit=20 -> 20 rows per page; anything not in PAGE_SIZES falls back to 10
  const limitParam = parseInt(params.get('limit'), 10);
  const pageSize = PAGE_SIZES.includes(limitParam) ? limitParam : PAGE_SIZES[0];

  // Change one or more filters. Any filter change goes back to page 1 (the "page" key is removed).
  const setFilters = useCallback((patch) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(patch).forEach(([k, v]) => {
        if (v === '' || v == null || v === defaultsRef.current[k]) next.delete(k);
        else next.set(k, String(v));
      });
      next.delete('page');
      return next;
    });
  }, [setParams]);

  const setPage = useCallback((n) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (n <= 1) next.delete('page'); else next.set('page', String(n));
      return next;
    });
  }, [setParams]);

  // Changing rows per page goes back to page 1 (page 15 of 10-row pages does not exist with 100-row pages)
  const setPageSize = useCallback((n) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (n === PAGE_SIZES[0]) next.delete('limit'); else next.set('limit', String(n));
      next.delete('page');
      return next;
    });
  }, [setParams]);

  // Reset the given keys (default: all filters) to their defaults
  const clearFilters = useCallback((keys = Object.keys(defaultsRef.current)) => {
    setFilters(Object.fromEntries(keys.map((k) => [k, defaultsRef.current[k]])));
  }, [setFilters]);

  return { filters, page, pageSize, setFilters, setPage, setPageSize, clearFilters };
}

// The search box needs its own local text (so typing feels instant) that is written to the URL
// only after the user stops typing (debounce). It also follows the URL when it changes from
// outside, e.g. "Clear all" or the Back button.
export function useUrlSearchText(urlValue, onCommit, delay = 250) {
  const [text, setText] = useState(urlValue);
  const debounced = useDebounce(text, delay);
  const commitRef = useRef(onCommit);
  commitRef.current = onCommit;

  // URL changed from outside -> update the input
  useEffect(() => { setText(urlValue); }, [urlValue]);

  // User stopped typing -> write to the URL (only when it differs, to avoid loops)
  useEffect(() => {
    if (debounced.trim() !== urlValue) commitRef.current(debounced.trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return [text, setText];
}
