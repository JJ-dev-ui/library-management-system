import { useEffect } from 'react';
import { applyTheme, DEFAULT_THEME } from '../utils/theme';

// Shared layout for the login and register pages: NU blue art panel (shelf of book spines on a
// gold shelf line) + the form. Spine colours are CSS classes that use the theme variables.
const spines = [
  ['gold', 120, 22], ['light', 150, 16], ['tint', 105, 26], ['gold-dark', 140, 18],
  ['light', 115, 20], ['soft', 160, 24], ['tint', 130, 16], ['light', 100, 28], ['gold', 145, 18],
];

export default function AuthLayout({ children }) {
  // Login and register always use the default colours (not the theme of whoever used this browser last).
  // Not saved: after logging in, the user's own theme is applied again.
  useEffect(() => { applyTheme(DEFAULT_THEME, { persist: false }); }, []);

  return (
    <div className="auth-wrap">
      <aside className="auth-art">
        <span className="brand">Stacks<span className="brand-dot">.</span></span>
        <div className="shelf" aria-hidden="true">
          {spines.map(([tone, h, w], i) => (
            <span key={i} className={`spine tone-${tone}`} style={{ height: h, width: w }} />
          ))}
        </div>
        <h1>Find it. Borrow it. Return it.</h1>
        <p>Search the catalog, keep track of what you borrowed, and see what to return next.</p>
      </aside>
      <main className="auth-form">{children}</main>
    </div>
  );
}
