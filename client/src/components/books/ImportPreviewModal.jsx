import { useEffect, useState } from 'react';
import { Alert, Button, Modal, Tab, Tabs } from 'react-bootstrap';
import api, { errMsg } from '../../api';
import LoadingButton from '../LoadingButton';
import { csvBlob } from '../../utils/csv';
import { saveBlob } from '../../utils/download';

const SHOW_MAX = 300; // rows drawn per tab (the import itself always uses every row)

// The groups of the preview, in tab order
// label = tab title; chip = [one, many] for the summary chips ("1 error", "2 errors")
const GROUPS = [
  { key: 'ready', label: 'Ready', chip: ['ready', 'ready'], badge: 'badge-success' },
  { key: 'alreadyInLibrary', label: 'Already in library', chip: ['already in library', 'already in library'], badge: 'badge-neutral' },
  { key: 'duplicatesInFile', label: 'Duplicate in file', chip: ['duplicate in file', 'duplicates in file'], badge: 'badge-neutral' },
  { key: 'errors', label: 'Errors', chip: ['error', 'errors'], badge: 'badge-danger' },
  { key: 'warnings', label: 'Warnings', chip: ['warning', 'warnings'], badge: 'badge-warning' },
];

// Columns of the compact table in each tab
const COLUMNS = {
  ready: [
    ['Authors', (r) => r.authors.join('; ')],
    ['Category', (r) => r.category],
    ['Copies', (r) => r.totalCopies],
  ],
  // "Archived in library" when the existing book is archived (its ISBN is still taken)
  alreadyInLibrary: [['In the library as', (r) => (r.archived ? `${r.existingTitle} (archived)` : r.existingTitle)]],
  duplicatesInFile: [['Same book as', (r) => `Row ${r.firstRow}`]],
  errors: [['Problems', (r) => r.reasons.join(' · ')]],
  warnings: [['Changed automatically', (r) => r.messages.join(' · ')]],
};

// Bulk upload, step 2: shows what will happen to every row BEFORE anything is saved.
// preview = the answer of POST /api/books/import/preview; onDone(result) after a successful import.
export default function ImportPreviewModal({ preview, onHide, onDone }) {
  const [tab, setTab] = useState('ready');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Open on the most useful tab: Ready if any, otherwise the first group with rows
  useEffect(() => {
    if (!preview) return;
    setTab(GROUPS.find((g) => preview.counts[g.key] > 0)?.key || 'ready');
    setError('');
  }, [preview]);

  if (!preview) return null;
  const { counts } = preview;
  const problems = counts.errors + counts.alreadyInLibrary + counts.duplicatesInFile + counts.warnings;

  // Error report: every row that will NOT be imported (or was changed), as a CSV the librarian can fix
  const downloadReport = () => {
    const rows = [['Row', 'ISBN', 'Title', 'Result', 'Details']];
    preview.errors.forEach((r) => rows.push([r.row, r.isbn, r.title, 'Error (not imported)', r.reasons.join('; ')]));
    preview.duplicatesInFile.forEach((r) => rows.push([r.row, r.isbn, r.title, 'Duplicate in file (skipped)', `Same book as row ${r.firstRow}`]));
    preview.alreadyInLibrary.forEach((r) => rows.push([r.row, r.isbn, r.title, `${r.reason || 'Already in library'} (skipped)`, `In the library as "${r.existingTitle}"`]));
    preview.warnings.forEach((r) => rows.push([r.row, r.isbn, r.title, 'Imported with a change', r.messages.join('; ')]));
    rows.splice(1, rows.length - 1, ...rows.slice(1).sort((a, b) => a[0] - b[0])); // in file order
    const base = preview.fileName.replace(/\.[^.]+$/, '');
    saveBlob(csvBlob(rows), `${base}-import-report.csv`);
  };

  const runImport = async () => {
    setBusy(true);
    setError('');
    try {
      const { data } = await api.post('/books/import/commit', {
        fileName: preview.fileName,
        rows: preview.ready.map(({ warnings, ...row }) => row), // warnings are only for display
        previewSkipped: counts.alreadyInLibrary + counts.duplicatesInFile,
        previewErrors: counts.errors,
      });
      onDone({
        ...data,
        // the rows skipped in the preview count as skipped too
        skipped: data.skipped + counts.alreadyInLibrary + counts.duplicatesInFile,
        invalid: data.invalid + counts.errors,
      });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  };

  const word = (n) => (n === 1 ? 'book' : 'books');

  return (
    <Modal show onHide={busy ? undefined : onHide} size="xl" fullscreen="sm-down" centered scrollable backdrop={busy ? 'static' : true}>
      <Modal.Header closeButton={!busy}>
        <Modal.Title as="h2" className="h5 min-w-0">
          Check before importing
          <span className="d-block small text-muted fw-normal text-truncate">{preview.fileName} · {preview.totalRows.toLocaleString()} rows</span>
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <div className="import-chips" aria-label="Summary">
          {GROUPS.map((g) => (
            <span key={g.key} className={`status-badge ${counts[g.key] ? g.badge : 'badge-neutral'}`}>
              {counts[g.key].toLocaleString()} {g.chip[counts[g.key] === 1 ? 0 : 1]}
            </span>
          ))}
        </div>
        {(preview.unknownHeaders.length > 0 || preview.missingOptional.length > 0) && (
          <p className="small text-muted mb-2">
            {preview.unknownHeaders.length > 0 && <>Ignored columns: {preview.unknownHeaders.join(', ')}. </>}
            {preview.missingOptional.length > 0 && <>Not in the file (left empty): {preview.missingOptional.join(', ')}.</>}
          </p>
        )}

        <Tabs activeKey={tab} onSelect={(k) => setTab(k)} variant="underline" className="mb-2 import-tabs" mountOnEnter>
          {GROUPS.map((g) => (
            <Tab key={g.key} eventKey={g.key} title={`${g.label} (${counts[g.key].toLocaleString()})`} disabled={!counts[g.key]}>
              <div className="table-responsive import-table-wrap">
                <table className="table data-table mini-table align-middle mb-0">
                  <thead>
                    <tr>
                      <th scope="col">Row</th>
                      <th scope="col">ISBN</th>
                      <th scope="col">Title</th>
                      {COLUMNS[g.key].map(([h]) => <th key={h} scope="col">{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {preview[g.key].slice(0, SHOW_MAX).map((r) => (
                      <tr key={`${g.key}-${r.row}`}>
                        <td className="cell-muted">{r.row}</td>
                        <td className="text-nowrap">{r.isbn || '—'}</td>
                        <td><span className="cell-ellipsis" style={{ maxWidth: '32ch' }} title={r.title}>{r.title || '—'}</span></td>
                        {COLUMNS[g.key].map(([h, get]) => (
                          <td key={h} className={g.key === 'errors' ? 'text-danger-emphasis' : undefined}>
                            {/* Problems/changes wrap (min width, so they stay readable on phones); other values are cut with "…" */}
                            <span className={g.key === 'errors' || g.key === 'warnings' ? 'import-detail' : 'cell-ellipsis'}>{get(r)}</span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview[g.key].length > SHOW_MAX && (
                <p className="small text-muted mt-2 mb-0">
                  Showing the first {SHOW_MAX} of {preview[g.key].length.toLocaleString()} rows.
                  {g.key === 'ready' ? ' All of them will be imported.' : ' The report has all of them.'}
                </p>
              )}
            </Tab>
          ))}
        </Tabs>
        {error && <Alert variant="danger" className="small mt-3 mb-0 py-2" role="alert">{error}</Alert>}
      </Modal.Body>
      <Modal.Footer className="import-footer">
        {problems > 0 && (
          <Button variant="outline-secondary" className="me-auto" onClick={downloadReport} disabled={busy}>Download error report</Button>
        )}
        <Button variant="outline-secondary" onClick={onHide} disabled={busy}>Cancel</Button>
        <LoadingButton variant="primary" onClick={runImport} loading={busy} loadingText="Importing…" disabled={!counts.ready}>
          Import {counts.ready.toLocaleString()} {word(counts.ready)}
        </LoadingButton>
      </Modal.Footer>
    </Modal>
  );
}
