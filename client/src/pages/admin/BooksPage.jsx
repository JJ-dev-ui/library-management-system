import { useRef, useState } from 'react';
import { Button } from 'react-bootstrap';
import PageHeader from '../../components/PageHeader';
import AddBookMenu from '../../components/admin/AddBookMenu';
import LibraryStats from '../../components/admin/LibraryStats';
import BooksBrowser from '../../components/books/BooksBrowser';
import ExportModal from '../../components/table/ExportModal';

// /admin/books — stat cards + the same BooksBrowser as the dashboard, with Edit/Delete on every row
// and checkboxes for selecting rows to export.
// "page-fill": on desktop the page fits the window and only the table scrolls (see admin.css)
export default function BooksPage() {
  const [statsKey, setStatsKey] = useState(0); // +1 after a delete/lend, so the numbers update
  // Latest filters/page/selection reported by BooksBrowser. A ref (not state): it changes on every
  // render of the list, and storing it in state would re-render this page in a loop.
  const listState = useRef(null);
  // Snapshot taken when the Export dialog opens. It is kept after closing, so the texts do not
  // change during the closing animation.
  const [exportCtx, setExportCtx] = useState(null);
  const [showExport, setShowExport] = useState(false);

  const openExport = (scope) => {
    if (!listState.current) return;
    setExportCtx({ ...listState.current, scope });
    setShowExport(true);
  };

  return (
    <div className="page-fill">
      <PageHeader title="Books" description="Search, filter and manage every title in the library.">
        <Button variant="outline-secondary" onClick={() => openExport('filtered')}>Export</Button>
        <AddBookMenu />
      </PageHeader>
      <LibraryStats reloadKey={statsKey} />
      <BooksBrowser
        showActions
        selectable
        onExport={openExport}
        onState={(s) => { listState.current = s; }}
        onChanged={() => setStatsKey((k) => k + 1)}
      />
      <ExportModal
        show={showExport}
        onHide={() => setShowExport(false)}
        entity="books"
        noun={['book', 'books']}
        initialScope={exportCtx?.scope}
        selection={exportCtx?.selection}
        filters={exportCtx?.listParams}
        filterLabels={(exportCtx?.chips || []).map((c) => c.label)}
        page={exportCtx?.page}
        pageSize={exportCtx?.pageSize}
        pageCount={exportCtx?.pageIds.length || 0}
        total={exportCtx?.total || 0}
      />
    </div>
  );
}
