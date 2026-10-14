import { useEffect, useId, useState } from 'react';
import { Form } from 'react-bootstrap';
import api from '../../api';
import useDebounce from '../../hooks/useDebounce';

// Text input that suggests author names from the server (GET /api/books/authors?q=) after 2 characters.
// Keyboard: ArrowUp/ArrowDown to move, Enter to pick, Escape to close (ARIA combobox pattern).
export default function AuthorAutocomplete({ value, onChange, id }) {
  const listId = useId();
  const [options, setOptions] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const q = useDebounce(value, 250);

  useEffect(() => {
    if (!open || q.trim().length < 2) { setOptions([]); return undefined; }
    const ctrl = new AbortController(); // cancels the old request if the user keeps typing
    api.get('/books/authors', { params: { q: q.trim() }, signal: ctrl.signal })
      .then((res) => { setOptions(res.data.authors); setActive(-1); })
      .catch(() => {}); // suggestions are optional; ignore errors and cancelled requests
    return () => ctrl.abort();
  }, [q, open]);

  const choose = (name) => {
    onChange(name);
    setOpen(false);
  };

  const onKeyDown = (e) => {
    if (!open || options.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % options.length); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i <= 0 ? options.length - 1 : i - 1)); }
    if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(options[active]); }
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
  };

  const showList = open && options.length > 0;

  return (
    <div className="position-relative">
      <Form.Control
        id={id}
        type="text"
        value={value}
        maxLength={100}
        placeholder="e.g. Jose Rizal"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul id={listId} role="listbox" className="dropdown-menu show w-100" style={{ top: '100%', left: 0 }}>
          {options.map((name, i) => (
            <li key={name} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              {/* onMouseDown (not onClick) runs before the input's blur closes the list */}
              <button
                type="button"
                className={`dropdown-item ${i === active ? 'active' : ''}`}
                onMouseDown={(e) => { e.preventDefault(); choose(name); }}
                tabIndex={-1}
              >
                {name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
