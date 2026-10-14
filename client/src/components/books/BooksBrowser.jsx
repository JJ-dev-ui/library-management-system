import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Form } from 'react-bootstrap';
import { BookX, LayoutGrid, List, Search, SearchX } from 'lucide-react';
import api, { errMsg } from '../../api';
import { useToast } from '../../context/ToastContext';
import useUrlFilters, { useUrlSearchText } from '../../hooks/useUrlFilters';
import useListQuery from '../../hooks/useListQuery';
import useSelection from '../../hooks/useSelection';
import SelectionBar from '../table/SelectionBar';
import { clearFacets, getFacets } from '../../utils/facetsCache';
import SegmentedControl from '../SegmentedControl';
import FilterChips from '../FilterChips';
import EmptyState from '../EmptyState';
import ConfirmModal from '../ConfirmModal';
import ListArea from '../table/ListArea';
import TablePager from '../table/TablePager';
import LendModal from '../transactions/LendModal';
import BooksTable, { BOOK_COLUMNS, DEFAULT_BOOK_COLUMNS } from './BooksTable';
import BookCards from './BookCards';
import ColumnsMenu from './ColumnsMenu';
import CategoryModal from './CategoryModal';
import BookFiltersOffcanvas, { ADVANCED_KEYS } from './BookFiltersOffcanvas';
import BookDetailsModal from './BookDetailsModal';
import {
  ADDED_WITHIN, AVAILABILITY, BOOK_SORTS, COPIES, LENGTHS, SEARCH_IN, bookHasHistory, labelOf, languageLabel,
} from '../../utils/books';
import { MESSAGES } from '../../utils/labels';

// Every filter with its default value. Defaults are not written to the URL.
const DEFAULTS = {
  search: '', searchIn: 'all', category: '', availability: '',
  author: '', language: '', yearFrom: '', yearTo: '', length: '', publisher: '', shelf: '', copies: '', addedWithin: '',
  archived: '', // 'include' = "Show archived books" switch is on
  sort: 'title',
};
const FILTER_KEYS = Object.keys(DEFAULTS).filter((k) => k !== 'sort' && k !== 'searchIn');
const EMPTY_FACETS = { categories: [], languages: [], shelves: [], minYear: null, maxYear: null };
const EMPTY_RESULT = { books: [], total: 0, pages: 1 };

// Personal preferences remembered in this browser (not in the URL): table/cards and visible columns.
// localStorage can throw (private mode, blocked storage), so every access is wrapped in try/catch.
const VIEW_KEY = 'stacks.booksView';
const COLUMNS_KEY = 'stacks.bookColumns';
const readView = () => {
  try { return localStorage.getItem(VIEW_KEY) === 'cards' ? 'cards' : 'table'; } catch { return 'table'; }
};
const readColumns = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(COLUMNS_KEY));
    // Keep only ids that still exist (in case a column is renamed later)
    if (Array.isArray(saved)) return saved.filter((id) => BOOK_COLUMNS.some((c) => c.id === id));
  } catch { /* missing or broken value */ }
  return DEFAULT_BOOK_COLUMNS;
};
const save = (key, value) => {
  try { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); } catch { /* storage unavailable */ }
};

// ONE reusable books browser (toolbar + filters + table/cards + pagination), used by the Dashboard and the Books page.
// title: optional heading inside the panel; showActions: adds the Edit/Delete column (Books page).
// mode: 'admin' | 'member' (passed to the details modal). onChanged: called after a delete or a lend.
// selectable: checkboxes on rows/cards (Books page). onExport(selection): "Export" in the selection bar.
export default function BooksBrowser({ title, showActions = false, mode = 'admin', onChanged, selectable = false, onExport, onState }) {
  const navigate = useNavigate();
  const toast = useToast();
  const { filters, page, pageSize, setFilters, setPage, setPageSize, clearFilters } = useUrlFilters(DEFAULTS);
  const [searchText, setSearchText] = useUrlSearchText(filters.search, (v) => setFilters({ search: v }));
  const [view, setView] = useState(readView);
  const [columns, setColumns] = useState(readColumns);

  const [facets, setFacets] = useState(EMPTY_FACETS);
  const [showCategories, setShowCategories] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);         // +1 = fetch the list again (after a change)
  const [detailsId, setDetailsId] = useState(null);      // book shown in the details modal
  // Book waiting for confirmation: { book, archive } (archive = it has history, so it is archived, not deleted)
  const [removeTarget, setRemoveTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [lendBook, setLendBook] = useState(null);        // book chosen for "Lend to member"
  const [detailsReload, setDetailsReload] = useState(0); // +1 = refresh the open details modal

  useEffect(() => save(VIEW_KEY, view), [view]);
  useEffect(() => save(COLUMNS_KEY, columns), [columns]);

  // Filter options (categories, languages, shelves, years): fetched ONCE and cached (utils/facetsCache).
  // Searching, filtering or paging never refetches them.
  useEffect(() => {
    getFacets().then(setFacets).catch(() => {});
  }, []);

  // Only non-empty filters are sent; the server validates every one of them.
  // useMemo keeps the same object while the filters do not change.
  const listParams = useMemo(() => {
    const p = Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== ''));
    if (!p.search) delete p.searchIn;
    return p;
  }, [filters]);
  const { data: result, loading, refreshing, error } = useListQuery('/books', listParams, { page, pageSize, reloadKey });
  const data = result || EMPTY_RESULT;

  // Row selection; cleared automatically when search/filters/sort change (listParams)
  const selection = useSelection(JSON.stringify(listParams));
  const sel = selectable ? selection : undefined;

  // Tell the page what is on screen (used by its Export button: filters, page rows, totals, selection).
  // The page keeps it in a ref (no state), so this never causes an extra render.
  useEffect(() => {
    onState?.({ listParams, filters, page, pageSize, total: data.total, pageIds: data.books.map((b) => b._id), selection, chips });
  });

  // If the last book of the last page was deleted, step back to the new last page
  useEffect(() => {
    if (!loading && data.books.length === 0 && data.total > 0 && page > data.pages) setPage(data.pages);
  }, [loading, data, page, setPage]);

  // After a change: reload the list (old rows stay visible, dimmed), forget cached facet counts,
  // and tell the page (so the stat cards update too)
  const refresh = () => {
    clearFacets();
    setReloadKey((k) => k + 1);
    onChanged?.();
  };
  const editBook = (book) => navigate(`/admin/books/${book._id}/edit`);

  const askRemove = (book) => setRemoveTarget({ book, archive: bookHasHistory(book) });

  const confirmRemoveBook = async () => {
    const { book, archive } = removeTarget;
    setDeleting(true);
    try {
      if (archive) await api.put(`/books/${book._id}/archive`);
      else await api.delete(`/books/${book._id}`);
      toast.success(archive ? `"${book.title}" was archived` : `"${book.title}" was deleted`);
      setRemoveTarget(null);
      refresh();
    } catch (err) {
      // The server found borrowing history we did not know about: switch this dialog to "Archive"
      if (!archive && err.response?.status === 400 && /archive it instead/i.test(errMsg(err))) {
        setRemoveTarget({ book, archive: true });
      } else {
        toast.error(errMsg(err));
      }
    } finally {
      setDeleting(false);
    }
  };

  // Restore needs no confirmation: it only makes the book visible again
  const restoreBook = async (book) => {
    try {
      await api.put(`/books/${book._id}/restore`);
      toast.success(`"${book.title}" was restored to the catalog`);
      refresh();
    } catch (err) {
      toast.error(errMsg(err));
    }
  };

  const advancedCount = ADVANCED_KEYS.filter((k) => filters[k] && k !== 'yearTo').length
    + (filters.yearTo && !filters.yearFrom ? 1 : 0); // "year from–to" counts as ONE filter

  // Chips for every active filter, each with its own "remove" action
  const chips = useMemo(() => {
    const f = filters;
    const list = [];
    const add = (key, label, patch) => list.push({ key, label, onRemove: () => setFilters(patch) });
    if (f.search) add('search', `Search: "${f.search}"${f.searchIn !== 'all' ? ` in ${labelOf(SEARCH_IN, f.searchIn)}` : ''}`, { search: '' });
    if (f.category) add('category', `Category: ${f.category}`, { category: '' });
    if (f.availability) add('availability', `Availability: ${labelOf(AVAILABILITY, f.availability)}`, { availability: '' });
    if (f.author) add('author', `Author: ${f.author}`, { author: '' });
    if (f.language) add('language', `Language: ${languageLabel(f.language)}`, { language: '' });
    if (f.yearFrom || f.yearTo) {
      const label = f.yearFrom && f.yearTo ? `${f.yearFrom}–${f.yearTo}` : f.yearFrom ? `from ${f.yearFrom}` : `until ${f.yearTo}`;
      add('year', `Published: ${label}`, { yearFrom: '', yearTo: '' });
    }
    if (f.length) add('length', `Length: ${labelOf(LENGTHS, f.length)}`, { length: '' });
    if (f.publisher) add('publisher', `Publisher: ${f.publisher}`, { publisher: '' });
    if (f.shelf) add('shelf', `Shelf: ${f.shelf}`, { shelf: '' });
    if (f.copies) add('copies', `Copies: ${labelOf(COPIES, f.copies)}`, { copies: '' });
    if (f.addedWithin) add('added', `Added: ${labelOf(ADDED_WITHIN, f.addedWithin).toLowerCase()}`, { addedWithin: '' });
    if (f.archived) add('archived', 'Archived books shown', { archived: '' });
    return list;
  }, [filters, setFilters]);

  const hasFilters = chips.length > 0;
  const clearAll = () => clearFilters(FILTER_KEYS);
  const listProps = {
    books: data.books, loading, rows: pageSize, showActions,
    onOpen: (b) => setDetailsId(b._id), onEdit: editBook, onDelete: askRemove, onRestore: restoreBook, selection: sel,
  };

  return (
    <section className="panel" aria-label={title || 'Books'}>
      {title && (
        <div className="panel-head">
          <h2 className="h6 mb-0">{title}</h2>
        </div>
      )}

      {/* ---------- Toolbar ---------- */}
      <div className="toolbar">
        <div className="input-group search-group">
          <span className="input-group-text"><Search size={16} aria-hidden="true" /></span>
          <Form.Control
            type="search"
            placeholder="Search books"
            aria-label="Search books"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            maxLength={100}
          />
          <Form.Select
            className="search-in"
            aria-label="Search in"
            value={filters.searchIn}
            onChange={(e) => setFilters({ searchIn: e.target.value })}
          >
            {SEARCH_IN.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Form.Select>
        </div>

        <SegmentedControl
          label="Availability"
          options={AVAILABILITY}
          value={filters.availability}
          onChange={(v) => setFilters({ availability: v })}
        />

        <div className="toolbar-end">
          <Button variant="outline-secondary" onClick={() => setShowCategories(true)} className="text-nowrap">
            {filters.category ? `Category: ${filters.category}` : 'Category'}
          </Button>
          <Button variant="outline-secondary" onClick={() => setShowFilters(true)} className="text-nowrap">
            Filters
            {advancedCount > 0 && <span className="btn-count" aria-label={`${advancedCount} active`}>{advancedCount}</span>}
          </Button>
          <Form.Select
            aria-label="Sort books"
            value={filters.sort}
            onChange={(e) => setFilters({ sort: e.target.value })}
            style={{ width: 'auto' }}
          >
            {BOOK_SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Form.Select>
          {view === 'table' && <ColumnsMenu columns={BOOK_COLUMNS} visible={columns} onChange={setColumns} />}
          {/* Table / Cards layout toggle */}
          <div className="segmented segmented-icons" role="group" aria-label="Layout">
            <button type="button" className={view === 'table' ? 'active' : ''} aria-pressed={view === 'table'} onClick={() => setView('table')} aria-label="Table view" title="Table view">
              <List size={16} aria-hidden="true" />
            </button>
            <button type="button" className={view === 'cards' ? 'active' : ''} aria-pressed={view === 'cards'} onClick={() => setView('cards')} aria-label="Card view" title="Card view">
              <LayoutGrid size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <FilterChips chips={chips} onClearAll={clearAll} />
      {sel && <SelectionBar selection={sel} rows={data.books} total={data.total} noun={['book', 'books']} onExport={onExport && (() => onExport('selected'))} />}

      {error && <div className="alert alert-danger mx-4" role="alert">{error}</div>}

      {/* ---------- Table or cards / empty states ---------- */}
      {!loading && data.books.length === 0 ? (
        hasFilters ? (
          <EmptyState icon={SearchX} title="No books match your filters" text="Try another search word, or remove some filters.">
            <Button variant="outline-primary" size="sm" onClick={clearAll}>Clear all filters</Button>
          </EmptyState>
        ) : (
          <EmptyState icon={BookX} title="No books yet" text="Your catalog is empty. Add your first book to get started." />
        )
      ) : (
        <ListArea refreshing={refreshing}>
          {view === 'cards' ? <BookCards {...listProps} /> : <BooksTable {...listProps} visible={columns} />}
        </ListArea>
      )}

      <TablePager
        page={page}
        pages={data.pages}
        total={data.total}
        count={data.books.length}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        noun={['book', 'books']}
        loading={loading}
      />

      <CategoryModal
        show={showCategories}
        onHide={() => setShowCategories(false)}
        categories={facets.categories}
        value={filters.category}
        onSelect={(c) => setFilters({ category: c })}
      />
      <BookFiltersOffcanvas
        show={showFilters}
        onHide={() => setShowFilters(false)}
        filters={filters}
        facets={facets}
        onApply={setFilters}
        canShowArchived={mode === 'admin'}
      />

      <BookDetailsModal
        show={!!detailsId}
        bookId={detailsId}
        mode={mode}
        onHide={() => setDetailsId(null)}
        onEdit={editBook}
        onDeleted={() => { setDetailsId(null); refresh(); }}
        onChanged={refresh}
        onLend={mode === 'admin' ? setLendBook : undefined}
        reloadKey={detailsReload}
      />

      {/* Opens ON TOP of the details modal (stacked), so the details stay visible behind it */}
      <LendModal
        show={!!lendBook}
        presetBook={lendBook}
        stacked
        onHide={() => setLendBook(null)}
        onLent={() => { refresh(); setDetailsReload((k) => k + 1); }}
      />

      <ConfirmModal
        show={!!removeTarget}
        title={removeTarget?.archive ? 'Archive this book?' : 'Delete this book?'}
        message={removeTarget && (removeTarget.archive
          ? MESSAGES.archiveExplain
          : `"${removeTarget.book.title}" will be removed from the catalog. This cannot be undone.`)}
        confirmLabel={removeTarget?.archive ? 'Archive book' : 'Delete book'}
        confirmVariant={removeTarget?.archive ? 'primary' : 'danger'}
        onConfirm={confirmRemoveBook}
        onCancel={() => setRemoveTarget(null)}
        loading={deleting}
      />
    </section>
  );
}
