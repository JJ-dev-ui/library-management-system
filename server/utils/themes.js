// The colour themes a user can choose (Settings → Appearance). Same keys as client/src/utils/theme.js.
// The colours themselves live only in the client's CSS; the server just stores the chosen key.
const THEMES = [
  'nu-classic', 'cobalt', 'royal-amethyst', 'heritage-green',
  'crimson-scholar', 'midnight-navy', 'teal-harbor', 'slate-minimal',
];
const DEFAULT_THEME = 'nu-classic';

module.exports = { THEMES, DEFAULT_THEME };
