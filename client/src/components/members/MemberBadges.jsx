import { roleLabel } from '../../utils/members';

// Librarian = gold badge with NU blue text (gold is never used as text colour)
export function RoleBadge({ role }) {
  return <span className={`status-badge ${role === 'admin' ? 'badge-gold' : 'badge-brand'}`}>{roleLabel(role)}</span>;
}

export function AccountStatusBadge({ isActive }) {
  return (
    <span className={`status-badge ${isActive ? 'badge-success' : 'badge-neutral'}`}>
      {isActive ? 'Active' : 'Deactivated'}
    </span>
  );
}
