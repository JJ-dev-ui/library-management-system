import StatCardSkeleton from '../skeletons/StatCardSkeleton';

// One number on a dashboard: muted label, big number, small hint. Flat on purpose (no icon squares,
// no coloured border); the tone only colours the NUMBER (e.g. late books in red).
// tone: 'default' | 'warning' | 'danger' | 'success'. `icon` is still accepted (older callers pass it)
// but no longer drawn. While `loading` is true it renders a skeleton with exactly the same size.
// eslint-disable-next-line no-unused-vars
export default function StatCard({ icon, label, value, hint, tone = 'default', loading = false }) {
  if (loading) return <StatCardSkeleton />;
  return (
    <div className={`stat-card tone-${tone}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value ?? '—'}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}
