/**
 * The "Ledger" look: six colour themes (Config > Appearance), each with a light and a dark twin. This file is the single source of the
 * colours: `themeVars(id, mode)` gives the CSS variables, `applyTheme` / `applyScheme` write them on <html>, and styles.css only
 * keeps the Forest / light values as the starting point before the script runs. The choice is kept on this device (localStorage).
 * Every text / background pair here is checked for 4.5:1 contrast in tests/data.test.js.
 */

// Shared by every theme: the ground, cards, lines, text and the three status colours.
const BASE = {
  light: {
    ground: '#F7F5EF', card: '#FFFFFF', soft: '#EFEBDF', line: '#E4E0D4', line2: '#D9D4C5', ink: '#16231F', muted: '#5E6B66', off: '#C9C3B0',
    danger: '#B42318', onDanger: '#FFFFFF', dangerTint: '#FBE7E4', dangerInk: '#8E1F15', dangerLine: '#E9A9A2',
    amber: '#C27A0E', amberTint: '#FBF0DC', amberInk: '#7A4E08',
    slateTint: '#E6ECF2', slateInk: '#27435B',
    scrim: 'rgba(18, 30, 26, 0.55)',
  },
  dark: {
    ground: '#0F1714', card: '#17211D', soft: '#1F2B26', line: '#2A3832', line2: '#38483F', ink: '#EAF2EE', muted: '#9DB0A8', off: '#46564E',
    danger: '#FF8A7E', onDanger: '#3A0F0B', dangerTint: '#3A1D1A', dangerInk: '#FFB4AB', dangerLine: '#7A3A34',
    amber: '#E8A23A', amberTint: '#3A2D12', amberInk: '#F2C877',
    slateTint: '#1F2E3B', slateInk: '#A9C4DE',
    scrim: 'rgba(0, 0, 0, 0.65)',
  },
};

// Per theme: primary (buttons, links), dark (hero panels, selected chips, bulk bar), tint (+ its text) and mint (accent on the dark panels).
export const THEMES = [
  { id: 'forest', name: 'Forest', light: { primary: '#0B6B52', dark: '#123A2F', tint: '#E3F1EC', tintInk: '#0B5A45', mint: '#9BD3BF' }, night: { primary: '#4CC9A4', dark: '#14443A', tint: '#183B31', tintInk: '#9FE0C8', mint: '#9BD3BF' } },
  { id: 'harbour', name: 'Harbour', light: { primary: '#2457C5', dark: '#14284F', tint: '#E4ECFA', tintInk: '#1B418F', mint: '#A9C4F5' }, night: { primary: '#86AAF5', dark: '#1B3468', tint: '#1C2C52', tintInk: '#B8CDF8', mint: '#A9C4F5' } },
  { id: 'plum', name: 'Plum', light: { primary: '#8A3FD1', dark: '#3A1B57', tint: '#F0E6FA', tintInk: '#6A2CA3', mint: '#D2B2F0' }, night: { primary: '#C79AF2', dark: '#4A2470', tint: '#35214A', tintInk: '#DDC0F6', mint: '#D2B2F0' } },
  { id: 'ember', name: 'Ember', light: { primary: '#C2410C', dark: '#5A200A', tint: '#FBE9DF', tintInk: '#99330A', mint: '#F5B896' }, night: { primary: '#F28F5E', dark: '#6E2D10', tint: '#43271A', tintInk: '#F6C3A6', mint: '#F5B896' } },
  { id: 'ink', name: 'Ink', light: { primary: '#16231F', dark: '#0E1513', tint: '#E9ECEB', tintInk: '#16231F', mint: '#B9C7C1' }, night: { primary: '#CFDCD6', dark: '#2A3832', tint: '#26312D', tintInk: '#D2DDD8', mint: '#B9C7C1' } },
  { id: 'glass', name: 'Glass', light: { primary: '#4B4CD8', dark: '#232566', tint: '#E8E9FF', tintInk: '#3638A8', mint: '#B9BBFF', ground: '#EBEFFC', card: '#F7F9FF', soft: '#EDF0FC', line: '#C9D3F1', line2: '#B8C4EA' }, night: { primary: '#9A9BFF', dark: '#2B2D78', tint: '#25264A', tintInk: '#C9CAFF', mint: '#B9BBFF' } },
  { id: 'rose', name: 'Rose', light: { primary: '#B42318', dark: '#5C1A14', tint: '#FBE7E4', tintInk: '#8E1F15', mint: '#F2A9A0' }, night: { primary: '#F58A7F', dark: '#6E2019', tint: '#43211E', tintInk: '#F6BDB7', mint: '#F2A9A0' } },
];

export const DEFAULT_THEME = 'forest';
export const themeIds = THEMES.map((t) => t.id);
export const TEXT_SIZES = [['small', 'Small', 0.92], ['normal', 'Normal', 1], ['large', 'Large', 1.1], ['xl', 'XL', 1.2]];

const THEME_KEY = 'wd-theme';
const SCHEME_KEY = 'wd-scheme';       // 'auto' (follow the computer), 'light' or 'dark'
const SIZE_KEY = 'wd-text-size';
const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* the choice just is not remembered */ } };

/** A theme key saved by an older look (violet, aqua, ocean ...) becomes Forest. */
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
