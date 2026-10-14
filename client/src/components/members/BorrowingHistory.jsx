import { useEffect, useState } from 'react';
import DataTable from '../table/DataTable';
import TablePager from '../table/TablePager';
import CopyableText from '../CopyableText';
import BookCover from '../books/BookCover';
import StatusBadge from '../transactions/StatusBadge';
import { formatDate, formatDateTime } from '../../utils/format';
import { STATUS_LABELS } from '../../utils/labels';

const PER_PAGE = 10;

// "Borrowing history" tab of the member modal: summary numbers + the shared DataTable with its own pager.
// The server already sends the whole history (newest first), so paging happens here in the browser.
// onOpen(tx): a row was clicked -> show the transaction details.
export default function BorrowingHistory({ history, stats, onOpen }) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [history]); // another member -> first page

  const pages = Math.max(1, Math.ceil(history.length / PER_PAGE));
  const rows = history.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const columns = [
    { key: 'code', header: 'Code', primary: true, className: 'd-none d-md-table-cell text-nowrap', render: (t) => <CopyableText value={t.code} label="Transaction code" /> },
    {
      key: 'book', header: 'Book', main: true, primary: true, skeleton: 'cover',
      render: (t) => (
        <div className="d-flex align-items-center gap-2">
          <BookCover book={t.book || { title: '?' }} size="sm" />
          <span className="cell-title cell-clamp">{t.book?.title || 'Deleted book'}</span>
        </div>
      ),
    },
    { key: 'borrowed', header: 'Borrowed', className: 'd-none d-lg-table-cell text-nowrap', render: (t) => formatDateTime(t.borrowedAt) },
    { key: 'return', header: 'Return date', className: 'd-none d-sm-table-cell text-nowrap', render: (t) => formatDate(t.dueDate) },
    { key: 'returned', header: 'Returned', className: 'd-none d-lg-table-cell text-nowrap', render: (t) => (t.returnedAt ? formatDateTime(t.returnedAt) : '—') },
    { key: 'status', header: 'Status', skeleton: 'badge', render: (t) => <StatusBadge status={t.derivedStatus} /> },
  ];

  return (
    <>
      <div className="copies-row mb-3">
        <div><div className="meta">Total borrowed</div><div className="num">{stats.totalBorrowed}</div></div>
        <div><div className="meta">Borrowed now</div><div className="num">{stats.activeLoans}</div></div>
        <div><div className="meta">{STATUS_LABELS.overdue}</div><div className={`num ${stats.overdueLoans ? 'text-danger' : ''}`}>{stats.overdueLoans}</div></div>
        <div><div className="meta">On-time returns</div><div className="num">{stats.onTimeRate === null ? '—' : `${stats.onTimeRate}%`}</div></div>
      </div>
      {history.length === 0 ? (
        <p className="meta mb-0">No transactions yet.</p>
      ) : (
        <div className="border rounded-3 overflow-hidden">
          <DataTable
            columns={columns}
            rows={rows}
            loading={false}
            onRowClick={onOpen}
            rowLabel={(t) => `View transaction ${t.code || ''} for ${t.book?.title || 'a deleted book'}`}
          />
          <TablePager page={page} pages={pages} total={history.length} count={rows.length} pageSize={PER_PAGE}
            onPageChange={setPage} noun={['transaction', 'transactions']} />
        </div>
      )}
    </>
  );
}
