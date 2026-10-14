import { useEffect, useState } from 'react';
import { AlarmClock, BookOpen, TriangleAlert, Undo2, Users } from 'lucide-react';
import api, { errMsg } from '../../api';
import StatCard from './StatCard';
import { LATE } from '../../utils/labels';

// The 4 library stat cards on the Books page (book titles, borrowed, late books, active members).
// GET /api/stats uses the same server helper as the Dashboard and Transactions, so the numbers
// always match. reloadKey: change it to load the numbers again.
export default function LibraryStats({ reloadKey = 0 }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/stats')
      .then((res) => { setStats(res.data); setError(''); })
      .catch((err) => setError(errMsg(err)));
  }, [reloadKey]);

  const loading = !stats && !error;

  return (
    <>
      {error && (
        <div className="alert alert-danger d-flex align-items-center gap-2" role="alert">
          <TriangleAlert size={18} aria-hidden="true" />
          {error}
        </div>
      )}
      <section className="stat-grid" aria-label="Library summary">
        <StatCard loading={loading} icon={BookOpen} label="Book titles" value={stats?.titles?.toLocaleString()}
          hint={stats && `${stats.totalCopies.toLocaleString()} copies in total`} />
        <StatCard loading={loading} icon={Undo2} label="Borrowed now" value={stats?.borrowedNow}
          hint={stats && `${stats.availableCopies.toLocaleString()} copies on the shelf`} />
        <StatCard loading={loading} icon={AlarmClock} label={LATE.statLabel} value={stats?.late}
          tone={stats?.late > 0 ? 'danger' : 'default'} hint={LATE.statHint} />
        <StatCard loading={loading} icon={Users} label="Active members" value={stats?.activeMembers}
          hint={stats && `of ${stats.totalMembers} registered`} />
      </section>
    </>
  );
}
