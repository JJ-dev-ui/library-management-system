import { useEffect, useRef, useState } from 'react';
import { Button } from 'react-bootstrap';
import { Check } from 'lucide-react';
import api, { errMsg } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import LoadingButton from '../LoadingButton';
import { DEFAULT_THEME, THEMES, applyTheme } from '../../utils/theme';

// Settings → Appearance: pick one of the 8 colour themes.
// Clicking a card PREVIEWS it live across the whole app (not saved yet).
// Save stores it on the server (and in this browser); Cancel goes back to the saved theme.
export default function AppearanceSettings() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const saved = user.preferences?.theme || DEFAULT_THEME;
  const [selected, setSelected] = useState(saved);
  const [saving, setSaving] = useState(false);
  const savedRef = useRef(saved);
  savedRef.current = saved;

  // Leaving the page without saving -> back to the saved theme
  useEffect(() => () => applyTheme(savedRef.current), []);

  const preview = (key) => {
    setSelected(key);
    applyTheme(key, { persist: false }); // live preview, not remembered
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await api.put('/auth/preferences', { theme: selected });
      setUser(res.data.user); // AuthContext applies AND remembers it
      // id 'theme': saving again replaces this toast instead of stacking a new one
      toast.success(`Theme saved: ${THEMES.find((t) => t.key === selected)?.name}`, { id: 'theme' });
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const cancel = () => preview(saved);
  const changed = selected !== saved;

  return (
    <section className="panel p-4" aria-labelledby="appearance-title">
      <h2 id="appearance-title" className="form-section-title mb-1">Theme</h2>
      <p className="meta mb-4">Choose the colours of Stacks. Click a theme to preview it; nothing changes for good until you save.</p>

      <div className="theme-grid" role="radiogroup" aria-label="Colour theme">
        {THEMES.map((t) => {
          const isSelected = selected === t.key;
          return (
            // data-theme on the card itself: the card is drawn in ITS theme's colours (see index.css)
            <button
              key={t.key}
              type="button"
              data-theme={t.key}
              className={`theme-card ${isSelected ? 'is-selected' : ''}`}
              role="radio"
              aria-checked={isSelected}
              onClick={() => preview(t.key)}
            >
              <span className="theme-mini" aria-hidden="true">
                <span className="theme-mini-side">
                  <span className="theme-mini-item is-active" />
                  <span className="theme-mini-item" />
                  <span className="theme-mini-item" />
                </span>
                <span className="theme-mini-main">
                  <span className="theme-mini-line" />
                  <span className="d-flex gap-1 align-items-center">
                    <span className="theme-mini-btn">Button</span>
                    <span className="theme-mini-badge">Badge</span>
                  </span>
                </span>
              </span>
              <span className="theme-card-name">
                <span>{t.name}</span>
                {isSelected && <Check size={16} className="theme-check" aria-hidden="true" />}
              </span>
              {t.key === saved && <span className="theme-card-current">Current theme</span>}
            </button>
          );
        })}
      </div>

      <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mt-4">
        <Button variant="link" className="p-0" onClick={() => preview(DEFAULT_THEME)} disabled={selected === DEFAULT_THEME}>
          Reset to NU Classic
        </Button>
        <div className="d-flex align-items-center gap-2">
          {changed && <span className="dirty-hint">Previewing (not saved)</span>}
          <Button variant="outline-secondary" onClick={cancel} disabled={!changed || saving}>Cancel</Button>
          <LoadingButton variant="primary" onClick={save} loading={saving} loadingText="Saving..." disabled={!changed}>Save</LoadingButton>
        </div>
      </div>
    </section>
  );
}
