import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Button, Spinner } from 'react-bootstrap';
import { CircleCheck, FileUp } from 'lucide-react';
import api from '../../api';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import ImportPreviewModal from '../../components/books/ImportPreviewModal';
import { useToast } from '../../context/ToastContext';
import { blobErrorMessage, fileNameFrom, saveBlob } from '../../utils/download';
import { clearFacets } from '../../utils/facetsCache';

const MAX_BYTES = 2 * 1024 * 1024; // same limits as the server (routes/bookImport.js)
const MAX_ROWS = 1000;

// /admin/books/import — bulk upload in 3 steps:
//   1. download a template and fill it in   2. upload: the server checks the file, nothing is saved yet
//   3. preview (ImportPreviewModal) -> "Import N books" -> result screen
export default function BookImportPage() {
  const toast = useToast();
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);

  const downloadTemplate = async (format) => {
    try {
      const res = await api.get('/books/import/template', { params: { format }, responseType: 'blob' });
      saveBlob(res.data, fileNameFrom(res.headers, `stacks-books-import-template.${format}`));
    } catch (err) {
      toast.error(await blobErrorMessage(err));
    }
  };

  // Quick checks in the browser first (clear message, no upload); the server checks everything again
  const checkFile = async (file) => {
    setError('');
    if (!file) return;
    if (!/\.(csv|xlsx)$/i.test(file.name)) return setError('Choose a .csv or .xlsx file.');
    if (file.size > MAX_BYTES) return setError('The file is larger than 2 MB. Split it into smaller files.');
    const form = new FormData();
    form.append('file', file);
    setChecking(true);
    try {
      const { data } = await api.post('/books/import/preview', form);
      setPreview(data);
    } catch (err) {
      setError(err.response?.data?.message || 'The file could not be checked. Please try again.');
    } finally {
      setChecking(false);
      if (inputRef.current) inputRef.current.value = ''; // choosing the same file again still triggers onChange
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (!checking) checkFile(e.dataTransfer.files?.[0]);
  };

  const finish = (res) => {
    setPreview(null);
    setResult(res);
    clearFacets(); // new categories / languages may appear in the Books filters
    toast.success(`Imported ${res.imported.toLocaleString()} ${res.imported === 1 ? 'book' : 'books'}`);
  };

  if (result) {
    return (
      <>
        <PageHeader title="Bulk upload" description="Import many books at once from a CSV or Excel file." />
        <div className="panel">
          <EmptyState
            icon={CircleCheck}
            title={`Imported ${result.imported.toLocaleString()} ${result.imported === 1 ? 'book' : 'books'}`}
            text={[
              result.skipped ? `${result.skipped.toLocaleString()} skipped (already in the library or repeated in the file)` : '',
              result.invalid ? `${result.invalid.toLocaleString()} with errors not imported` : '',
            ].filter(Boolean).join(' · ') || 'Every book in the file was added.'}
          >
            <div className="d-flex flex-wrap gap-2 justify-content-center">
              {/* "Date added: Today", newest first: the books just imported are on top */}
              <Link to="/admin/books?addedWithin=today&sort=newest" className="btn btn-primary">View imported books</Link>
              <Button variant="outline-secondary" onClick={() => setResult(null)}>Import another file</Button>
            </div>
          </EmptyState>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Bulk upload" description="Import many books at once from a CSV or Excel file." />
      <div className="import-steps">
        <section className="panel import-step" aria-labelledby="step-template">
          <h2 id="step-template" className="h6"><span className="step-num">1</span>Download a template</h2>
          <p className="meta">
            One book per row. ISBN, Title and Authors are required; separate several authors or subjects with ";".
            The Excel template has examples and an Instructions sheet.
          </p>
          <div className="d-flex flex-wrap gap-2">
            <Button variant="outline-secondary" onClick={() => downloadTemplate('xlsx')}>Excel template</Button>
            <Button variant="outline-secondary" onClick={() => downloadTemplate('csv')}>CSV template</Button>
          </div>
        </section>

        <section className="panel import-step" aria-labelledby="step-upload">
          <h2 id="step-upload" className="h6"><span className="step-num">2</span>Upload your file</h2>
          <div
            className={`import-drop${dragging ? ' is-dragging' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            {checking ? (
              <div className="d-flex align-items-center gap-2" role="status">
                <Spinner animation="border" size="sm" aria-hidden="true" /> Checking the file…
              </div>
            ) : (
              <>
                <FileUp size={26} aria-hidden="true" className="text-muted" />
                <div>
                  <strong>Drop a .csv or .xlsx file here</strong>
                  <div className="meta">Up to {MAX_ROWS.toLocaleString()} books and 2 MB. Nothing is saved until you confirm.</div>
                </div>
                <Button variant="primary" onClick={() => inputRef.current?.click()}>Choose file</Button>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="d-none"
              onChange={(e) => checkFile(e.target.files?.[0])}
            />
          </div>
          {error && <Alert variant="danger" className="small mt-3 mb-0 py-2" role="alert">{error}</Alert>}
        </section>
      </div>

      <ImportPreviewModal preview={preview} onHide={() => setPreview(null)} onDone={finish} />
    </>
  );
}
