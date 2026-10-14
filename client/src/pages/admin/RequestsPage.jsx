import { useEffect, useMemo, useState } from 'react';
import { Button, Form, OverlayTrigger, Tooltip } from 'react-bootstrap';
import { CalendarX, CircleCheck, CircleX, ClipboardList, Hourglass, Search, SearchX } from 'lucide-react';
import api, { errMsg } from '../../api';
import { useToast } from '../../context/ToastContext';
import useUrlFilters, { useUrlSearchText } from '../../hooks/useUrlFilters';
import useListQuery from '../../hooks/useListQuery';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/admin/StatCard';
import FilterChips from '../../components/FilterChips';
import EmptyState from '../../components/EmptyState';
import ConfirmModal from '../../components/ConfirmModal';
import Avatar from '../../components/Avatar';
import CopyableText from '../../components/CopyableText';
import BookCover from '../../components/books/BookCover';
import ListArea from '../../components/table/ListArea';
import DataTable from '../../components/table/DataTable';
import TablePager from '../../components/table/TablePager';
import RequestDetailsModal, { RequestStatusBadge } from '../../components/requests/RequestDetailsModal';
import DenyRequestModal from '../../components/requests/DenyRequestModal';
import { expiresText, formatDate, formatDateTime, timeAgo } from '../../utils/format';
import { REQUEST_TABS } from '../../utils/labels';
import { LOAN_DAYS } from '../../utils/transactions';

const DEFAULTS = { search: '', status: 'pending', sort: 'oldest' };
const SORTS = [{ value: 'oldest', label: 'Oldest first' }, { value: 'newest', label: 'Newest first' }];
const EMPTY_RESULT = { requests: [], total: 0, pages: 1, counts: null };

// The AdminLayout sidebar badge listens for this event to refresh its pending count
export const announceRequestsChanged = () => window.dispatchEvent(new Event('stacks:requests-changed'));

// What the return date WILL be if the book is handed over now (the server uses the same rule:
// the end of the 14th day)
const returnDateIfNow = () => { const d = new Date(); d.setDate(d.getDate() + LOAN_DAYS); return d; };

// /admin/requests — members' borrow requests: approve at the counter or deny with a note
export default function RequestsPage() {
  const toast = useToast();
  const { filters, page, pageSize, setFilters, setPage, setPageSize, clearFilters } = useUrlFilters(DEFAULTS);
  const [searchText, setSearchText] = useUrlSearchText(filters.search, (v) => setFilters({ search: v }));
  const [stats, setStats] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [approve, setApprove] = useState(null); // request waiting for "Approve?" confirmation
  const [deny, setDeny] = useState(null);       // request in the Deny modal
  const [detailsId, setDetailsId] = useState(null);
  const [acting, setActing] = useState(false);

  const refresh = () => { setReloadKey((k) => k + 1); announceRequestsChanged(); };
  useEffect(() => { api.get('/requests/stats').then((res) => setStats(res.data)).catch(() => {}); }, [reloadKey]);

  const listParams = useMemo(() => {
    const p = { search: filters.search, status: filters.status, sort: filters.sort };
    return Object.fromEntries(Object.entries(p).filter(([, v]) => v));
  }, [filters]);
  const { data: result, loading, refreshing, error } = useListQuery('/requests', listParams, { page, pageSize, reloadKey });
  const data = result || EMPTY_RESULT;

  const runApprove = async () => {
    setActing(true);
    try {
      const res = await api.put(`/requests/${approve._id}/approve`);
      toast.success(`'${approve.book?.title}' was handed to ${approve.user?.name}. Return by ${formatDate(res.data.transaction.dueDate)}.`);
      setApprove(null);
      setDetailsId(null);
      refresh();
    } catch (err) {
      toast.error(errMsg(err));
      setApprove(null);
      refresh(); // the reason may have changed (copies, late books): show the current state
    } finally {
      setActing(false);
    }
  };

  const runDeny = async (note) => {
    setActing(true);
    try {
      await api.put(`/requests/${deny._id}/deny`, { note });
      toast.success(`The request of ${deny.user?.name} was denied`);
      setDeny(null);
      setDetailsId(null);
      refresh();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setActing(false);
    }
  };

  const chips = filters.search ? [{ key: 'search', label: `Search: "${filters.search}"`, onRemove: () => setFilters({ search: '' }) }] : [];
  const counts = data.counts;

  const columns = [
    { key: 'code', header: 'Code', primary: true, className: 'd-none d-xl-table-cell text-nowrap', render: (r) => <CopyableText value={r.code} label="Request code" /> },
    {
      key: 'member', header: 'Member', main: true, primary: true, skeleton: 'avatar',
      render: (r) => (
        <div className="d-flex align-items-center gap-2">
          <Avatar name={r.user?.name || '?'} avatarKey={r.user?.avatarKey} size="sm" />
          <div className="min-w-0">
            <div className="fw-medium text-truncate">{r.user?.name || 'Deleted account'}</div>
            <div className="cell-sub mono">{r.user?.memberId || '—'}</div>
            {/* Phones: the book column is hidden, so its title is summarised here */}
            <div className="cell-sub d-md-none text-truncate">{r.book?.title}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'book', header: 'Book', className: 'd-none d-md-table-cell', skeleton: 'cover',
      render: (r) => (
        <div className="d-flex align-items-center gap-2">
          <BookCover book={r.book || { title: '?' }} />
          <div className="min-w-0">
            <div className="cell-title cell-clamp">{r.book?.title || 'Deleted book'}</div>
            <div className="cell-sub mono">{r.book?.isbn}</div>
          </div>
        </div>
      ),
    },
    { key: 'copies', header: 'Available now', className: 'd-none d-lg-table-cell text-nowrap', render: (r) => (r.book ? `${r.book.availableCopies} of ${r.book.totalCopies}` : '—') },
    {
      key: 'requested', header: 'Requested', className: 'd-none d-sm-table-cell text-nowrap',
      render: (r) => (
        <OverlayTrigger overlay={<Tooltip>{formatDateTime(r.requestedAt)}</Tooltip>}>
          <span tabIndex={0}>{timeAgo(r.requestedAt)}</span>
        </OverlayTrigger>
      ),
    },
    { key: 'expires', header: 'Expires', className: 'd-none d-lg-table-cell text-nowrap', render: (r) => (r.status === 'pending' ? expiresText(r.expiresAt) : '—') },
    { key: 'status', header: 'Status', skeleton: 'badge', render: (r) => <RequestStatusBadge status={r.status} /> },
    {
      key: 'actions', header: 'Actions', hiddenHeader: true, actions: true, skeleton: 'actions',
      render: (r) => (r.status !== 'pending' ? null : (
        <div className="d-flex gap-2 justify-content-end">
          <Button size="sm" variant="outline-danger" onClick={() => setDeny(r)}>Deny</Button>
          {/* Disabled when the rules say no right now; the tooltip says why */}
          <OverlayTrigger overlay={<Tooltip>{r.approval?.ok ? 'Hand the book over now' : r.approval?.message}</Tooltip>}>
            <span className="d-inline-block" tabIndex={r.approval?.ok ? -1 : 0} aria-label={r.approval?.ok ? undefined : r.approval?.message}>
              <Button size="sm" variant="primary" onClick={() => setApprove(r)} disabled={!r.approval?.ok}>Approve</Button>
            </span>
          </OverlayTrigger>
        </div>
      )),
    },
  ];

  return (
    <div className="page-fill">
      <PageHeader title="Requests" description="Books members asked for. Approve when they pick them up at the counter, or deny with a note." />

      <section className="stat-grid" aria-label="Requests summary">
        <StatCard loading={!stats} icon={Hourglass} label="Pending" value={stats?.pending} tone={stats?.pending ? 'warning' : 'default'} hint="Waiting at the counter" />
        <StatCard loading={!stats} icon={CircleCheck} label="Approved today" value={stats?.approvedToday} tone="success" hint="Handed over since midnight" />
        <StatCard loading={!stats} icon={CircleX} label="Denied today" value={stats?.deniedToday} hint="Since midnight" />
        <StatCard loading={!stats} icon={CalendarX} label="Expired this week" value={stats?.expiredThisWeek} hint="Not picked up within 3 days" />
      </section>

      <section className="panel" aria-label="Requests">
        <nav className="nav nav-underline px-4 pt-2 border-bottom flex-nowrap overflow-auto" aria-label="Status">
          {REQUEST_TABS.map((t) => {
            const active = filters.status === t.value;
            return (
              <button key={t.value} type="button" className={`nav-link text-nowrap ${active ? 'active' : ''}`}
                aria-current={active ? 'page' : undefined} onClick={() => setFilters({ status: t.value })}>
                {t.label}
                <span className={`status-badge ms-2 ${t.value === 'pending' && counts?.pending ? 'badge-warning' : 'badge-neutral'}`}>
                  {counts ? counts[t.value] : '·'}
                </span>
              </button>
            );
          })}
        </nav>

        <div className="toolbar">
          <div className="input-group search-group">
            <span className="input-group-text"><Search size={16} aria-hidden="true" /></span>
            <Form.Control type="search" placeholder="Search member, book, ISBN or code (RQ-…)" aria-label="Search requests"
              value={searchText} onChange={(e) => setSearchText(e.target.value)} maxLength={100} />
          </div>
          <div className="toolbar-end">
            <Form.Select aria-label="Sort requests" value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value })} style={{ width: 'auto' }}>
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Form.Select>
          </div>
        </div>

        <FilterChips chips={chips} onClearAll={() => clearFilters(['search'])} />
        {error && <div className="alert alert-danger mx-4" role="alert">{error}</div>}

        {!loading && data.requests.length === 0 ? (
          filters.search
            ? <EmptyState icon={SearchX} title="No requests match" text="Try another name, book or code." />
            : <EmptyState icon={ClipboardList} title={filters.status === 'pending' ? 'No pending requests' : 'No requests here'} text="Members' requests from the member portal appear here." />
        ) : (
          <ListArea refreshing={refreshing}>
            <DataTable
              columns={columns}
              rows={data.requests}
              loading={loading}
              skeletonRows={pageSize}
              onRowClick={(r) => setDetailsId(r._id)}
              rowLabel={(r) => `View request ${r.code} from ${r.user?.name || 'a deleted account'}`}
            />
          </ListArea>
        )}

        <TablePager page={page} pages={data.pages} total={data.total} count={data.requests.length} pageSize={pageSize}
          onPageChange={setPage} onPageSizeChange={setPageSize} noun={['request', 'requests']} loading={loading} />
      </section>

      <RequestDetailsModal requestId={detailsId} reloadKey={reloadKey} onHide={() => setDetailsId(null)} onApprove={setApprove} onDeny={setDeny} />
      <DenyRequestModal request={deny} onHide={() => setDeny(null)} onConfirm={runDeny} loading={acting} />
      <ConfirmModal
        show={!!approve}
        title="Approve this request?"
        message={approve && `Hand '${approve.book?.title}' to ${approve.user?.name} now? The return date will be ${formatDate(returnDateIfNow())}.`}
        confirmLabel="Approve and lend"
        confirmVariant="primary"
        onConfirm={runApprove}
        onCancel={() => setApprove(null)}
        loading={acting}
      />
    </div>
  );
}
