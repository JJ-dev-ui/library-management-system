import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from 'react-bootstrap';
import { AlarmClock, BookOpen, CircleCheck, TriangleAlert, Undo2, Users } from 'lucide-react';
import api, { errMsg } from '../../api';
import useThemeColors from '../../hooks/useThemeColors';
import PageHeader from '../../components/PageHeader';
import SegmentedControl from '../../components/SegmentedControl';
import StatCard from '../../components/admin/StatCard';
import DashboardCard from '../../components/dashboard/DashboardCard';
import BorrowChart from '../../components/dashboard/BorrowChart';
import DonutCard from '../../components/dashboard/DonutCard';
import { LateFollowUpList, MostBorrowedList, RecentActivityTable, ReturningSoonList } from '../../components/dashboard/ListCards';
import LendModal from '../../components/transactions/LendModal';
import TransactionDetailsModal from '../../components/transactions/TransactionDetailsModal';
import BookDetailsModal from '../../components/books/BookDetailsModal';
import { LATE, STATUS_LABELS } from '../../utils/labels';

const RANGES = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
];

// "▲ 12% vs previous 30 days" (green up / red down); nothing when there is no previous data
function Trend({ value, range }) {
  if (value === null || value === undefined) return <span>No earlier data to compare</span>;
  const up = value >= 0;
  return (
    <span>
      <span className={up ? 'text-success' : 'text-danger'} aria-label={`${up ? 'Up' : 'Down'} ${Math.abs(value)} percent`}>
        {up ? '▲' : '▼'} {Math.abs(value)}%
      </span>{' '}
      vs previous {range} days
    </span>
  );
}

// /admin — overview of the library: numbers, charts, what needs attention, recent activity
export default function AdminDashboard() {
  const navigate = useNavigate();
  const c = useThemeColors();
  const [params, setParams] = useSearchParams();
  const range = RANGES.some((r) => r.value === params.get('range')) ? params.get('range') : '30';

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [showLend, setShowLend] = useState(false);
  const [txId, setTxId] = useState(null);
  const [bookId, setBookId] = useState(null);

  // One request for the whole page. The range lives in the URL (?range=7), so refresh/back keep it.
  useEffect(() => {
    const ctrl = new AbortController();
    setRefreshing(true);
    setError('');
    api.get('/dashboard', { params: { range }, signal: ctrl.signal })
      .then((res) => { setData(res.data); setRefreshing(false); })
      .catch((err) => { if (err.code !== 'ERR_CANCELED') { setError(errMsg(err)); setRefreshing(false); } });
    return () => ctrl.abort();
  }, [range, reloadKey]);

  const refresh = () => setReloadKey((k) => k + 1);
  const setRange = (v) => setParams((p) => { const n = new URLSearchParams(p); if (v === '30') n.delete('range'); else n.set('range', v); return n; });

  const loading = !data;           // first load: skeletons
  const dim = refreshing && !!data; // later loads: keep the old numbers, slightly dimmed
  const s = data?.stats;
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const statusItems = data ? [
    { key: 'onTime', label: 'On time', value: data.statusDonut.onTime, color: c.success }, // green / amber / red: readable in every theme
    { key: 'dueSoon', label: STATUS_LABELS.due_soon, value: data.statusDonut.dueSoon, color: c.warning },
    { key: 'late', label: STATUS_LABELS.overdue, value: data.statusDonut.late, color: c.danger },
  ] : [];
  const palette = [c.primary, c.accent, c.success, c.info, c.warning];
  const categoryItems = data ? data.categoryDonut.map((x, i) => ({
    key: x.name, label: x.name, value: x.count, color: x.name === 'Other' ? c.muted : palette[i % palette.length],
  })) : [];

  return (
    <>
      <PageHeader title="Dashboard" description={today}>
        {/* Small pill when members are waiting (hidden when there are none) */}
        {data?.pendingRequests > 0 && (
          <Link to="/admin/requests" className="pending-pill">
            {data.pendingRequests} pending {data.pendingRequests === 1 ? 'request' : 'requests'}
          </Link>
        )}
        <SegmentedControl label="Date range" options={RANGES} value={range} onChange={setRange} />
        <Button variant="primary" onClick={() => setShowLend(true)}>
          Lend book
        </Button>
      </PageHeader>

      {error && (
        <div className="alert alert-danger d-flex align-items-center gap-2" role="alert">
          <TriangleAlert size={18} aria-hidden="true" />{error}
        </div>
      )}

      {/* Row 1: five stat cards */}
      <section className="stat-grid stat-grid-5" aria-label="Library summary">
        <StatCard loading={loading} icon={BookOpen} label="Total books" value={s?.totalTitles?.toLocaleString()}
          hint={s && `${s.totalCopies.toLocaleString()} copies`} />
        <StatCard loading={loading} icon={Undo2} label="Borrowed now" value={s?.borrowedNow}
          hint={s && <Trend value={s.borrowTrend} range={data.range} />} />
        <StatCard loading={loading} icon={AlarmClock} label={LATE.statLabel} value={s?.late}
          tone={s?.late > 0 ? 'danger' : 'default'} hint={LATE.statHint} />
        <StatCard loading={loading} icon={CircleCheck} label="Returned today" value={s?.returnedToday} tone="success" hint="Since midnight" />
        <StatCard loading={loading} icon={Users} label="Active members" value={s?.activeMembers}
          hint={s && `+${s.newMembersThisWeek} new this week`} />
      </section>

      {/* Row 2: chart + returning soon */}
      <div className="row g-4 mb-4">
        <div className="col-lg-8">
          <DashboardCard title="Borrowed vs returned" subtitle={`Per day, last ${range} days`} refreshing={dim}>
            <BorrowChart daily={data?.daily || []} range={Number(range)} loading={loading} />
          </DashboardCard>
        </div>
        <div className="col-lg-4">
          <DashboardCard title="Returning soon" subtitle="Next return dates" viewAll="/admin/transactions?status=due_soon&sort=due_soonest">
            <ReturningSoonList items={data?.returningSoon || []} loading={loading} onOpen={(t) => setTxId(t._id)} />
          </DashboardCard>
        </div>
      </div>

      {/* Row 3: two donuts + late follow-ups */}
      <div className="row g-4 mb-4">
        <div className="col-md-6 col-xl-4">
          <DashboardCard title="Borrowed books status" subtitle="Books out right now" refreshing={dim}>
            <DonutCard items={statusItems} totalLabel="borrowed" ariaLabel="Borrowed books by status" loading={loading}
              emptyText="No book is borrowed right now." />
          </DashboardCard>
        </div>
        <div className="col-md-6 col-xl-4">
          <DashboardCard title="Borrowing by category" subtitle={`Last ${range} days`} refreshing={dim}>
            <DonutCard items={categoryItems} totalLabel="borrowings" ariaLabel="Borrowings by category" loading={loading}
              emptyText="No books were borrowed in this period." />
          </DashboardCard>
        </div>
        <div className="col-xl-4">
          <DashboardCard title={LATE.followUpTitle} subtitle="Most days late first" viewAll="/admin/transactions?status=overdue&sort=most_overdue">
            <LateFollowUpList items={data?.lateFollowUps || []} loading={loading} onOpen={(t) => setTxId(t._id)} />
          </DashboardCard>
        </div>
      </div>

      {/* Row 4: recent activity + most borrowed */}
      <div className="row g-4">
        <div className="col-lg-8">
          <DashboardCard title="Recent activity" subtitle="Latest 10 events">
            <RecentActivityTable items={data?.recentActivity || []} loading={loading} />
          </DashboardCard>
        </div>
        <div className="col-lg-4">
          <DashboardCard title="Most borrowed books" subtitle={`Last ${range} days`} refreshing={dim}>
            <MostBorrowedList items={data?.mostBorrowed || []} loading={loading} onOpen={(b) => setBookId(b._id)} />
          </DashboardCard>
        </div>
      </div>

      <LendModal show={showLend} onHide={() => setShowLend(false)} onLent={refresh} />
      <TransactionDetailsModal show={!!txId} txId={txId} onHide={() => setTxId(null)} onChanged={refresh} />
      <BookDetailsModal show={!!bookId} bookId={bookId} onHide={() => setBookId(null)}
        onEdit={(b) => navigate(`/admin/books/${b._id}/edit`)} onDeleted={() => { setBookId(null); refresh(); }} />
    </>
  );
}
