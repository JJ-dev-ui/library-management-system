import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Form, Offcanvas } from 'react-bootstrap';
import { LayoutGrid, List } from 'lucide-react';
import SegmentedControl from '../SegmentedControl';
import FilterChips from '../FilterChips';
import AuthorAutocomplete from '../books/AuthorAutocomplete';
import { useMember } from '../../context/MemberContext';
import { getFacets } from '../../utils/facetsCache';
import { languageLabel } from '../../utils/books';

// Every member filter lives in the URL (?category=…&sort=…), so a filtered view survives refresh,
// Back, and can be shared. The server validates each one (routes/feed.js, queries/memberBooks.js).
const KEYS = ['q', 'available', 'category', 'author', 'yearFrom', 'yearTo', 'language', 'length', 'added', 'hideBorrowed', 'sort'];
const ADVANCED = ['author', 'language', 'length', 'added', 'hideBorrowed']; // + the year range (counted once)

export const SORTS = [
  { value: '', label: 'Recommended' },   // shuffled feed (Bookmarks: newest bookmark first)
  { value: 'newest', label: 'Recently added' },
  { value: 'title', label: 'Title A–Z' },
  { value: 'year_desc', label: 'Newest published' },
  { value: 'year_asc', label: 'Oldest published' },
  { value: 'popular', label: 'Most popular' },
];
const ERAS = [
  { label: 'Before 1950', from: '', to: '1949' },
  { label: '1950–1999', from: '1950', to: '1999' },
  { label: '2000–2015', from: '2000', to: '2015' },
  { label: '2016+', from: '2016', to: '' },
];
const LENGTHS = [{ value: 'short', label: 'Short (< 200 pages)' }, { value: 'medium', label: 'Medium (200–400)' }, { value: 'long', label: 'Long (400+)' }];
const ADDED = [{ value: 'week', label: 'This week' }, { value: 'month', label: 'This month' }];
const AVAILABILITY = [{ value: '', label: 'All' }, { value: 'true', label: 'Available now' }];

// Reads/writes the filters in the URL. `apiParams` = what the API gets (empty values left out);
// `key` changes whenever a filter changes, which restarts the infinite list.
export function useMemberFilters() {
  const [params, setParams] = useSearchParams();
  const f = Object.fromEntries(KEYS.map((k) => [k, params.get(k) || '']));
  const set = (patch) => setParams((p) => {
    const n = new URLSearchParams(p);
    Object.entries(patch).forEach(([k, v]) => (v ? n.set(k, v) : n.delete(k)));
    return n;
  }, { replace: true });
  const clear = () => set(Object.fromEntries(KEYS.filter((k) => k !== 'sort').map((k) => [k, ''])));
  const apiParams = Object.fromEntries(Object.entries({
    search: f.q, available: f.available, category: f.category, author: f.author, yearFrom: f.yearFrom, yearTo: f.yearTo,
    language: f.language, length: f.length, added: f.added, hideBorrowed: f.hideBorrowed, sort: f.sort,
  }).filter(([, v]) => v));
  return { f, set, clear, apiParams, key: JSON.stringify(apiParams) };
}

const yearLabel = (from, to) => (from && to ? `${from}–${to}` : from ? `${from} and later` : `before ${Number(to) + 1}`);

// Right-side panel with the advanced filters. Edits a DRAFT; nothing changes until "Apply".
function FiltersOffcanvas({ show, onHide, f, set, languages }) {
  const pick = () => Object.fromEntries([...ADVANCED, 'yearFrom', 'yearTo'].map((k) => [k, f[k]]));
  const [draft, setDraft] = useState(pick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (show) setDraft(pick()); }, [show]);
  const put = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const yearError = draft.yearFrom && draft.yearTo && Number(draft.yearTo) < Number(draft.yearFrom) ? '"To" must be the same as or after "From"' : '';
  const apply = (e) => { e.preventDefault(); if (yearError) return; set({ ...draft, author: draft.author.trim() }); onHide(); };
  const reset = () => { set(Object.fromEntries(Object.keys(draft).map((k) => [k, '']))); onHide(); };
  const digits = (k) => (e) => put({ [k]: e.target.value.replace(/\D/g, '').slice(0, 4) });

  return (
    <Offcanvas show={show} onHide={onHide} placement="end" aria-labelledby="member-filters-title">
      <Offcanvas.Header closeButton><Offcanvas.Title id="member-filters-title">Filters</Offcanvas.Title></Offcanvas.Header>
      <Form onSubmit={apply} className="d-flex flex-column flex-grow-1 min-h-0" noValidate>
        <Offcanvas.Body className="d-flex flex-column gap-4">
          <Form.Group>
            <Form.Label htmlFor="mf-author">Author</Form.Label>
            <AuthorAutocomplete id="mf-author" value={draft.author} onChange={(v) => put({ author: v })} />
          </Form.Group>
          <fieldset>
            <legend className="form-label">Published</legend>
            <div className="d-flex flex-wrap gap-2 mb-2">
              {ERAS.map((era) => {
                const on = draft.yearFrom === era.from && draft.yearTo === era.to;
                return (
                  <button key={era.label} type="button" className={`filter-chip ${on ? 'is-on' : ''}`} aria-pressed={on}
                    onClick={() => put(on ? { yearFrom: '', yearTo: '' } : { yearFrom: era.from, yearTo: era.to })}>{era.label}</button>
                );
              })}
            </div>
            <div className="d-flex gap-2 align-items-center">
              <Form.Control inputMode="numeric" aria-label="Year from" placeholder="From" value={draft.yearFrom} onChange={digits('yearFrom')} isInvalid={!!yearError} />
              <span className="meta">–</span>
              <Form.Control inputMode="numeric" aria-label="Year to" placeholder="To" value={draft.yearTo} onChange={digits('yearTo')} isInvalid={!!yearError} />
            </div>
            {yearError && <div className="invalid-feedback d-block">{yearError}</div>}
          </fieldset>
          <Form.Group controlId="mf-language">
            <Form.Label>Language</Form.Label>
            <Form.Select value={draft.language} onChange={(e) => put({ language: e.target.value })}>
              <option value="">Any language</option>
              {languages.map((l) => <option key={l.name} value={l.name}>{languageLabel(l.name)}</option>)}
            </Form.Select>
          </Form.Group>
          <Form.Group controlId="mf-length">
            <Form.Label>Length</Form.Label>
            <Form.Select value={draft.length} onChange={(e) => put({ length: e.target.value })}>
              <option value="">Any length</option>
              {LENGTHS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Form.Select>
          </Form.Group>
          <Form.Group controlId="mf-added">
            <Form.Label>Added to the library</Form.Label>
            <Form.Select value={draft.added} onChange={(e) => put({ added: e.target.value })}>
              <option value="">Any time</option>
              {ADDED.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Form.Select>
          </Form.Group>
          <Form.Check type="switch" id="mf-hide-borrowed" label="Hide books I've borrowed before"
            checked={draft.hideBorrowed === 'true'} onChange={(e) => put({ hideBorrowed: e.target.checked ? 'true' : '' })} />
        </Offcanvas.Body>
        <div className="d-flex gap-2 p-3">
          <Button variant="outline-secondary" className="flex-fill" onClick={reset}>Reset</Button>
          <Button type="submit" variant="primary" className="flex-fill" disabled={!!yearError}>Apply</Button>
        </div>
      </Form>
    </Offcanvas>
  );
}

// Filter row (availability, category, Filters, sort, Feed/Grid), category chips, active filter chips.
// recommendedLabel: what "Recommended" means on this page (Bookmarks: "Recently saved").
export default function MemberFilterBar({ filters, recommendedLabel = 'Recommended' }) {
  const { f, set, clear } = filters;
  const { view, setView } = useMember();
  const [facets, setFacets] = useState({ categories: [], languages: [] });
  const [showFilters, setShowFilters] = useState(false);
  useEffect(() => { getFacets().then(setFacets).catch(() => {}); }, []);

  const advancedCount = ADVANCED.filter((k) => f[k]).length + (f.yearFrom || f.yearTo ? 1 : 0);
  const sorts = SORTS.map((s) => (s.value ? s : { ...s, label: recommendedLabel }));

  const chips = useMemo(() => {
    const list = [];
    const add = (key, label, patch) => list.push({ key, label, onRemove: () => set(patch) });
    if (f.q) add('q', `Search: "${f.q}"`, { q: '' });
    if (f.available) add('available', 'Available now', { available: '' });
    if (f.category) add('category', `Category: ${f.category}`, { category: '' });
    if (f.author) add('author', `Author: ${f.author}`, { author: '' });
    if (f.yearFrom || f.yearTo) add('year', `Published: ${yearLabel(f.yearFrom, f.yearTo)}`, { yearFrom: '', yearTo: '' });
    if (f.language) add('language', `Language: ${languageLabel(f.language)}`, { language: '' });
    if (f.length) add('length', LENGTHS.find((o) => o.value === f.length)?.label || f.length, { length: '' });
    if (f.added) add('added', `Added ${f.added === 'week' ? 'this week' : 'this month'}`, { added: '' });
    if (f.hideBorrowed) add('hide', "Hiding books I've borrowed", { hideBorrowed: '' });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(f)]);

  return (
    <>
      {/* Compact row: what to show on the left, how to show it on the right. The category is picked
          with the chips just below (one place for it instead of a second dropdown). */}
      <div className="feed-filters panel">
        <div className="feed-filters-group">
          <SegmentedControl label="Availability" options={AVAILABILITY} value={f.available} onChange={(v) => set({ available: v })} />
          <Button variant="outline-secondary" size="sm" onClick={() => setShowFilters(true)} className="text-nowrap">
            Filters{advancedCount > 0 && <span className="btn-count" aria-label={`${advancedCount} active`}>{advancedCount}</span>}
          </Button>
        </div>
        <div className="feed-filters-group ms-auto">
          <Form.Select size="sm" aria-label="Sort" value={f.sort} onChange={(e) => set({ sort: e.target.value })} className="feed-select">
            {sorts.map((s) => <option key={s.value || 'rec'} value={s.value}>{s.label}</option>)}
          </Form.Select>
          {/* Feed / Grid (icon-only, remembered in this browser) */}
          <div className="segmented segmented-icons" role="group" aria-label="Layout">
            <button type="button" className={view === 'feed' ? 'active' : ''} aria-pressed={view === 'feed'} onClick={() => setView('feed')} aria-label="Feed view" title="Feed view"><List size={16} /></button>
            <button type="button" className={view === 'grid' ? 'active' : ''} aria-pressed={view === 'grid'} onClick={() => setView('grid')} aria-label="Grid view" title="Grid view"><LayoutGrid size={16} /></button>
          </div>
        </div>
      </div>

      {/* One-click category browsing (scrolls sideways) */}
      <div className="category-chips" role="group" aria-label="Categories">
        <button type="button" className={`filter-chip ${!f.category ? 'is-on' : ''}`} aria-pressed={!f.category} onClick={() => set({ category: '' })}>All</button>
        {facets.categories.map((c) => (
          <button key={c.name} type="button" className={`filter-chip ${f.category === c.name ? 'is-on' : ''}`} aria-pressed={f.category === c.name}
            onClick={() => set({ category: f.category === c.name ? '' : c.name })}>{c.name}</button>
        ))}
      </div>
      {chips.length > 0 && <div className="member-chips"><FilterChips chips={chips} onClearAll={clear} /></div>}

      <FiltersOffcanvas show={showFilters} onHide={() => setShowFilters(false)} f={f} set={set} languages={facets.languages} />
    </>
  );
}
