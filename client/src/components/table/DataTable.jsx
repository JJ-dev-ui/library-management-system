import TableSkeleton from '../skeletons/TableSkeleton';
import RowCheckbox from './RowCheckbox';

// ONE table component for Books, Members and Transactions (and the Dashboard, through BooksBrowser).
// columns: [{
//   key, header,                 header text (or a node)
//   render: (row) => node,       what to show in the cell
//   className,                   e.g. 'd-none d-lg-table-cell' to hide a column on small screens
//   main: true,                  the wide column that truncates long text instead of pushing others off screen
//   primary: true,               full-contrast text; every other column uses the muted text colour
//   skeleton: 'text',            skeleton shape while loading: cover | avatar | text | twoLine | badge | actions
//   actions: true,               buttons column: right-aligned, and clicks do NOT open the row
//   hiddenHeader: true,          header only for screen readers
// }]
// onRowClick: makes rows clickable (mouse, or Tab + Enter/Space).
// selection: the object from hooks/useSelection -> adds a checkbox column (header = whole page).
export default function DataTable({ columns: baseColumns, rows, loading, skeletonRows = 10, onRowClick, rowLabel, getRowKey = (r) => r._id, selection }) {
  // Optional first column with checkboxes
  const pageState = selection && rows.length ? selection.pageState(rows) : 'none';
  const columns = selection ? [{
    key: '__select', className: 'col-check', primary: true, skeleton: 'check',
    header: <RowCheckbox checked={pageState === 'all'} indeterminate={pageState === 'some'} onToggle={() => selection.togglePage(rows)} label="Select all rows on this page" />,
    render: (row, index) => (
      <RowCheckbox checked={selection.ids.has(row._id)} onToggle={(shift) => selection.toggle(rows, index, shift)} label={`Select ${rowLabel ? rowLabel(row) : 'row'}`} />
    ),
  }, ...baseColumns] : baseColumns;

  // Text hierarchy: primary columns keep the normal text colour, all other cells are muted (.cell-muted)
  const cellClass = (c) => [c.className, c.main && 'col-main', c.actions && 'col-actions', !c.primary && !c.actions && 'cell-muted']
    .filter(Boolean).join(' ') || undefined;

  const onKey = (row) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRowClick(row);
    }
  };

  return (
    // position: relative in .table-scroll keeps everything inside, so phones never scroll sideways
    <div className="table-scroll">
      <table className="table table-hover data-table align-middle" aria-busy={loading}>
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cellClass(c)}>
                {c.hiddenHeader ? <span className="visually-hidden">{c.header}</span> : c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <TableSkeleton
              rows={skeletonRows}
              columns={columns.map((c) => ({ type: c.skeleton || 'text', className: cellClass(c), main: c.main }))}
            />
          ) : rows.map((row, index) => (
            <tr
              key={getRowKey(row)}
              className={[onRowClick && 'row-clickable', selection?.ids.has(row._id) && 'is-selected'].filter(Boolean).join(' ') || undefined}
              tabIndex={onRowClick ? 0 : undefined}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              onKeyDown={onRowClick ? onKey(row) : undefined}
              aria-label={rowLabel ? rowLabel(row) : undefined}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cellClass(c)}
                  // stopPropagation: clicking a button in the actions column must not also open the row
                  onClick={c.actions ? (e) => e.stopPropagation() : undefined}
                  onKeyDown={c.actions ? (e) => e.stopPropagation() : undefined}
                >
                  {c.render(row, index)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
