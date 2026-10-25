/**
 * The "Pearl" look (Ledger structure): eight colour themes (Config > Appearance), each with a light and a dark twin. This file is the single source of the
 * colours: `themeVars(id, mode)` gives the CSS variables, `applyTheme` / `applyScheme` write them on <html>, and styles.css only
 * keeps the Pearl / light values as the starting point before the script runs. The choice is kept on this device (localStorage).
 * Every text / background pair here is checked for 4.5:1 contrast in tests/data.test.js.
 */

// Shared by every theme: the ground, cards, lines, text and the three status colours.
const BASE = {
  light: {
    ground: '#F0F1F7', card: '#FFFFFF', soft: '#F4F6FA', line: '#E6E8F1', line2: '#DADDEA', ink: '#14132B', muted: '#62667C', off: '#C9CDDD',
    danger: '#C23B28', onDanger: '#FFFFFF', dangerTint: '#FDE9E5', dangerInk: '#9E2C1C', dangerLine: '#F0B1A6',
    amber: '#E89A00', amberTint: '#FFF1D6', amberInk: '#7A4700',
    slateTint: '#E8ECFA', slateInk: '#2342A8',
    scrim: 'rgba(20, 19, 43, 0.55)',
  },
  dark: {
    ground: '#0C1228', card: '#161E3B', soft: '#1D2648', line: '#2A3459', line2: '#34406A', ink: '#F2F4FF', muted: '#A3ACCB', off: '#46507A',
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
  { id: 'pearl', name: 'Pearl', light: { primary: '#4B33C8', dark: '#14132B', tint: '#ECE9FB', tintInk: '#3A27A0', mint: '#2EC4B6' }, night: { primary: '#A48BFF', dark: '#2B2470', tint: '#26204F', tintInk: '#CFC5FF', mint: '#2EC4B6' } },
  { id: 'forest', name: 'Forest', light: { primary: '#0B6B52', dark: '#123A2F', tint: '#E3F1EC', tintInk: '#0B5A45', mint: '#9BD3BF' }, night: { primary: '#4CC9A4', dark: '#14443A', tint: '#183B31', tintInk: '#9FE0C8', mint: '#9BD3BF' } },
  { id: 'harbour', name: 'Harbour', light: { primary: '#2457C5', dark: '#14284F', tint: '#E4ECFA', tintInk: '#1B418F', mint: '#A9C4F5' }, night: { primary: '#86AAF5', dark: '#1B3468', tint: '#1C2C52', tintInk: '#B8CDF8', mint: '#A9C4F5' } },
  { id: 'plum', name: 'Plum', light: { primary: '#8A3FD1', dark: '#3A1B57', tint: '#F0E6FA', tintInk: '#6A2CA3', mint: '#D2B2F0' }, night: { primary: '#C79AF2', dark: '#4A2470', tint: '#35214A', tintInk: '#DDC0F6', mint: '#D2B2F0' } },
  { id: 'ember', name: 'Ember', light: { primary: '#C2410C', dark: '#5A200A', tint: '#FBE9DF', tintInk: '#99330A', mint: '#F5B896' }, night: { primary: '#F28F5E', dark: '#6E2D10', tint: '#43271A', tintInk: '#F6C3A6', mint: '#F5B896' } },
  { id: 'ink', name: 'Ink', light: { primary: '#16231F', dark: '#0E1513', tint: '#E9ECEB', tintInk: '#16231F', mint: '#B9C7C1' }, night: { primary: '#CFDCD6', dark: '#2A3832', tint: '#26312D', tintInk: '#D2DDD8', mint: '#B9C7C1' } },
  { id: 'glass', name: 'Glass', light: { primary: '#4B4CD8', dark: '#232566', tint: '#E8E9FF', tintInk: '#3638A8', mint: '#B9BBFF', ground: '#EBEFFC', card: '#F7F9FF', soft: '#EDF0FC', line: '#C9D3F1', line2: '#B8C4EA' }, night: { primary: '#9A9BFF', dark: '#2B2D78', tint: '#25264A', tintInk: '#C9CAFF', mint: '#B9BBFF' } },
  { id: 'rose', name: 'Rose', light: { primary: '#B42318', dark: '#5C1A14', tint: '#FBE7E4', tintInk: '#8E1F15', mint: '#F2A9A0' }, night: { primary: '#F58A7F', dark: '#6E2019', tint: '#43211E', tintInk: '#F6BDB7', mint: '#F2A9A0' } },
];

export const DEFAULT_THEME = 'pearl';
export const themeIds = THEMES.map((t) => t.id);
export const TEXT_SIZES = [['small', 'Small', 0.92], ['normal', 'Normal', 1], ['large', 'Large', 1.1], ['xl', 'XL', 1.2]];

const THEME_KEY = 'wd-theme';
const SCHEME_KEY = 'wd-scheme';       // 'auto' (follow the computer), 'light' or 'dark'
const SIZE_KEY = 'wd-text-size';
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* the choice just is not remembered */ } };

/** A theme key saved by an older look (violet, aqua, ocean ...) becomes Pearl. */
export const normalizeTheme = (id) => (themeIds.includes(id) ? id : DEFAULT_THEME);
export const savedTheme = () => normalizeTheme(read(THEME_KEY));
export const savedScheme = () => { const v = read(SCHEME_KEY); return v === 'light' || v === 'dark' ? v : 'auto'; };
export const savedTextSize = () => { const v = read(SIZE_KEY); return TEXT_SIZES.some(([k]) => k === v) ? v : 'normal'; };

/** The CSS variables of a theme in 'light' or 'dark' mode, as { '--name': value }. */
export function themeVars(id, mode = 'light') {
  const t = THEMES.find((x) => x.id === normalizeTheme(id));
  const b = BASE[mode === 'dark' ? 'dark' : 'light'];
  const p = t[mode === 'dark' ? 'night' : 'light'];
  const o = mode === 'dark' ? {} : p;
  return {
    '--ground': o.ground || b.ground, '--card': o.card || b.card, '--soft': o.soft || b.soft, '--line': o.line || b.line, '--line2': o.line2 || b.line2, '--ink': b.ink, '--muted': b.muted, '--off': b.off,
    '--danger': b.danger, '--on-danger': b.onDanger, '--danger-tint': b.dangerTint, '--danger-ink': b.dangerInk, '--danger-line': b.dangerLine,
    '--amber': b.amber, '--amber-tint': b.amberTint, '--amber-ink': b.amberInk, '--slate-tint': b.slateTint, '--slate-ink': b.slateInk, '--scrim': b.scrim,
    '--tile-red': TILES.red, '--tile-amber': TILES.amber, '--tile-navy': TILES.navy, '--tile-violet': TILES.violet, '--tile-teal': TILES.teal, '--toggle-on': '#2EC4B6', '--toggle-off': mode === 'dark' ? '#34406A' : '#D5D8E6',
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

/** Sets the colour theme (remembered) and paints it. */
export function applyTheme(id) {
  state.theme = normalizeTheme(id);
  write(THEME_KEY, state.theme);
  paint();
  return state.theme;
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
  state.theme = savedTheme();
  state.scheme = savedScheme();
  paint();
  applyTextSizeQuiet(savedTextSize());
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (state.scheme === 'auto') paint(); }); } catch { /* an old browser: the look is set at load */ }
}
function applyTextSizeQuiet(k) { document.documentElement.style.setProperty('--zoom', String(TEXT_SIZES.find(([x]) => x === k)[2])); }
