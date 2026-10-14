import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { OverlayTrigger, Tooltip } from 'react-bootstrap';
import {
  ArrowLeftRight, BookOpen, ClipboardList, LayoutDashboard, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Settings, Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import Avatar from '../components/Avatar';
import ConfirmModal from '../components/ConfirmModal';

// Sidebar items, in display order
const links = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/books', label: 'Books', icon: BookOpen },
  { to: '/admin/members', label: 'Members', icon: Users },
  { to: '/admin/requests', label: 'Requests', icon: ClipboardList, badge: 'pending' },
  { to: '/admin/transactions', label: 'Transactions', icon: ArrowLeftRight },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

const STORAGE_KEY = 'stacks.sidebarCollapsed';

// localStorage can throw (private mode, blocked storage), so reading/writing is wrapped in try/catch
const readCollapsed = () => {
  try { return localStorage.getItem(STORAGE_KEY) === '1'; } catch { return false; }
};

// Shows a tooltip only when the sidebar is collapsed (the label text is hidden then)
function WithTooltip({ show, label, children }) {
  if (!show) return children;
  return (
    <OverlayTrigger placement="right" overlay={<Tooltip>{label}</Tooltip>}>
      {children}
    </OverlayTrigger>
  );
}

// Shared layout for every /admin page: sidebar on the left, the current page on the right (<Outlet />)
export default function AdminLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);      // mobile slide-in menu
  const [collapsed, setCollapsed] = useState(readCollapsed); // desktop icon-only rail
  const [confirmLogout, setConfirmLogout] = useState(false);

  // Close the mobile menu whenever the page changes
  useEffect(() => setMenuOpen(false), [location.pathname]);

  // Pending requests badge on "Requests": refreshed every 60 s, and right after an approve/deny
  // (the Requests page sends the "stacks:requests-changed" event)
  const [pending, setPending] = useState(0);
  useEffect(() => {
    const load = () => api.get('/requests/stats').then((res) => setPending(res.data.pending)).catch(() => {});
    load();
    const timer = setInterval(load, 60 * 1000);
    window.addEventListener('stacks:requests-changed', load);
    return () => { clearInterval(timer); window.removeEventListener('stacks:requests-changed', load); };
  }, []);

  // Remember the collapsed choice for next time
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, collapsed ? '1' : '0'); } catch { /* storage unavailable */ }
  }, [collapsed]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Tooltips only make sense on desktop when collapsed (on mobile the menu shows full labels)
  const showTips = collapsed && !menuOpen;

  return (
    <div className={`admin-shell ${collapsed ? 'is-collapsed' : ''}`}>
      {/* Mobile top bar (hidden on large screens) */}
      <header className="admin-topbar d-lg-none">
        <button type="button" className="topbar-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu" aria-expanded={menuOpen}>
          <Menu size={24} />
        </button>
        <span className="brand">Stacks<span className="brand-dot">.</span></span>
      </header>

      {menuOpen && <div className="admin-backdrop d-lg-none" onClick={() => setMenuOpen(false)} aria-hidden="true" />}

      <aside className={`admin-sidebar ${menuOpen ? 'open' : ''}`} aria-label="Admin navigation">
        <div className="sidebar-brand">
          <span className="brand brand-full">Stacks<span className="brand-dot">.</span></span>
          <span className="brand brand-short" aria-hidden="true">S<span className="brand-dot">.</span></span>
          <span className="sidebar-tag">Librarian</span>
          <WithTooltip show={collapsed} label="Expand sidebar">
            <button
              type="button"
              className="sidebar-toggle d-none d-lg-grid"
              onClick={() => setCollapsed((c) => !c)}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-pressed={collapsed}
            >
              {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </button>
          </WithTooltip>
        </div>

        <nav className="sidebar-nav">
          {links.map(({ to, label, icon: Icon, end, badge }) => {
            const count = badge === 'pending' ? pending : 0;
            const fullLabel = count ? `${label} (${count} pending)` : label;
            return (
              <WithTooltip key={to} show={showTips} label={fullLabel}>
                <NavLink to={to} end={end} className="sidebar-link" aria-label={collapsed || count ? fullLabel : undefined}>
                  <Icon size={18} aria-hidden="true" />
                  <span className="label">{label}</span>
                  {count > 0 && <span className="sidebar-badge" aria-hidden="true">{count > 99 ? '99+' : count}</span>}
                </NavLink>
              </WithTooltip>
            );
          })}
        </nav>

        <div className="sidebar-user">
          <Avatar name={user.name} avatarKey={user.avatarKey} gold />
          <div className="min-w-0 user-text">
            <div className="name text-truncate">{user.name}</div>
            <div className="email text-truncate">{user.email}</div>
          </div>
          <WithTooltip show={collapsed} label="Log out">
            <button className="btn-logout" onClick={() => setConfirmLogout(true)} aria-label="Log out" title={collapsed ? undefined : 'Log out'}>
              <LogOut size={16} />
            </button>
          </WithTooltip>
        </div>
      </aside>

      <main className="admin-main">
        <Outlet />
      </main>

      <ConfirmModal
        show={confirmLogout}
        title="Log out of Stacks?"
        message="You will need to log in again to manage the library."
        confirmLabel="Log out"
        confirmVariant="primary"
        onConfirm={handleLogout}
        onCancel={() => setConfirmLogout(false)}
      />
    </div>
  );
}
