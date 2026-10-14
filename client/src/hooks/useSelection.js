import { useCallback, useEffect, useRef, useState } from 'react';

// Row selection for a paged list (Books, Members, Transactions).
// - ids: a Set of selected ids. It survives page changes (pick rows on page 1, then on page 3).
// - allMatching: "Select all 1,000 matching" was clicked -> everything that matches the filters,
//   not just the loaded rows (the export then uses the filters instead of a list of ids).
// - resetKey: a string of the current search/filters/sort. When it changes, the selection is cleared
//   (the old rows may not match any more) and a short note explains why.
export default function useSelection(resetKey) {
  const [ids, setIds] = useState(() => new Set());
  const [allMatching, setAllMatching] = useState(false);
  const [note, setNote] = useState('');
  const anchor = useRef(null); // index of the last clicked row, for shift+click ranges
  const prevKey = useRef(resetKey);
  const hasSelection = ids.size > 0 || allMatching;

  useEffect(() => {
    if (prevKey.current === resetKey) return;
    prevKey.current = resetKey;
    anchor.current = null;
    if (hasSelection) {
      setIds(new Set());
      setAllMatching(false);
      setNote('Selection cleared because filters changed');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // The note disappears by itself after a few seconds
  useEffect(() => {
    if (!note) return undefined;
    const t = setTimeout(() => setNote(''), 4000);
    return () => clearTimeout(t);
  }, [note]);

  // Click on one checkbox. With Shift held, every row between the last clicked one and this one
  // gets the same state (like in Gmail or a file manager).
  const toggle = useCallback((rows, index, shiftKey) => {
    const id = rows[index]._id;
    setIds((prev) => {
      const next = new Set(prev);
      const select = !next.has(id);
      const from = shiftKey && anchor.current !== null ? Math.min(anchor.current, index) : index;
      const to = shiftKey && anchor.current !== null ? Math.max(anchor.current, index) : index;
      for (let i = from; i <= to; i++) {
        if (rows[i]) { if (select) next.add(rows[i]._id); else next.delete(rows[i]._id); }
      }
      return next;
    });
    anchor.current = index;
    setAllMatching(false);
  }, []);

  // Header checkbox: select the whole page, or clear it when it is already fully selected
  const togglePage = useCallback((rows) => {
    setIds((prev) => {
      const next = new Set(prev);
      const all = rows.length > 0 && rows.every((r) => next.has(r._id));
      rows.forEach((r) => (all ? next.delete(r._id) : next.add(r._id)));
      return next;
    });
    setAllMatching(false);
  }, []);

  const selectAllMatching = useCallback((rows) => {
    setIds(new Set(rows.map((r) => r._id)));
    setAllMatching(true);
  }, []);

  const clear = useCallback(() => {
    setIds(new Set());
    setAllMatching(false);
    anchor.current = null;
  }, []);

  // 'none' | 'some' | 'all' for the rows currently shown (drives the header checkbox)
  const pageState = (rows) => {
    const n = rows.filter((r) => ids.has(r._id)).length;
    return n === 0 ? 'none' : n === rows.length ? 'all' : 'some';
  };

  return { ids, allMatching, note, hasSelection, toggle, togglePage, selectAllMatching, clear, pageState };
}
