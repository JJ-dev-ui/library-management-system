import { useEffect, useMemo, useState } from 'react';
import { Button, Form, Offcanvas } from 'react-bootstrap';
import { AlarmClock, Search, SearchX, UserCheck, Users, UserX } from 'lucide-react';
import api from '../../api';
import useUrlFilters, { useUrlSearchText } from '../../hooks/useUrlFilters';
import useListQuery from '../../hooks/useListQuery';
import ListArea from '../../components/table/ListArea';
import SelectionBar from '../../components/table/SelectionBar';
import useSelection from '../../hooks/useSelection';
import ExportModal from '../../components/table/ExportModal';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/admin/StatCard';
import SegmentedControl from '../../components/SegmentedControl';
import FilterChips from '../../components/FilterChips';
import EmptyState from '../../components/EmptyState';
import DataTable from '../../components/table/DataTable';
import TablePager from '../../components/table/TablePager';
import Avatar from '../../components/Avatar';
import AddMemberModal from '../../components/members/AddMemberModal';
import UserDetailsModal from '../../components/members/UserDetailsModal';
import { AccountStatusBadge, RoleBadge } from '../../components/members/MemberBadges';
import { dayEndISO, dayStartISO, formatDate, timeAgo } from '../../utils/format';
import { LAST_LOGIN_OPTIONS, ROLE_OPTIONS, STATUS_OPTIONS, USER_SORTS } from '../../utils/members';
import { labelOf } from '../../utils/books';
import { LATE } from '../../utils/labels';

const DEFAULTS = { search: '', role: '', status: '', hasOverdue: '', lastLogin: '', joinedFrom: '', joinedTo: '', sort: 'name' };
const ADVANCED = ['hasOverdue', 'lastLogin', 'joinedFrom', 'joinedTo'];
const EMPTY_RESULT = { users: [], total: 0, pages: 1 };

// Right-side panel: late books, last login and joined date (edits a draft until "Apply")
function MemberFilters({ show, onHide, filters, onApply }) {
  const pick = () => Object.fromEntries(ADVANCED.map((k) => [k, filters[k]]));
  const [draft, setDraft] = useState(pick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (show) setDraft(pick()); }, [show]);
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const joinedErr = draft.joinedFrom && draft.joinedTo && draft.joinedTo < draft.joinedFrom;

  const apply = (e) => { e.preventDefault(); if (joinedErr) return; onApply(draft); onHide(); };
  const reset = () => { onApply(Object.fromEntries(ADVANCED.map((k) => [k, '']))); onHide(); };

  return (
    <Offcanvas show={show} onHide={onHide} placement="end" aria-labelledby="member-filters-title">
      <Offcanvas.Header closeButton><Offcanvas.Title id="member-filters-title">Filters</Offcanvas.Title></Offcanvas.Header>
      <Form onSubmit={apply} className="d-flex flex-column flex-grow-1 min-h-0" noValidate>
        <Offcanvas.Body className="d-flex flex-column gap-3">
          <Form.Group controlId="mf-overdue">
            <Form.Label>{LATE.filterLabel}</Form.Label>
            <Form.Select value={draft.hasOverdue} onChange={set('hasOverdue')}>
              <option value="">Any</option>
              <option value="yes">{LATE.hasLate}</option>
              <option value="no">{LATE.noLate}</option>
            </Form.Select>
          </Form.Group>
          <Form.Group controlId="mf-login">
            <Form.Label>Last login</Form.Label>
            <Form.Select value={draft.lastLogin} onChange={set('lastLogin')}>
              <option value="">Any time</option>
              {LAST_LOGIN_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Form.Select>
          </Form.Group>
          <fieldset>
            <legend className="form-label">Joined</legend>
            <div className="d-flex gap-2 align-items-center">
              <Form.Control type="date" aria-label="Joined from" value={draft.joinedFrom} onChange={set('joinedFrom')} isInvalid={!!joinedErr} />
              <span className="meta">–</span>
              <Form.Control type="date" aria-label="Joined to" value={draft.joinedTo} onChange={set('joinedTo')} isInvalid={!!joinedErr} />
            </div>
            {joinedErr && <div className="invalid-feedback d-block">The end date must be on or after the start date</div>}
          </fieldset>
        </Offcanvas.Body>
        <div className="d-flex gap-2 p-3 border-top">
          <Button variant="outline-secondary" className="flex-fill" onClick={reset}>Reset</Button>
          <Button type="submit" variant="primary" className="flex-fill" disabled={!!joinedErr}>Apply</Button>
        </div>
      </Form>
    </Offcanvas>
  );
}

// /admin/members — ALL accounts (members and librarians)
export default function MembersPage() {
  const { filters, page, pageSize, setFilters, setPage, setPageSize, clearFilters } = useUrlFilters(DEFAULTS);
  const [searchText, setSearchText] = useUrlSearchText(filters.search, (v) => setFilters({ search: v }));

  const [stats, setStats] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showFilters, setShowFilters] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [detailsId, setDetailsId] = useState(null);

  const refresh = () => setReloadKey((k) => k + 1);

  useEffect(() => {
    api.get('/users/stats').then((res) => setStats(res.data)).catch(() => {});
  }, [reloadKey]);

  const listParams = useMemo(() => {
    const p = {
      search: filters.search, role: filters.role, status: filters.status, hasOverdue: filters.hasOverdue,
      lastLogin: filters.lastLogin, joinedFrom: dayStartISO(filters.joinedFrom), joinedTo: dayEndISO(filters.joinedTo),
      sort: filters.sort,
    };
    return Object.fromEntries(Object.entries(p).filter(([, v]) => v)); // drop empty values
  }, [filters]);
  const { data: result, loading, refreshing, error } = useListQuery('/users', listParams, { page, pageSize, reloadKey });
  const data = result || EMPTY_RESULT;

  // Row selection (checkboxes); cleared automatically when search/filters/sort change
  const selection = useSelection(JSON.stringify(listParams));
  // Export dialog: null = closed, otherwise the scope to pre-select ('selected' or 'filtered')
  const [exportScope, setExportScope] = useState(null);
  const openExport = (scope) => setExportScope(scope);

  const advancedCount = (filters.hasOverdue ? 1 : 0) + (filters.lastLogin ? 1 : 0) + (filters.joinedFrom || filters.joinedTo ? 1 : 0);

  const chips = useMemo(() => {
    const f = filters;
    const list = [];
    const add = (key, label, patch) => list.push({ key, label, onRemove: () => setFilters(patch) });
    if (f.search) add('search', `Search: "${f.search}"`, { search: '' });
    if (f.role) add('role', `Role: ${f.role === 'admin' ? 'Librarians' : 'Members'}`, { role: '' });
    if (f.status) add('status', `Status: ${labelOf(STATUS_OPTIONS, f.status)}`, { status: '' });
    if (f.hasOverdue) add('overdue', f.hasOverdue === 'yes' ? LATE.hasLate : LATE.noLate, { hasOverdue: '' });
    if (f.lastLogin) add('login', `Last login: ${labelOf(LAST_LOGIN_OPTIONS, f.lastLogin).toLowerCase()}`, { lastLogin: '' });
    if (f.joinedFrom || f.joinedTo) {
      const d = (x) => formatDate(`${x}T00:00:00`);
      const label = f.joinedFrom && f.joinedTo ? `${d(f.joinedFrom)} – ${d(f.joinedTo)}` : f.joinedFrom ? `from ${d(f.joinedFrom)}` : `until ${d(f.joinedTo)}`;
      add('joined', `Joined: ${label}`, { joinedFrom: '', joinedTo: '' });
    }
    return list;
  }, [filters, setFilters]);

  const clearAll = () => clearFilters(Object.keys(DEFAULTS).filter((k) => k !== 'sort'));

  const columns = [
    {
      key: 'name', header: 'Name', main: true, primary: true, skeleton: 'avatar',
      render: (u) => (
        <div className="d-flex align-items-center gap-3">
          <Avatar name={u.name} avatarKey={u.avatarKey} />
          <div className="min-w-0">
            <div className="cell-title text-truncate">{u.name}</div>
            <div className="cell-sub text-truncate">{u.email}</div>
          </div>
        </div>
      ),
    },
    { key: 'memberId', header: 'Member ID', className: 'd-none d-lg-table-cell mono text-nowrap', render: (u) => u.memberId || '—' },
    { key: 'contact', header: 'Contact', className: 'd-none d-xl-table-cell text-nowrap', render: (u) => u.contactNumber || '—' },
    { key: 'role', header: 'Role', className: 'd-none d-sm-table-cell', skeleton: 'badge', render: (u) => <RoleBadge role={u.role} /> },
    { key: 'status', header: 'Status', skeleton: 'badge', render: (u) => <AccountStatusBadge isActive={u.isActive} /> },
    {
      key: 'borrowed', header: 'Borrowed', className: 'd-none d-md-table-cell text-nowrap',
      render: (u) => (
        <>
          {/* "3 books · 1 late" (the late part in red) */}
          {u.activeLoans} {u.activeLoans === 1 ? 'book' : 'books'}
          {u.overdueLoans > 0 && <span className="text-danger fw-medium"> · {LATE.count(u.overdueLoans)}</span>}
        </>
      ),
    },
    {
      key: 'login', header: 'Last login', className: 'd-none d-lg-table-cell text-nowrap',
      render: (u) => <span title={u.lastLoginDevice || undefined}>{timeAgo(u.lastLoginAt)}</span>,
    },
  ];

  // "page-fill": on desktop the page fits the window and only the table scrolls (see admin.css)
  return (
    <div className="page-fill">
      <PageHeader title="Members" description="Every account in Stacks: members and librarians.">
        <Button variant="outline-secondary" onClick={() => openExport('filtered')}>Export</Button>
        <Button variant="primary" onClick={() => setShowAdd(true)}>
          Add member
        </Button>
      </PageHeader>

      <section className="stat-grid" aria-label="Members summary">
        <StatCard loading={!stats} icon={Users} label="Total accounts" value={stats?.total} hint="Members and librarians" />
        <StatCard loading={!stats} icon={UserCheck} label="Active" value={stats?.active} tone="success" hint="Can log in and borrow" />
        <StatCard loading={!stats} icon={UserX} label="Deactivated" value={stats?.deactivated} hint="Cannot log in" />
        <StatCard loading={!stats} icon={AlarmClock} label={LATE.membersStat} value={stats?.withOverdue}
          tone={stats?.withOverdue > 0 ? 'danger' : 'default'} hint="At least one book past its return date" />
      </section>

      <section className="panel" aria-label="Members">
        <div className="toolbar">
          <div className="input-group search-group">
            <span className="input-group-text"><Search size={16} aria-hidden="true" /></span>
            <Form.Control type="search" placeholder="Search name, email, member ID or phone" aria-label="Search members"
              value={searchText} onChange={(e) => setSearchText(e.target.value)} maxLength={100} />
          </div>
          <SegmentedControl label="Role" options={ROLE_OPTIONS} value={filters.role} onChange={(v) => setFilters({ role: v })} />
          <SegmentedControl label="Status" options={STATUS_OPTIONS} value={filters.status} onChange={(v) => setFilters({ status: v })} />
          <div className="toolbar-end">
            <Button variant="outline-secondary" onClick={() => setShowFilters(true)} className="text-nowrap">
              Filters
              {advancedCount > 0 && <span className="btn-count">{advancedCount}</span>}
            </Button>
            <Form.Select aria-label="Sort members" value={filters.sort} onChange={(e) => setFilters({ sort: e.target.value })} style={{ width: 'auto' }}>
              {USER_SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </Form.Select>
          </div>
        </div>

        <FilterChips chips={chips} onClearAll={clearAll} />
        <SelectionBar selection={selection} rows={data.users} total={data.total} noun={['member', 'members']} onExport={() => openExport('selected')} />
        {error && <div className="alert alert-danger mx-4" role="alert">{error}</div>}

        {!loading && data.users.length === 0 ? (
          chips.length > 0 ? (
            <EmptyState icon={SearchX} title="No accounts match" text="Try another search or remove some filters.">
              <Button variant="outline-primary" size="sm" onClick={clearAll}>Clear all filters</Button>
            </EmptyState>
          ) : (
            <EmptyState icon={Users} title="No members yet" text="Add the first member account.">
              <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>Add member</Button>
            </EmptyState>
          )
        ) : (
          <ListArea refreshing={refreshing}>
            <DataTable
              columns={columns}
              rows={data.users}
              selection={selection}
              loading={loading}
              skeletonRows={pageSize}
              onRowClick={(u) => setDetailsId(u._id)}
              rowLabel={(u) => `View ${u.name}`}
            />
          </ListArea>
        )}

        <TablePager
          page={page}
          pages={data.pages}
          total={data.total}
          count={data.users.length}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          noun={['member', 'members']}
          loading={loading}
        />
      </section>

      <MemberFilters show={showFilters} onHide={() => setShowFilters(false)} filters={filters} onApply={setFilters} />
      <ExportModal
        show={!!exportScope}
        onHide={() => setExportScope(null)}
        entity="members"
        noun={['member', 'members']}
        initialScope={exportScope}
        selection={selection}
        filters={listParams}
        filterLabels={chips.map((c) => c.label)}
        page={page}
        pageSize={pageSize}
        pageCount={data.users.length}
        total={data.total}
      />
      <AddMemberModal show={showAdd} onHide={() => setShowAdd(false)} onCreated={refresh} />
      <UserDetailsModal
        show={!!detailsId}
        userId={detailsId}
        onHide={() => setDetailsId(null)}
        onChanged={refresh}
        onDeleted={() => { setDetailsId(null); refresh(); }}
      />
    </div>
  );
}
