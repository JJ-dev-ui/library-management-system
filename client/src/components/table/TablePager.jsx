import { Dropdown } from 'react-bootstrap';
import Skeleton from 'react-loading-skeleton';
import Pagination from '../Pagination';
import { PAGE_SIZES } from '../../hooks/useUrlFilters';

// Footer under every table: "Show 10 ▴" (rows per page) + "Showing 991–999 of 999 books" + page numbers.
// noun: [singular, plural], e.g. ['book', 'books']. Without onPageSizeChange the "Show N" menu is hidden.
export default function TablePager({
  page, pages, total, count, pageSize, onPageChange, onPageSizeChange, noun = ['item', 'items'], loading = false,
}) {
  const word = (n) => (n === 1 ? noun[0] : noun[1]);
  // Range of the rows on this page, e.g. page 100 of 10-row pages with 999 books -> 991–999
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = total === 0 ? 0 : from + count - 1;

  return (
    <div className="panel-foot">
      <div className="d-flex align-items-center gap-3 flex-wrap">
        {/* drop="up": the menu opens upwards because the pager sits at the bottom of the page */}
        {onPageSizeChange && (
        <Dropdown drop="up" onSelect={(key) => onPageSizeChange(Number(key))}>
          <Dropdown.Toggle variant="outline-secondary" size="sm" id={`page-size-${noun[1]}`} aria-label="Rows per page">
            Show {pageSize}
          </Dropdown.Toggle>
          <Dropdown.Menu>
            {PAGE_SIZES.map((n) => (
              <Dropdown.Item key={n} eventKey={String(n)} active={n === pageSize}>Show {n}</Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown>
        )}
        <span className="meta" aria-live="polite">
          {loading
            ? <Skeleton width={220} />
            : `Showing ${from.toLocaleString()}–${to.toLocaleString()} of ${total.toLocaleString()} ${word(total)}`}
        </span>
      </div>
      <Pagination page={page} pages={pages} onChange={onPageChange} />
    </div>
  );
}
