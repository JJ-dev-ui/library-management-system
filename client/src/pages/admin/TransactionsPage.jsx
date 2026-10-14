import { useEffect, useMemo, useState } from 'react';
import { Button, Form, Offcanvas, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { AlarmClock, ArrowLeftRight, BookOpen, CalendarClock, CircleCheck, RefreshCw, Search, SearchX, Undo2 } from 'lucide-react';
import api, { errMsg } from '../../api';
import { useToast } from '../../context/ToastContext';
import useUrlFilters, { useUrlSearchText } from '../../hooks/useUrlFilters';
import useListQuery from '../../hooks/useListQuery';
import ListArea from '../../components/table/ListArea';
import SelectionBar from '../../components/table/SelectionBar';
import useSelection from '../../hooks/useSelection';
import ExportModal from '../../components/table/ExportModal';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/admin/StatCard';
import FilterChips from '../../components/FilterChips';
import EmptyState from '../../components/EmptyState';
import ConfirmModal from '../../components/ConfirmModal';
import Avatar from '../../components/Avatar';
import BookCover from '../../components/books/BookCover';
import DataTable from '../../components/table/DataTable';
import TablePager from '../../components/table/TablePager';
import StatusBadge from '../../components/transactions/StatusBadge';
import LendModal from '../../components/transactions/LendModal';
import TransactionDetailsModal from '../../components/transactions/TransactionDetailsModal';
import CopyableText from '../../components/CopyableText';
import { dayEndISO, dayStartISO, dueText, formatDate, formatDateTime } from '../../utils/format';
import { TX_SORTS, TX_TABS, extendBlockReason, extendMessage, extensionsUsed } from '../../utils/transactions';
import { EXTEND, LATE } from '../../utils/labels';

// URL keys keep the API names (dueFrom/dueTo = the RETURN DATE range); only the labels say "Return date"
const DEFAULTS = { search: '', status: '', borrowedFrom: '', borrowedTo: '', dueFrom: '', dueTo: '', sort: 'newest' };
const DATE_KEYS = ['borrowedFrom', 'borrowedTo', 'dueFrom', 'dueTo'];
const EMPTY_RESULT = { transactions: [], total: 0, pages: 1, counts: null };

// "Mar 3, 2026 – Mar 9, 2026", "from Mar 3, 2026", "until Mar 9, 2026"
const rangeLabel = (from, to) => {
  const f = (d) => formatDate(`${d}T00:00:00`);
  if (from && to) return `${f(from)} – ${f(to)}`;
  return from ? `from ${f(from)}` : `until ${f(to)}`;
};

// Right-side panel with the two date ranges (edits a draft until "Apply")
function DateFilters({ show, onHide, filters, onApply }) {
  const pick = () => Object.fromEntries(DATE_KEYS.map((k) => [k, filters[k]]));
  const [draft, setDraft] = useState(pick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (show) setDraft(pick()); }, [show]);

  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const bad = (from, to) => from && to && to < from; // "YYYY-MM-DD" strings compare correctly
  const borrowedErr = bad(draft.borrowedFrom, draft.borrowedTo);
  const returnErr = bad(draft.dueFrom, draft.dueTo);

  const apply = (e) => { e.preventDefault(); if (borrowedErr || returnErr) return; onApply(draft); onHide(); };
  const reset = () => { onApply(Object.fromEntries(DATE_KEYS.map((k) => [k, '']))); onHide(); };

  const range = (title, fromKey, toKey, err) => (
    <fieldset>
      <legend className="form-label">{title}</legend>
      <div className="d-flex gap-2 align-items-center">
        <Form.Control type="date" aria-label={`${title} from`} value={draft[fromKey]} onChange={set(fromKey)} isInvalid={!!err} />
        <span className="meta">–</span>
        <Form.Control type="date" aria-label={`${title} to`} value={draft[toKey]} onChange={set(toKey)} isInvalid={!!err} />
      </div>
      {err && <div className="invalid-feedback d-block">The end date must be on or after the start date</div>}
    </fieldset>
  );

  return (
    <Offcanvas show={show} onHide={onHide} placement="end" aria-labelledby="tx-filters-title">
      <Offcanvas.Header closeButton><Offcanvas.Title id="tx-filters-title">Filters</Offcanvas.Title></Offcanvas.Header>
      <Form onSubmit={apply} className="d-flex flex-column flex-grow-1 min-h-0" noValidate>
        <Offcanvas.Body className="d-flex flex-column gap-4">
          {range('Borrowed date', 'borrowedFrom', 'borrowedTo', borrowedErr)}
          {range('Return date', 'dueFrom', 'dueTo', returnErr)}
        </Offcanvas.Body>
        <div className="d-flex gap-2 p-3 border-top">
          <Button variant="outline-secondary" className="flex-fill" onClick={reset}>Reset</Button>
          <Button type="submit" variant="primary" className="flex-fill" disabled={!!(borrowedErr || returnErr)}>Apply</Button>
        </div>
      </Form>
    </Offcanvas>
  );
}

// Return date column: the date + "In 2 days" / "3 days late" / "Returned Oct 1, 2026"
function ReturnDate({ tx }) {
  const out = tx.status === 'borrowed';
  return (
    <>
      <div>{formatDate(tx.dueDate)}</div>
      <div className={`cell-sub ${tx.derivedStatus === 'overdue' ? 'text-danger fw-medium' : ''}`}>
        {out ? dueText(tx.dueDate) : `Returned ${formatDateTime(tx.returnedAt)}`}
        {extensionsUsed(tx) > 0 && ` · extended ${extensionsUsed(tx)}×`}
      </div>
    </>
  );
}

// /admin/transactions — every borrowed book, with status tabs, filters and Return / Renew actions
export default function TransactionsPage() {
  const toast = useToast();
  const { filters, page, pageSize, setFilters, setPage, setPageSize, clearFilters } = useUrlFilters(DEFAULTS);
  const [searchText, setSearchText] = useUrlSearchText(filters.search, (v) => setFilters({ search: v }));

  const [stats, setStats] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [showLend, setShowLend] = useState(false);
  const [pending, setPending] = useState(null); // { type: 'return' | 'renew', tx }
  const [detailsId, setDetailsId] = useState(null); // transaction shown in the details modal
  const [acting, setActing] = useState(false);

  const refresh = () => setReloadKey((k) => k + 1);

  // Stat cards (reloaded after every change)
  useEffect(() => {
    api.get('/transactions/stats').then((res) => setStats(res.data)).catch(() => {});
  }, [reloadKey]);

  // Dates in the URL are "YYYY-MM-DD"; the API gets the exact start/end of those days in local time
  const listParams = useMemo(() => {
    const p = {
      search: filters.search, status: filters.status, sort: filters.sort,
      borrowedFrom: dayStartISO(filters.borrowedFrom), borrowedTo: dayEndISO(filters.borrowedTo),
      dueFrom: dayStartISO(filters.dueFrom), dueTo: dayEndISO(filters.dueTo),
    };
    return Object.fromEntries(Object.entries(p).filter(([, v]) => v)); // drop empty values
  }, [filters]);
  const { data: result, loading, refreshing, error } = useListQuery('/transactions', listParams, { page, pageSize, reloadKey });
  const data = result || EMPTY_RESULT;

  // Row selection (checkboxes); cleared automatically when search/filters/sort change
  const selection = useSelection(JSON.stringify(listParams));
  // Export dialog: null = closed, otherwise the scope to pre-select ('selected' or 'filtered')
  const [exportScope, setExportScope] = useState(null);
  const openExport = (scope) => setExportScope(scope);

  const runAction = async () => {
    const { type, tx } = pending;
    setActing(true);
    try {
      await api.put(`/transactions/${tx._id}/${type}`);
      toast.success(type === 'return'
        ? `"${tx.book?.title || 'Book'}" was marked as returned`
        : `Extended: "${tx.book?.title || 'Book'}" now has 7 more days`);
      setPending(null);
      refresh();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setActing(false);
    }
  };

  const dateCount = (filters.borrowedFrom || filters.borrowedTo ? 1 : 0) + (filters.dueFrom || filters.dueTo ? 1 : 0);

  const chips = useMemo(() => {
    const list = [];
    if (filters.search) list.push({ key: 'search', label: `Search: "${filters.search}"`, onRemove: () => setFilters({ search: '' }) });
    if (filters.borrowedFrom || filters.borrowedTo) {
      list.push({ key: 'borrowed', label: `Borrowed: ${rangeLabel(filters.borrowedFrom, filters.borrowedTo)}`, onRemove: () => setFilters({ borrowedFrom: '', borrowedTo: '' }) });
    }
    if (filters.dueFrom || filters.dueTo) {
      list.push({ key: 'return', label: `Return date: ${rangeLabel(filters.dueFrom, filters.dueTo)}`, onRemove: () => setFilters({ dueFrom: '', dueTo: '' }) });
    }
    return list;
  }, [filters, setFilters]);

  const clearAll = () => clearFilters(['search', 'status', ...DATE_KEYS]);
  const hasFilters = chips.length > 0 || filters.status !== '';
  const counts = data.counts;

  const columns = [
    // Click-to-copy code (CopyableText stops the click so the row does not open)
    { key: 'code', header: 'Code', primary: true, className: 'd-none d-xl-table-cell text-nowrap', render: (tx) => <CopyableText value={tx.code} label="Transaction code" /> },
    {
      key: 'book', header: 'Book', main: true, primary: true, skeleton: 'cover',
      render: (tx) => (
        <div className="d-flex align-items-center gap-3">
          <BookCover book={tx.book || { title: '?' }} />
          <div className="min-w-0">
            <div className="cell-title cell-clamp">{tx.book?.title || 'Deleted book'}</div>
            {/* On small screens the hidden columns are summarised here */}
            <div className="cell-sub d-md-none text-truncate">{tx.user?.name || 'Deleted user'}</div>
            <div className="cell-sub d-sm-none">{tx.status === 'borrowed' ? dueText(tx.dueDate) : `Returned ${formatDate(tx.returnedAt)}`}</div>
            <div className="cell-sub d-none d-md-block d-xl-none mono">{tx.code}</div>
            <div className="d-sm-none mt-1"><StatusBadge status={tx.derivedStatus} /></div>
          </div>
        </div>
      ),
    },
    {
      key: 'member', header: 'Member', className: 'd-none d-md-table-cell', skeleton: 'avatar',
      render: (tx) => (
        <div className="d-flex align-items-center gap-2">
          <Avatar name={tx.user?.name || '?'} avatarKey={tx.user?.avatarKey} size="sm" />
          <div className="min-w-0">
            <div className="fw-medium text-truncate">{tx.user?.name || 'Deleted user'}</div>
            <div className="cell-sub mono">{tx.user?.memberId || '—'}</div>
          </div>
        </div>
      ),
    },
    { key: 'borrowed', header: 'Borrowed', className: 'd-none d-lg-table-cell text-nowrap', render: (tx) => formatDateTime(tx.borrowedAt) },
    { key: 'return', header: 'Return date', className: 'd-none d-sm-table-cell text-nowrap', skeleton: 'twoLine', render: (tx) => <ReturnDate tx={tx} /> },
    { key: 'status', header: 'Status', className: 'd-none d-sm-table-cell', skeleton: 'badge', render: (tx) => <StatusBadge status={tx.derivedStatus} /> },
    {
      key: 'actions', header: 'Actions', hiddenHeader: true, actions: true, skeleton: 'actions',
      render: (tx) => {
        if (tx.status !== 'borrowed') return null;
        // null = can be extended; otherwise the reason (late, or already extended twice)
        const blocked = extendBlockReason(tx);
        return (
          <>
            <OverlayTrigger overlay={<Tooltip>Mark returned</Tooltip>}>
              <button type="button" className="btn btn-icon" onClick={() => setPending({ type: 'return', tx })} aria-label={`Mark ${tx.book?.title || 'book'} as returned`}>
                <Undo2 size={16} />
              </button>
            </OverlayTrigger>
            {/* A disabled button gets no mouse events, so the tooltip sits on a focusable wrapper */}
            <OverlayTrigger overlay={<Tooltip>{blocked || EXTEND.label}</Tooltip>}>
              <span className="d-inline-block" tabIndex={blocked ? 0 : -1} aria-label={blocked || undefined}>
                <button type="button" className="btn btn-icon" onClick={() => setPending({ type: 'renew', tx })} disabled={!!blocked} aria-label={`Extend ${tx.book?.title || 'book'}`}>
                  <RefreshCw size={16} />
                </button>
              </span>
            </OverlayTrigger>
          </>
        );
      },
    },
  ];

  // "page-fill": on desktop the page fits the window and only the table scrolls (see admin.css)
  return (
    <div className="page-fill">
      <PageHeader title="Transactions" description="Every borrowed book: who has it, when it must be returned, and what came back.">
        <Button variant="outline-secondary" onClick={() => openExport('filtered')}>Export</Button>
        <Button variant="primary" onClick={() => setShowLend(true)}>
          New transaction
        </Button>
      </PageHeader>

      <section className="stat-grid" aria-label="Transaction summary">
        <StatCard loading={!stats} icon={BookOpen} label="Active" value={stats?.active} hint="More than 3 days left" />
        <StatCard loading={!stats} icon={CalendarClock} label="Returning soon" value={stats?.dueSoon}
          tone={stats?.dueSoon > 0 ? 'warning' : 'default'} hint="Return date within 3 days" />
        <StatCard loading={!stats} icon={AlarmClock} label={LATE.statLabel} value={stats?.late}
          tone={stats?.late > 0 ? 'danger' : 'default'} hint={LATE.statHint} />
        <StatCard loading={!stats} icon={CircleCheck} label="Returned this month" value={stats?.returnedThisMonth}
          tone="success" hint={stats && (stats.onTimeRate === null ? 'No returns yet this month' : `${stats.onTimeRate}% on time`)} />
      </section>

      <section className="panel" aria-label="Transactions">
        {/* Status tabs with counts (counts follow the search and date filters) */}
        <nav className="nav nav-underline px-4 pt-2 border-bottom flex-nowrap overflow-auto" aria-label="Status">
          {TX_TABS.map((t) => {
            const active = filters.status === t.value;
            return (
              <button key={t.value || 'all'} type="button" className={`nav-link text-nowrap ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined} onClick={() => setFilters({ status: t.value })}>
                {t.label}
                <span className={`status-badge ms-2 ${t.value === 'overdue' && counts?.overdue ? 'badge-danger' : 'badge-neutral'}`}>
                  {counts ? counts[t.countKey] : '·'}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="toolbar">
          <div className="input-group search-group">
            <span className="input-group-text"><Search size={16} aria-hidden="true" /></span>
            <Form.Control type="search" placeholder="Search member, book, ISBN or code (TX-…)" aria-label="Search transactions"
              value={searchText} onChange={(e) => setSearchText(e.target.value)} maxLength={100} />
          </div>
          <div className="toolbar-end">
            <Button variant="outline-secondary" onClick={() => setShowFilters(true)} className="text-nowrap">
              Dates
              {dateCount > 0 && <span className="btn-count">{dateCount}</span>}
            </Button>
            <Form.Select aria-label="Sort transactions" value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value })} style={{ width: 'auto' }}>
              {TX_SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Form.Select>
          </div>
        </div>

        <FilterChips chips={chips} onClearAll={clearAll} />
        <SelectionBar selection={selection} rows={data.transactions} total={data.total} noun={['transaction', 'transactions']} onExport={() => openExport('selected')} />
        {error && <div className="alert alert-danger mx-4" role="alert">{error}</div>}

        {!loading && data.transactions.length === 0 ? (
          hasFilters ? (
            <EmptyState icon={SearchX} title="No transactions match" text="Try another search, status or date range.">
              <Button variant="outline-primary" size="sm" onClick={clearAll}>Clear all filters</Button>
            </EmptyState>
          ) : (
            <EmptyState icon={ArrowLeftRight} title="No transactions yet" text="Lend a book to a member to create the first one.">
              <Button variant="primary" size="sm" onClick={() => setShowLend(true)}>New transaction</Button>
            </EmptyState>
          )
        ) : (
          <ListArea refreshing={refreshing}>
            <DataTable
              columns={columns}
              rows={data.transactions}
              selection={selection}
              loading={loading}
              skeletonRows={pageSize}
              onRowClick={(tx) => setDetailsId(tx._id)}
              rowLabel={(tx) => `View transaction ${tx.code || ''} for ${tx.book?.title || 'a deleted book'}`}
            />
          </ListArea>
        )}

        <TablePager
          page={page}
          pages={data.pages}
          total={data.total}
          count={data.transactions.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          noun={['transaction', 'transactions']}
          loading={loading}
        />
      </section>

      <DateFilters show={showFilters} onHide={() => setShowFilters(false)} filters={filters} onApply={setFilters} />
      <ExportModal
        show={!!exportScope}
        onHide={() => setExportScope(null)}
        entity="transactions"
        noun={['transaction', 'transactions']}
        initialScope={exportScope}
        selection={selection}
        filters={listParams}
        filterLabels={chips.map((c) => c.label)}
        page={page}
        pageSize={pageSize}
        pageCount={data.transactions.length}
        total={data.total}
      />
      <LendModal show={showLend} onHide={() => setShowLend(false)} onLent={refresh} />
      <TransactionDetailsModal show={!!detailsId} txId={detailsId} onHide={() => setDetailsId(null)} onChanged={refresh} />

      <ConfirmModal
        show={!!pending}
        title={pending?.type === 'return' ? 'Mark as returned?' : 'Extend this book?'}
        message={pending && (pending.type === 'return'
          ? `"${pending.tx.book?.title || 'This book'}" from ${pending.tx.user?.name || 'this member'} goes back on the shelf.`
          : extendMessage(pending.tx, formatDate))}
        confirmLabel={pending?.type === 'return' ? 'Mark returned' : 'Extend'}
        confirmVariant="primary"
        onConfirm={runAction}
        onCancel={() => setPending(null)}
        loading={acting}
      />
    </div>
  );
}
