import { useOutletContext, useSearchParams } from 'react-router-dom';
import { Button, Nav } from 'react-bootstrap';
import { useAuth } from '../../context/AuthContext';
import { useMemberPage } from '../../context/MemberContext';
import Avatar from '../../components/Avatar';
import ProfileSettings from '../../components/settings/ProfileSettings';
import AppearanceSettings from '../../components/settings/AppearanceSettings';
import SecuritySettings from '../../components/settings/SecuritySettings';
import { formatDate } from '../../utils/format';

// The SAME settings components as the librarians' Settings page (they only call /api/auth/...,
// which every logged-in user may use for their own account)
const SECTIONS = [
  { key: 'profile', label: 'Profile', Component: ProfileSettings },
  { key: 'appearance', label: 'Appearance', Component: AppearanceSettings },
  { key: 'security', label: 'Security', Component: SecuritySettings },
];

// "/profile" — a compact header (avatar, name, member ID, member since) + the settings as
// underline tabs (?tab=appearance|security), with the same side columns as the other member pages
export default function ProfilePage() {
  const { user } = useAuth();
  const { askLogout } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const active = SECTIONS.find((s) => s.key === params.get('tab')) || SECTIONS[0];
  const { Component } = active;

  // Side columns are in MemberLayout; this page only sets how they look
  useMemberPage();
  return (
    <>
      <section className="panel profile-header">
        <Avatar name={user.name} avatarKey={user.avatarKey} size="lg" />
        <div className="min-w-0 flex-grow-1">
          <h1 className="member-page-title mb-0 text-truncate">{user.name}</h1>
          <div className="meta text-truncate">
            <span className="mono">{user.memberId || 'No member ID'}</span> · Member since {formatDate(user.createdAt)}
          </div>
        </div>
        <Button variant="outline-secondary" size="sm" onClick={askLogout} className="d-md-none">Log out</Button>
      </section>

      {/* ONE card: the tabs are its header and the chosen section is its body, so it reads as
          "tabs with content under them". The settings' own panels become plain sections inside
          it (see .tab-card in member.css). */}
      <section className="panel tab-card">
        <Nav as="nav" variant="underline" className="tab-card-nav" aria-label="Profile sections" activeKey={active.key}
          onSelect={(k) => setParams(k === 'profile' ? {} : { tab: k })}>
          {SECTIONS.map(({ key, label }) => (
            <Nav.Item key={key}><Nav.Link as="button" type="button" eventKey={key}>{label}</Nav.Link></Nav.Item>
          ))}
        </Nav>
        {/* Forms stay at most 720px wide inside the card */}
        <div className="tab-card-body"><Component key={active.key} /></div>
      </section>
    </>
  );
}
