import { useEffect, useState } from 'react';
import { Alert, Button, Form, Modal } from 'react-bootstrap';
import { FileSpreadsheet, FileText, Sheet } from 'lucide-react';
import api from '../../api';
import LoadingButton from '../LoadingButton';
import { useToast } from '../../context/ToastContext';
import { blobErrorMessage, fileNameFrom, saveBlob } from '../../utils/download';

// Same limits as the server (routes/export.js); checked here too so the button explains it early
const FORMATS = [
  { value: 'csv', label: 'CSV', hint: 'Plain table, opens anywhere', icon: Sheet, max: 10000 },
  { value: 'xlsx', label: 'Excel', hint: 'Formatted, with filters', icon: FileSpreadsheet, max: 10000 },
  { value: 'pdf', label: 'PDF', hint: 'Ready to print or share', icon: FileText, max: 2000 },
];

// Export dialog shared by Books, Members and Transactions.
//   entity       'books' | 'members' | 'transactions' (POST /api/export/:entity)
//   noun         ['book', 'books'] for the texts
//   initialScope 'selected' | 'filtered' (what was clicked to open it)
//   selection    the page's useSelection() object (may be undefined)
//   filters      the SAME params the list request uses (search, filters, sort)
//   filterLabels the active filter chips as text, e.g. ['Category: Fiction']
//   page, pageSize, pageCount  current page number, rows per page, rows on this page
//   total        rows matching the current filters
export default function ExportModal({
  show, onHide, entity, noun, initialScope, selection, filters, filterLabels = [], page, pageSize, pageCount, total,
}) {
  const toast = useToast();
  const [format, setFormat] = useState('xlsx');
  const [scope, setScope] = useState('filtered');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // "Select all matching" counts as a selection of everything that matches the filters
  const selectedCount = selection?.allMatching ? total : selection?.ids.size || 0;

  // Default scope each time the dialog opens: "Selected" when something is selected, else "All matching"
  useEffect(() => {
    if (!show) return;
    setScope(initialScope === 'selected' || selectedCount > 0 ? 'selected' : 'filtered');
    setError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show]);

  const word = (n) => (n === 1 ? noun[0] : noun[1]);
  const counts = { selected: selectedCount, page: pageCount, filtered: total };
  const count = counts[scope];
  const fmt = FORMATS.find((f) => f.value === format);
  const tooMany = count > fmt.max;

  const scopes = [
    { value: 'selected', label: `Selected (${selectedCount.toLocaleString()})`, disabled: selectedCount === 0 },
    { value: 'page', label: `Current page (${pageCount.toLocaleString()})`, disabled: pageCount === 0 },
    { value: 'filtered', label: `All matching current filters (${total.toLocaleString()})`, disabled: total === 0 },
  ];

  const runExport = async () => {
    setBusy(true);
    setError('');
    // "All matching" selected -> export by filters (no need to send thousands of ids)
    const useFilters = scope === 'filtered' || (scope === 'selected' && selection?.allMatching);
    const body = {
      format,
      scope: useFilters ? 'filtered' : scope,
      filters,
      ...(scope === 'page' ? { page, limit: pageSize } : {}),
      ...(scope === 'selected' && !useFilters ? { ids: [...selection.ids] } : {}),
    };
    try {
      // responseType 'blob': the answer is a file, not JSON
      const res = await api.post(`/export/${entity}`, body, { responseType: 'blob' });
      saveBlob(res.data, fileNameFrom(res.headers, `stacks-${entity}.${format}`));
      const n = Number(res.headers['x-export-count'] ?? count);
      toast.success(`Exported ${n.toLocaleString()} ${word(n)} as ${fmt.label}`);
      onHide();
    } catch (err) {
      setError(await blobErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal show={show} onHide={busy ? undefined : onHide} centered backdrop={busy ? 'static' : true}>
      <Modal.Header closeButton={!busy}>
        <Modal.Title as="h2" className="h5">Export {noun[1]}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <fieldset className="mb-3">
          <legend className="form-label">Format</legend>
          <div className="export-formats" role="radiogroup">
            {FORMATS.map((f) => {
              const Icon = f.icon;
              return (
                <label key={f.value} className={`export-format${format === f.value ? ' is-selected' : ''}`}>
                  <input type="radio" name="export-format" className="visually-hidden" value={f.value}
                    checked={format === f.value} onChange={() => setFormat(f.value)} disabled={busy} />
                  <Icon size={20} aria-hidden="true" />
                  <span className="export-format-name">{f.label}</span>
                  <span className="export-format-hint">{f.hint}</span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="mb-3">
          <legend className="form-label">Rows</legend>
          {scopes.map((s) => (
            <Form.Check key={s.value} type="radio" id={`export-scope-${s.value}`} name="export-scope" label={s.label}
              checked={scope === s.value} disabled={s.disabled || busy} onChange={() => setScope(s.value)} className="mb-1" />
          ))}
        </fieldset>

        <div className="export-summary">
          <span className="text-muted">Filters: </span>
          {scope === 'selected' && !selection?.allMatching
            ? `only the ${selectedCount.toLocaleString()} selected ${word(selectedCount)}`
            : filterLabels.length ? filterLabels.join(' · ') : `none (every ${noun[0]})`}
        </div>

        {format === 'pdf' && (
          <p className="small text-muted mt-2 mb-0">
            PDF includes the key columns so it fits the page; CSV and Excel include every field.
          </p>
        )}
        {tooMany && (
          <Alert variant="warning" className="small mt-3 mb-0 py-2">
            {fmt.label} exports are limited to {fmt.max.toLocaleString()} rows.
            {format === 'pdf' ? ' Choose CSV or Excel, or narrow the filters.' : ' Narrow the filters first.'}
          </Alert>
        )}
        {error && <Alert variant="danger" className="small mt-3 mb-0 py-2" role="alert">{error}</Alert>}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={busy}>Cancel</Button>
        <LoadingButton variant="primary" onClick={runExport} loading={busy} loadingText="Exporting…" disabled={!count || tooMany}>
          Export {count.toLocaleString()} {word(count)}
        </LoadingButton>
      </Modal.Footer>
    </Modal>
  );
}
