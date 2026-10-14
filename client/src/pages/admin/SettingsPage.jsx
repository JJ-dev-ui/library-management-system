import { useSearchParams } from 'react-router-dom';
import { Nav } from 'react-bootstrap';
import { Palette, ShieldCheck, UserRound } from 'lucide-react';
import PageHeader from '../../components/PageHeader';
import ProfileSettings from '../../components/settings/ProfileSettings';
import AppearanceSettings from '../../components/settings/AppearanceSettings';
import SecuritySettings from '../../components/settings/SecuritySettings';

const SECTIONS = [
  { key: 'profile', label: 'Profile', icon: UserRound, Component: ProfileSettings },
  { key: 'appearance', label: 'Appearance', icon: Palette, Component: AppearanceSettings },
  { key: 'security', label: 'Security', icon: ShieldCheck, Component: SecuritySettings },
];

// /admin/settings — personal settings of the logged-in user.
// The sections are separate components so the member side can reuse them later.
// The open section is in the URL (?tab=security), so refresh/back keep it.
export default function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const active = SECTIONS.find((s) => s.key === params.get('tab')) || SECTIONS[0];
  const { Component } = active;

  return (
    <>
      <PageHeader title="Settings" description="Your profile, the colours of Stacks, and your account security." />
      <div className="settings-layout">
        {/* Left menu on tablets/desktop; a row of tabs on phones (see .settings-nav in admin.css) */}
        <Nav as="nav" variant="pills" className="settings-nav" aria-label="Settings sections" activeKey={active.key}
          onSelect={(k) => setParams(k === 'profile' ? {} : { tab: k })}>
          {SECTIONS.map(({ key, label, icon: Icon }) => (
            <Nav.Item key={key}>
              <Nav.Link as="button" type="button" eventKey={key}>
                <Icon size={16} aria-hidden="true" />{label}
              </Nav.Link>
            </Nav.Item>
          ))}
        </Nav>
        <div className="settings-content">
          <Component key={active.key} />
        </div>
      </div>
    </>
  );
}
