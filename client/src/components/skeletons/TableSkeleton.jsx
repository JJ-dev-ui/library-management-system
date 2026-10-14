import Skeleton from 'react-loading-skeleton';

// Placeholder <tr> rows rendered INSIDE the real table's <tbody>, under the real header,
// so column widths match and nothing jumps when the data arrives.
// columns: a number (plain text cells) or an array like
//   [{ type: 'cover', main: true }, { type: 'text', className: 'd-none d-md-table-cell' }, { type: 'badge' }]
// types: cover (book cover + 2 lines) | avatar (circle + 2 lines) | text | twoLine | badge | actions
// main: true marks the column that has .col-main in the real table, so the widths match.
const WIDTHS = ['70%', '55%', '80%', '60%', '45%']; // fixed list (not random) so rows look natural but stable

function Cell({ type, row }) {
  const w = WIDTHS[row % WIDTHS.length];
  switch (type) {
    case 'cover':
    case 'avatar':
      return (
        <div className="d-flex align-items-center gap-3">
          {type === 'cover'
            ? <Skeleton width={32} height={46} borderRadius={4} />
            : <Skeleton circle width={36} height={36} />}
          <div className="flex-grow-1">
            <div className="cell-title"><Skeleton width={w} /></div>
            <div className="cell-sub"><Skeleton width="40%" /></div>
          </div>
        </div>
      );
    case 'twoLine':
      return (<><div><Skeleton width={w} /></div><div className="cell-sub"><Skeleton width="45%" /></div></>);
    case 'check':
      return <Skeleton width={16} height={16} borderRadius={4} />;
    case 'badge':
      return <Skeleton width={76} height={22} borderRadius={999} />;
    case 'actions':
      return <span className="d-inline-flex gap-1"><Skeleton width={32} height={32} /><Skeleton width={32} height={32} /></span>;
    default:
      return <Skeleton width={w} />;
  }
}

export default function TableSkeleton({ rows = 8, columns = 4 }) {
  const cols = typeof columns === 'number' ? Array.from({ length: columns }, () => ({ type: 'text' })) : columns;
  return Array.from({ length: rows }, (_, r) => (
    <tr key={r} aria-hidden="true">
      {cols.map((c, i) => (
        <td key={i} className={[c.className, c.main && 'col-main'].filter(Boolean).join(' ') || undefined}><Cell type={c.type} row={r + i} /></td>
      ))}
    </tr>
  ));
}
