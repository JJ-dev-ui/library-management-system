import Skeleton from 'react-loading-skeleton';

// Same box and line heights as <StatCard>, so the page does not jump when numbers arrive
export default function StatCardSkeleton() {
  return (
    <div className="stat-card" aria-hidden="true">
      <div className="stat-label"><Skeleton width="55%" /></div>
      <div className="stat-value"><Skeleton width="40%" /></div>
      <div className="stat-hint"><Skeleton width="70%" /></div>
    </div>
  );
}
