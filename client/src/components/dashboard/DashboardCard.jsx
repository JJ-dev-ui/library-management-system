import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

// Card frame used by every dashboard widget: title, optional "View all →" link, content.
// refreshing: dims the content while new numbers load (no skeleton flash when the range changes).
export default function DashboardCard({ title, subtitle, viewAll, refreshing = false, className = '', children }) {
  return (
    <section className={`panel dash-card h-100 ${className}`} aria-label={title}>
      <div className="dash-card-head">
        <div className="min-w-0">
          <h2 className="h6 mb-0">{title}</h2>
          {subtitle && <div className="meta small">{subtitle}</div>}
        </div>
        {viewAll && (
          <Link to={viewAll} className="small text-nowrap dash-view-all">
            View all <ArrowRight size={14} aria-hidden="true" />
          </Link>
        )}
      </div>
      <div className={`dash-card-body ${refreshing ? 'is-refreshing' : ''}`}>{children}</div>
    </section>
  );
}
