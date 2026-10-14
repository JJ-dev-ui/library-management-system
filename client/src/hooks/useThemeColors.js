import { useEffect, useState } from 'react';

// Charts (SVG) cannot use CSS variables in every attribute, so this hook READS the current theme's
// colours from the CSS variables on <html> (getComputedStyle) and returns them as plain values.
// A MutationObserver watches the data-theme attribute: when the theme changes, the colours are read
// again and every chart re-renders in the new colours.
const VARS = {
  primary: '--brand-primary',
  accent: '--brand-accent',
  success: '--success',
  warning: '--warning',
  danger: '--danger',
  info: '--info',
  muted: '--color-muted',
  border: '--color-border',
  text: '--color-text',
  surface: '--color-surface',
  font: '--bs-body-font-family', // charts draw text in SVG, so they get the font explicitly
};

function readColors() {
  const css = getComputedStyle(document.documentElement);
  return Object.fromEntries(Object.entries(VARS).map(([key, name]) => [key, css.getPropertyValue(name).trim()]));
}

export default function useThemeColors() {
  const [colors, setColors] = useState(readColors);
  useEffect(() => {
    const observer = new MutationObserver(() => setColors(readColors()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);
  return colors;
}
