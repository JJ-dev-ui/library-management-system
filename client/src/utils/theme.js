// Colour themes (Settings → Appearance). The colours themselves are in index.css
// ([data-theme="..."] blocks); here are only the keys and names. Same keys as server/utils/themes.js.
export const THEMES = [
  { key: 'nu-classic', name: 'NU Classic' },
  { key: 'cobalt', name: 'Cobalt' },
  { key: 'royal-amethyst', name: 'Royal Amethyst' },
  { key: 'heritage-green', name: 'Heritage Green' },
  { key: 'crimson-scholar', name: 'Crimson Scholar' },
  { key: 'midnight-navy', name: 'Midnight Navy' },
  { key: 'teal-harbor', name: 'Teal Harbor' },
  { key: 'slate-minimal', name: 'Slate Minimal' },
];
export const DEFAULT_THEME = 'nu-classic';
const STORAGE_KEY = 'stacks.theme';
const isTheme = (key) => THEMES.some((t) => t.key === key);

// Shows a theme across the whole app by setting <html data-theme="...">.
// persist: also remember it in this browser, so index.html can apply it BEFORE React loads
// (no flash of the wrong colours on refresh). Previews in Settings do not persist.
export function applyTheme(key, { persist = true } = {}) {
  const theme = isTheme(key) ? key : DEFAULT_THEME;
  document.documentElement.setAttribute('data-theme', theme);
  if (persist) {
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* storage unavailable */ }
  }
  return theme;
}

export const currentTheme = () => document.documentElement.getAttribute('data-theme') || DEFAULT_THEME;
