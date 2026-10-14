import { TX_STATUS } from '../../utils/transactions';

// Coloured pill for a transaction's derived status (Active, Due soon, Overdue, Returned ...)
export default function StatusBadge({ status }) {
  const meta = TX_STATUS[status] || { label: status, badge: 'badge-neutral' };
  return <span className={`status-badge ${meta.badge}`}>{meta.label}</span>;
}
