import DataTable from '../table/DataTable';
import BookCover from './BookCover';
import Availability from './Availability';
import BookActions, { ArchivedBadge } from './BookActions';
import { languageLabel } from '../../utils/books';

// Optional columns the librarian can show/hide with the "Columns" menu (the Book column is always shown).
// className hides a column on small screens even when it is switched on (responsive).
export const BOOK_COLUMNS = [
  { id: 'publisher', label: 'Publisher', defaultOn: true },
  { id: 'isbn', label: 'ISBN', defaultOn: false },
  { id: 'category', label: 'Category', defaultOn: true },
  { id: 'published', label: 'Published', defaultOn: true },
  { id: 'shelf', label: 'Shelf', defaultOn: true },
  { id: 'language', label: 'Language', defaultOn: false },
  { id: 'description', label: 'Description', defaultOn: false },
  { id: 'availability', label: 'Availability', defaultOn: true },
];
export const DEFAULT_BOOK_COLUMNS = BOOK_COLUMNS.filter((c) => c.defaultOn).map((c) => c.id);

const DESC_CHARS = 90; // visible characters in the Description column

// "First 90 characters…" for the cell, and the longer preview for the native tooltip (title)
function descriptionCell(b) {
  const text = b.descriptionPreview || '';
  if (!text) return '—';
  const more = (b.descriptionLength || 0) > text.length; // the server only sends 160 characters
  const short = text.length > DESC_CHARS ? `${text.slice(0, DESC_CHARS).trim()}…` : text;
  return <span className="cell-clamp cell-desc" title={more ? `${text}…` : text}>{short}</span>;
}

// Books in the shared DataTable.
// visible: ids of the optional columns that are switched on.
export default function BooksTable({ books, loading, rows = 10, showActions = false, visible = DEFAULT_BOOK_COLUMNS, onOpen, onEdit, onDelete, onRestore, selection }) {
  const all = [
    {
      // Primary column: full-contrast text (title + author line), everything else is muted
      key: 'book', header: 'Book', main: true, primary: true, skeleton: 'cover',
      render: (b) => (
        <div className="d-flex align-items-center gap-3">
          <BookCover book={b} />
          <div className="min-w-0">
            <div className="cell-title cell-clamp">{b.title}</div>
            {b.isArchived && <ArchivedBadge />}
            <div className="cell-sub text-truncate">{b.authors?.join(', ')}</div>
            {/* Phones: the Availability column is hidden, so show it here */}
            <div className="d-sm-none"><Availability book={b} /></div>
          </div>
        </div>
      ),
    },
    {
      key: 'publisher', header: 'Publisher', className: 'd-none d-lg-table-cell',
      // One line, cut with "…" after about 24 characters; the full name is in the tooltip
      render: (b) => <span className="cell-ellipsis" title={b.publisher || undefined}>{b.publisher || '—'}</span>,
    },
    { key: 'isbn', header: 'ISBN', className: 'd-none d-xl-table-cell mono text-nowrap', render: (b) => b.isbn },
    { key: 'category', header: 'Category', className: 'd-none d-md-table-cell', skeleton: 'badge', render: (b) => <span className="tag">{b.category}</span> },
    { key: 'published', header: 'Published', className: 'd-none d-lg-table-cell', render: (b) => b.publishedYear || '—' },
    { key: 'shelf', header: 'Shelf', className: 'd-none d-xl-table-cell mono small text-nowrap', render: (b) => b.shelfLocation || '—' },
    { key: 'language', header: 'Language', className: 'd-none d-xl-table-cell text-nowrap', render: (b) => languageLabel(b.language) },
    { key: 'description', header: 'Description', className: 'd-none d-xl-table-cell col-desc', render: descriptionCell },
    { key: 'availability', header: 'Availability', className: 'd-none d-sm-table-cell text-nowrap', render: (b) => <Availability book={b} /> },
    ...(showActions ? [{
      key: 'actions', header: 'Actions', hiddenHeader: true, actions: true, skeleton: 'actions',
      render: (b) => <BookActions book={b} onEdit={onEdit} onDelete={onDelete} onRestore={onRestore} />,
    }] : []),
  ];
  const columns = all.filter((c) => c.key === 'book' || c.key === 'actions' || visible.includes(c.key));

  return (
    <DataTable
      columns={columns}
      rows={books}
      loading={loading}
      skeletonRows={rows}
      onRowClick={onOpen}
      rowLabel={(b) => `View details of ${b.title}`}
      selection={selection}
    />
  );
}
