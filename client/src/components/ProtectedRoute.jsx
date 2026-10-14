import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Where each role "lives" after login
export const homeFor = (user) => (user?.role === 'admin' ? '/admin' : '/');

// Protected route:
// - not logged in            -> go to /login
// - logged in, wrong role    -> go to that user's own home (admin -> /admin, member -> /)
// - logged in, right role    -> show the page
// NOTE: this only hides pages in the browser. The real protection is on the server (protect + adminOnly).
export default function ProtectedRoute({ children, role }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
        <div className="spinner-border text-secondary" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (role && user.role !== role) return <Navigate to={homeFor(user)} replace />;
  return children;
}
