import { useEffect, useState } from 'react';
import { Button, Form, Offcanvas } from 'react-bootstrap';
import AuthorAutocomplete from './AuthorAutocomplete';
import { ADDED_WITHIN, COPIES, LENGTHS, SHELF_NAMES, languageLabel } from '../../utils/books';

// The advanced filters (everything that is not in the toolbar)
export const ADVANCED_KEYS = ['author', 'language', 'yearFrom', 'yearTo', 'length', 'publisher', 'shelf', 'copies', 'addedWithin', 'archived'];

const pickAdvanced = (filters) => Object.fromEntries(ADVANCED_KEYS.map((k) => [k, filters[k] || '']));

// Right-side panel. Edits a DRAFT copy; nothing changes in the table until "Apply".
// canShowArchived: librarians only (the server ignores the switch for members anyway)
export default function BookFiltersOffcanvas({ show, onHide, filters, facets, onApply, canShowArchived = false }) {
  const [draft, setDraft] = useState(() => pickAdvanced(filters));

  // Every time the panel opens, start from the filters that are currently applied
  useEffect(() => { if (show) setDraft(pickAdvanced(filters)); }, [show, filters]);

  const set = (key) => (e) => setDraft((d) => ({ ...d, [key]: e.target ? e.target.value : e }));

  // Same rule as the server: "to" cannot be before "from"
  const yearError = draft.yearFrom && draft.yearTo && Number(draft.yearTo) < Number(draft.yearFrom)
    ? '"To" must be the same as or after "From"' : '';

  const apply = (e) => {
    e.preventDefault();
    if (yearError) return;
    onApply({ ...draft, author: draft.author.trim(), publisher: draft.publisher.trim() });
    onHide();
  };

  const reset = () => {
    const empty = Object.fromEntries(ADVANCED_KEYS.map((k) => [k, '']));
    setDraft(empty);
    onApply(empty);
    onHide();
  };

  return (
    <Offcanvas show={show} onHide={onHide} placement="end" aria-labelledby="filters-title">
      <Offcanvas.Header closeButton>
        <Offcanvas.Title id="filters-title">Filters</Offcanvas.Title>
      </Offcanvas.Header>
      <Form onSubmit={apply} className="d-flex flex-column flex-grow-1 min-h-0" noValidate>
        <Offcanvas.Body className="d-flex flex-column gap-3">
          <Form.Group>
            <Form.Label htmlFor="f-author">Author</Form.Label>
            <AuthorAutocomplete id="f-author" value={draft.author} onChange={(v) => setDraft((d) => ({ ...d, author: v }))} />
          </Form.Group>

          <Form.Group controlId="f-language">
            <Form.Label>Language</Form.Label>
            <Form.Select value={draft.language} onChange={set('language')}>
              <option value="">Any language</option>
              {facets.languages.map((l) => (
                <option key={l.name} value={l.name}>{languageLabel(l.name)} ({l.count})</option>
              ))}
            </Form.Select>
          </Form.Group>

          <fieldset>
            <legend className="form-label">Publication year</legend>
            <div className="d-flex gap-2 align-items-center">
              <Form.Control type="number" inputMode="numeric" aria-label="Year from" placeholder={facets.minYear ? `From (${facets.minYear})` : 'From'} min={0} max={3000} value={draft.yearFrom} onChange={set('yearFrom')} isInvalid={!!yearError} />
              <span className="meta">–</span>
              <Form.Control type="number" inputMode="numeric" aria-label="Year to" placeholder={facets.maxYear ? `To (${facets.maxYear})` : 'To'} min={0} max={3000} value={draft.yearTo} onChange={set('yearTo')} isInvalid={!!yearError} />
            </div>
            {yearError && <div className="invalid-feedback d-block">{yearError}</div>}
          </fieldset>

          <Form.Group controlId="f-length">
            <Form.Label>Length</Form.Label>
            <Form.Select value={draft.length} onChange={set('length')}>
              <option value="">Any length</option>
              {LENGTHS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Form.Select>
          </Form.Group>

          <Form.Group controlId="f-publisher">
            <Form.Label>Publisher</Form.Label>
            <Form.Control type="text" maxLength={100} placeholder="e.g. Penguin" value={draft.publisher} onChange={set('publisher')} />
          </Form.Group>

          <Form.Group controlId="f-shelf">
            <Form.Label>Shelf section</Form.Label>
            <Form.Select value={draft.shelf} onChange={set('shelf')}>
              <option value="">Any shelf</option>
              {facets.shelves.map((s) => (
                <option key={s.name} value={s.name}>{s.name}{SHELF_NAMES[s.name] ? ` — ${SHELF_NAMES[s.name]}` : ''} ({s.count})</option>
              ))}
            </Form.Select>
          </Form.Group>

          <Form.Group controlId="f-copies">
            <Form.Label>Copies owned</Form.Label>
            <Form.Select value={draft.copies} onChange={set('copies')}>
              <option value="">Any number</option>
              {COPIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Form.Select>
          </Form.Group>

          <Form.Group controlId="f-added">
            <Form.Label>Date added</Form.Label>
            <Form.Select value={draft.addedWithin} onChange={set('addedWithin')}>
              <option value="">Any time</option>
              {ADDED_WITHIN.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Form.Select>
          </Form.Group>

          {canShowArchived && (
            <Form.Group controlId="f-archived">
              {/* Saved in the URL as ?archived=include; archived rows get an "Archived" badge + Restore */}
              <Form.Check type="switch" label="Show archived books"
                checked={draft.archived === 'include'}
                onChange={(e) => setDraft((d) => ({ ...d, archived: e.target.checked ? 'include' : '' }))} />
              <Form.Text>Archived books are hidden from the catalog but kept in the records.</Form.Text>
            </Form.Group>
          )}
        </Offcanvas.Body>
        <div className="d-flex gap-2 p-3 border-top">
          <Button variant="outline-secondary" className="flex-fill" onClick={reset}>Reset</Button>
          <Button type="submit" variant="primary" className="flex-fill" disabled={!!yearError}>Apply</Button>
        </div>
      </Form>
    </Offcanvas>
  );
}
