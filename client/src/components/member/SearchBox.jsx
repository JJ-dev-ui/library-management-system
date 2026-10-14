import { useEffect, useId, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { BookOpen, Search, UserRound } from 'lucide-react';
import api from '../../api';
import useDebounce from '../../hooks/useDebounce';
import { useMember } from '../../context/MemberContext';

// The top-bar search with suggestions (up to 5 titles + 3 authors while typing).
//   Enter            -> full results on Home (/?q=…, keeping the other filters)
//   ↑ / ↓ + Enter    -> pick a suggestion: a title opens its book modal, an author applies the Author filter
//   Escape           -> close the suggestions
// inputRef: lets the layout focus it (the "/" shortcut). onDone: called after a search (closes the phone search).
export default function SearchBox({ inputRef, onDone, autoFocus = false }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const { openBook } = useMember();
  const listId = useId();
  const onHome = location.pathname === '/';
  const urlQ = onHome ? params.get('q') || '' : '';

  const [text, setText] = useState(urlQ);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [sugg, setSugg] = useState({ titles: [], authors: [] });
  useEffect(() => { setText(urlQ); }, [urlQ]); // the URL changed (e.g. a chip was removed): follow it

  // Suggestions, debounced (one request after the user pauses typing), older requests cancelled
  const q = useDebounce(text.trim(), 200);
  useEffect(() => {
    if (q.length < 2) { setSugg({ titles: [], authors: [] }); return undefined; }
    const ctrl = new AbortController();
    api.get('/feed/suggest', { params: { q }, signal: ctrl.signal })
      .then((res) => { setSugg(res.data); setActive(-1); })
      .catch(() => {});
    return () => ctrl.abort();
  }, [q]);

  const items = [
    ...sugg.titles.map((t) => ({ kind: 'title', key: t._id, label: t.title, sub: t.authors?.join(', '), id: t._id })),
    ...sugg.authors.map((a) => ({ kind: 'author', key: `a:${a}`, label: a, sub: 'Author' })),
  ];
  const showList = open && text.trim().length >= 2 && items.length > 0;

  // Full results: the search goes into Home's URL (other filters on Home are kept)
  const goSearch = (value = text.trim()) => {
    setOpen(false);
    if (onHome) setParams((p) => { const n = new URLSearchParams(p); if (value) n.set('q', value); else n.delete('q'); n.delete('book'); return n; });
    else navigate(value ? `/?q=${encodeURIComponent(value)}` : '/');
    onDone?.();
  };
  const choose = (item) => {
    setOpen(false);
    if (item.kind === 'title') openBook(item.id);
    else navigate(`/?author=${encodeURIComponent(item.label)}`); // the Author filter, no text search
    onDone?.();
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' && showList) { e.preventDefault(); setActive((i) => (i + 1) % items.length); }
    else if (e.key === 'ArrowUp' && showList) { e.preventDefault(); setActive((i) => (i <= 0 ? items.length - 1 : i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (showList && active >= 0) choose(items[active]); else goSearch(); }
    else if (e.key === 'Escape') { setOpen(false); e.currentTarget.blur(); }
  };
  const onChange = (e) => {
    const value = e.target.value.slice(0, 100);
    setText(value);
    setOpen(true);
    if (!value && urlQ) goSearch(''); // cleared (e.g. the × of the search field): show the normal feed again
  };

  return (
    <div className="search-wrap">
      <div className="member-search">
        <Search size={16} aria-hidden="true" />
        <input ref={inputRef} type="search" placeholder="Search books, authors, ISBN" aria-label="Search books, authors, ISBN"
          role="combobox" aria-expanded={showList} aria-controls={listId} aria-autocomplete="list"
          aria-activedescendant={showList && active >= 0 ? `${listId}-${active}` : undefined}
          value={text} onChange={onChange} onKeyDown={onKeyDown} onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)} maxLength={100} autoFocus={autoFocus} />
        <kbd className="search-kbd d-none d-lg-inline" aria-hidden="true">/</kbd>
      </div>
      {showList && (
        <ul id={listId} className="search-suggest" role="listbox">
          {items.map((item, i) => (
            // onMouseDown + preventDefault: picking an item does not blur the input first
            <li key={item.key} id={`${listId}-${i}`} role="option" aria-selected={i === active}
              className={i === active ? 'is-active' : ''} onMouseDown={(e) => { e.preventDefault(); choose(item); }}>
              {item.kind === 'title' ? <BookOpen size={16} aria-hidden="true" /> : <UserRound size={16} aria-hidden="true" />}
              <span className="min-w-0">
                <span className="d-block text-truncate">{item.label}</span>
                {item.sub && <span className="meta d-block text-truncate">{item.sub}</span>}
              </span>
            </li>
          ))}
          <li role="option" aria-selected={false} className="search-all" onMouseDown={(e) => { e.preventDefault(); goSearch(); }}>
            See all results for “{text.trim()}”
          </li>
        </ul>
      )}
    </div>
  );
}
