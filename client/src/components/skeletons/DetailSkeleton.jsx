import Skeleton from 'react-loading-skeleton';

// Placeholder for the details modals while their data loads.
// variant 'book' mirrors BookDetailsModal (large cover + facts); 'profile' mirrors UserDetailsModal.
export default function DetailSkeleton({ variant = 'book' }) {
  if (variant === 'profile') {
    return (
      <div aria-hidden="true">
        <div className="d-flex align-items-center gap-3 mb-4">
          <Skeleton circle width={56} height={56} />
          <div className="flex-grow-1">
            <Skeleton width="40%" height={20} />
            <Skeleton width="30%" />
          </div>
        </div>
        <Skeleton height={36} className="mb-4" />
        <div className="detail-grid">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i}><Skeleton width="35%" height={12} /><Skeleton width="75%" /></div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="book-detail" aria-hidden="true">
      <Skeleton width={200} height={295} borderRadius={8} />
      <div className="min-w-0">
        <Skeleton width="80%" height={26} />
        <Skeleton width="55%" />
        <Skeleton width="40%" className="mb-3" />
        <div className="copies-row mb-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} height={58} borderRadius={8} />)}
        </div>
        <div className="detail-grid mb-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i}><Skeleton width="35%" height={12} /><Skeleton width="70%" /></div>
          ))}
        </div>
        <Skeleton count={3} />
      </div>
    </div>
  );
}
