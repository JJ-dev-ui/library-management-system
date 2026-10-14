import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import Skeleton from 'react-loading-skeleton';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLayout from './layouts/AdminLayout';
import Login from './pages/Login';
import Register from './pages/Register';
import MemberLayout from './layouts/MemberLayout';
import MemberHome from './pages/member/MemberHome';
import BookmarksPage from './pages/member/BookmarksPage';
import MyBooksPage from './pages/member/MyBooksPage';
import ProfilePage from './pages/member/ProfilePage';
import NotificationsPage from './pages/member/NotificationsPage';
import RequestsPage from './pages/admin/RequestsPage';
// The dashboard uses the (large) chart library, so it is loaded only when it is opened (code splitting)
const AdminDashboard = lazy(() => import('./pages/admin/AdminDashboard'));
import BooksPage from './pages/admin/BooksPage';
import BookForm from './pages/admin/BookForm';
import BookImportPage from './pages/admin/BookImportPage';
import TransactionsPage from './pages/admin/TransactionsPage';
import MembersPage from './pages/admin/MembersPage';
import SettingsPage from './pages/admin/SettingsPage';

// Shown for a moment while a lazily loaded page downloads
function PageSkeleton() {
  return <div aria-hidden="true"><Skeleton width={220} height={30} className="mb-2" /><Skeleton width={320} className="mb-4" /><Skeleton height={110} count={2} className="mb-3" /></div>;
}

export default function App() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />

      {/* Admin area: every /admin/* page shares AdminLayout (sidebar). The child page renders in its <Outlet /> */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute role="admin">
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Suspense fallback={<PageSkeleton />}><AdminDashboard /></Suspense>} />
        <Route path="books" element={<BooksPage />} />
        <Route path="books/new" element={<BookForm />} />
        <Route path="books/:id/edit" element={<BookForm />} />
        <Route path="books/import" element={<BookImportPage />} />
        <Route path="members" element={<MembersPage />} />
        <Route path="requests" element={<RequestsPage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        {/* Old URLs keep working */}
        <Route path="users" element={<Navigate to="/admin/members" replace />} />
        <Route path="loans" element={<Navigate to="/admin/transactions" replace />} />
      </Route>

      {/* Member portal: every page shares MemberLayout (top bar, bottom tabs on phones, book modal).
          role="member": librarians are sent to /admin. The server checks the role again on every call. */}
      <Route
        path="/"
        element={
          <ProtectedRoute role="member">
            <MemberLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<MemberHome />} />
        <Route path="bookmarks" element={<BookmarksPage />} />
        <Route path="my-books" element={<MyBooksPage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="notifications" element={<NotificationsPage />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
