import { Button } from 'react-bootstrap';

// Strip above a selectable list:
// - "12 selected · Export · Clear" whenever something is selected
// - "All 10 on this page are selected. Select all 1,000 matching" when the whole page is ticked
// - "All 1,000 matching are selected. Clear selection" after choosing all matching rows
// - a quiet note when the selection was cleared because the filters changed
// noun: [singular, plural]; onExport: optional (opens the export dialog with "Selected").
export default function SelectionBar({ selection, rows, total, noun = ['item', 'items'], onExport }) {
  const { ids, allMatching, note, hasSelection, pageState, selectAllMatching, clear } = selection;
  if (!hasSelection) {
    return note ? <div className="selection-note" role="status">{note}</div> : null;
  }
  const count = allMatching ? total : ids.size;
  const word = (n) => (n === 1 ? noun[0] : noun[1]);
  const pageAll = rows.length > 0 && pageState(rows) === 'all';

  return (
    <div className="selection-bar" role="region" aria-label="Selection">
      <strong className="text-nowrap">{count.toLocaleString()} selected</strong>
      {pageAll && !allMatching && total > rows.length && (
        <span className="selection-hint">
          All {rows.length} on this page are selected.{' '}
          <Button variant="link" size="sm" className="p-0 align-baseline" onClick={() => selectAllMatching(rows)}>
            Select all {total.toLocaleString()} matching
          </Button>
        </span>
      )}
      {allMatching && (
        <span className="selection-hint">All {total.toLocaleString()} matching {word(total)} are selected.</span>
      )}
      <span className="ms-auto d-inline-flex gap-2">
        {onExport && <Button variant="outline-secondary" size="sm" onClick={onExport}>Export</Button>}
        <Button variant="link" size="sm" onClick={clear}>{allMatching ? 'Clear selection' : 'Clear'}</Button>
      </span>
    </div>
  );
}
