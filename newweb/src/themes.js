/**
 * The "Pearl" look (Ledger structure): eight colour themes (Config > Appearance), each with a light and a dark twin. This file is the single source of the
 * colours: `themeVars(id, mode)` gives the CSS variables, `applyTheme` / `applyScheme` write them on <html>, and styles.css only
 * keeps the Pearl / light values as the starting point before the script runs. The choice is kept on this device (localStorage).
 * Every text / background pair here is checked for 4.5:1 contrast in tests/data.test.js.
 */

// Shared by every theme: the ground, cards, lines, text and the three status colours.
const BASE = {
  light: {
    ground: '#F5F3FF', card: '#FFFFFF', soft: '#F1EEFB', line: '#ECE8FA', line2: '#DDD7F3', ink: '#1E1B4B', muted: '#5F6381', off: '#C9C4E3',
    danger: '#C23B28', onDanger: '#FFFFFF', dangerTint: '#FDE9E5', dangerInk: '#9E2C1C', dangerLine: '#F0B1A6',
    amber: '#E89A00', amberTint: '#FFF1D6', amberInk: '#7A4700',
    slateTint: '#E8ECFA', slateInk: '#2342A8',
    scrim: 'rgba(20, 19, 43, 0.55)',
  },
  dark: {
    ground: '#110E27', card: '#1B1736', soft: '#241F45', line: '#2F2957', line2: '#3A3368', ink: '#F4F2FF', muted: '#B3ADD8', off: '#4A4378',
    danger: '#FF8A7E', onDanger: '#3A0F0B', dangerTint: '#3A1D2A', dangerInk: '#FFB4AB', dangerLine: '#7A3A4C',
    amber: '#EE9A13', amberTint: '#3A2B10', amberInk: '#F2C877',
    slateTint: '#1D2648', slateInk: '#A9B8F0',
    scrim: 'rgba(0, 0, 0, 0.65)',
  },
};
// The solid tool tiles (white text on them) and the switches: the same in light and dark.
const TILES = { red: '#E8503C', amber: '#B04E0A', navy: '#2F55D4', violet: '#7B3FD0', teal: '#0E8F83' };

// Per theme: primary (buttons, links), dark (hero panels, selected chips, bulk bar), tint (+ its text) and mint (accent on the dark panels).
export const THEMES = [
  { id: 'pearl', name: 'Gradient', light: { primary: '#6D28D9', dark: '#1E1B4B', tint: '#EDE9FE', tintInk: '#5B21B6', mint: '#A7F3D0' }, night: { primary: '#B79CFF', dark: '#2B1F66', tint: '#2B2260', tintInk: '#D9CCFF', mint: '#A7F3D0' } },
];

export const DEFAULT_THEME = 'pearl';
export const TEXT_SIZES = [['small', 'Small', 0.92], ['normal', 'Normal', 1], ['large', 'Large', 1.1], ['xl', 'XL', 1.2]];

const SCHEME_KEY = 'wd-scheme';       // 'auto' (follow the computer), 'light' or 'dark'
const SIZE_KEY = 'wd-text-size';
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* the choice just is not remembered */ } };

export const savedScheme = () => { const v = read(SCHEME_KEY); return v === 'light' || v === 'dark' ? v : 'auto'; };
export const savedTextSize = () => { const v = read(SIZE_KEY); return TEXT_SIZES.some(([k]) => k === v) ? v : 'normal'; };

/** The CSS variables of a theme in 'light' or 'dark' mode, as { '--name': value }. */
export function themeVars(id, mode = 'light') {
  const t = THEMES[0];      // Pearl is the one look
  const b = BASE[mode === 'dark' ? 'dark' : 'light'];
  const p = t[mode === 'dark' ? 'night' : 'light'];
  const o = mode === 'dark' ? {} : p;
  return {
    '--ground': o.ground || b.ground, '--card': o.card || b.card, '--soft': o.soft || b.soft, '--line': o.line || b.line, '--line2': o.line2 || b.line2, '--ink': b.ink, '--muted': b.muted, '--off': b.off,
    '--danger': b.danger, '--on-danger': b.onDanger, '--danger-tint': b.dangerTint, '--danger-ink': b.dangerInk, '--danger-line': b.dangerLine,
    '--amber': b.amber, '--amber-tint': b.amberTint, '--amber-ink': b.amberInk, '--slate-tint': b.slateTint, '--slate-ink': b.slateInk, '--scrim': b.scrim,
    '--tile-red': TILES.red, '--tile-amber': TILES.amber, '--tile-navy': TILES.navy, '--tile-violet': TILES.violet, '--tile-teal': TILES.teal, '--toggle-on': '#7C3AED', '--toggle-off': mode === 'dark' ? '#34406A' : '#D5D8E6',
    '--primary': p.primary, '--on-primary': mode === 'dark' ? '#0B1511' : '#FFFFFF', '--primary-dark': p.dark, '--primary-tint': p.tint, '--primary-ink': p.tintInk, '--mint': p.mint,
  };
}

const prefersDark = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
const effectiveMode = (scheme) => (scheme === 'dark' || (scheme === 'auto' && prefersDark()) ? 'dark' : 'light');
const state = { theme: DEFAULT_THEME, scheme: 'auto' };

function paint() {
  const root = document.documentElement;
  const mode = effectiveMode(state.scheme);
  const vars = themeVars(state.theme, mode);
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  root.setAttribute('data-theme', state.theme);
  root.setAttribute('data-mode', mode);
  root.style.colorScheme = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', vars['--primary']);
}

/** 'auto' follows the computer's dark mode; 'light' / 'dark' stay put. */
export function applyScheme(scheme) {
  state.scheme = scheme === 'light' || scheme === 'dark' ? scheme : 'auto';
  write(SCHEME_KEY, state.scheme);
  paint();
  return state.scheme;
}

/** Text size: the whole page is scaled (CSS zoom), so every size follows. */
export function applyTextSize(key) {
  const k = TEXT_SIZES.some(([x]) => x === key) ? key : 'normal';
  write(SIZE_KEY, k);
  document.documentElement.style.setProperty('--zoom', String(TEXT_SIZES.find(([x]) => x === k)[2]));
  return k;
}

/** Called once before the first paint: the saved look, and a live follow of the computer's dark mode. */
export function startTheme() {
  state.scheme = savedScheme();
  paint();
  applyTextSizeQuiet(savedTextSize());
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.scheme === 'auto') paint(); }); } catch { /* an old browser: the look is set at load */ }
}
function applyTextSizeQuiet(k) { document.documentElement.style.setProperty('--zoom', String(TEXT_SIZES.find(([x]) => x === k)[2])); }
