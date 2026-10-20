// Ledger's colours, fonts and the six themes as plain data - no React, so the tests can read them (theme.js adds the provider).
/**
 * "Ledger" - the one look of the app (Forest is the default). Six colour themes share one structure: a warm paper ground,
 * flat white cards with a 1px line, Fraunces for titles and big numbers, Manrope for everything else. A theme only swaps
 * its primary / primaryDark / primaryTint (and the mint on dark panels); every theme has a dark twin that follows the
 * phone's dark mode (Config > Appearance can turn that off).
 * Every screen reads colours from here only - never hard-code a hex in a screen.
 */

// The families loaded by src/fonts.js (@expo-google-fonts). Fraunces for titles and big numbers; Manrope picked by weight for the rest.
export const FONT_DISPLAY = 'Fraunces_600SemiBold';
export const FONT_BY_WEIGHT = { 400: 'Manrope_500Medium', 500: 'Manrope_500Medium', 600: 'Manrope_600SemiBold', 700: 'Manrope_700Bold', 800: 'Manrope_800ExtraBold', 900: 'Manrope_800ExtraBold' };
/** The Manrope family for a fontWeight ('700', 'bold', 600 ...). */
export const fontFor = (weight) => {
  const w = weight === 'bold' ? 700 : weight === 'normal' || weight == null ? 400 : Number(weight) || 400;
  return FONT_BY_WEIGHT[Math.max(400, Math.min(900, Math.round(w / 100) * 100))] || FONT_BY_WEIGHT[400];
};

// The light and dark ground shared by every colour theme.
const GROUND = {
  light: { bg: '#F7F5EF', surface: '#FFFFFF', surfaceAlt: '#EFEBDF', border: '#E4E0D4', fieldBorder: '#D9D4C5', text: '#16231F', textDim: '#5E6B66', chevron: '#9AA39F', dark: false },
  dark: { bg: '#0F1714', surface: '#17211D', surfaceAlt: '#1F2B26', border: '#2A3832', fieldBorder: '#34453E', text: '#EAF2EE', textDim: '#9DB0A8', chevron: '#6F8279', dark: true },
};
// Signal colours: the plain colour (dots, fills), the tint behind it and the text on that tint.
const SIGNAL = {
  light: {
    danger: '#B42318', dangerTint: '#FBE7E4', dangerText: '#8E1F15',
    amber: '#C27A0E', warn: '#8F5806', warnTint: '#FBF0DC', warnText: '#7A4E08',
    slateTint: '#E6ECF2', slateText: '#27435B', accent2: '#27435B',
    ok: '#13795B', okTint: '#E3F1EC', okText: '#0B5A45',
    indigo: '#4F46B8', teal: '#0F766E', pink: '#B4236B', purple: '#7E3FB8',
  },
  dark: {
    danger: '#FF8A7E', dangerTint: '#3D1F1B', dangerText: '#FFB4AB',
    amber: '#E5A23A', warn: '#E5A23A', warnTint: '#3A2B10', warnText: '#F2C679',
    slateTint: '#1E2B38', slateText: '#A9C4DD', accent2: '#A9C4DD',
    ok: '#4FD08F', okTint: '#1C3A31', okText: '#8FE0C4',
    indigo: '#A5A0F0', teal: '#5CCFC3', pink: '#F08BB8', purple: '#C9A0F2',
  },
};

// The colour themes (six Ledger ones and Glass): [light, dark] values of primary / primaryDark / primaryTint / tint text / mint / soft text on the dark panels.
const COLOURS = {
  forest: { label: 'Forest', swatch: '#0B6B52', light: { primary: '#0B6B52', primaryDark: '#123A2F', tint: '#E3F1EC', tintText: '#0B5A45', mint: '#9BD3BF', heroDim: '#D4EBE1' }, dark: { primary: '#3FBF98', primaryDark: '#1B4A3C', tint: '#1C3A31', tintText: '#8FE0C4', mint: '#9BD3BF', heroDim: '#D4EBE1' } },
  harbour: { label: 'Harbour', swatch: '#2457C5', light: { primary: '#2457C5', primaryDark: '#14284F', tint: '#E4ECFA', tintText: '#1C4399', mint: '#A9C4F5', heroDim: '#D3E1FA' }, dark: { primary: '#7FA6F5', primaryDark: '#1E3A75', tint: '#1D2B4A', tintText: '#B4CCFA', mint: '#B4CCFA', heroDim: '#D3E1FA' } },
  plum: { label: 'Plum', swatch: '#8A3FD1', light: { primary: '#8A3FD1', primaryDark: '#3A1B57', tint: '#F0E6FA', tintText: '#6B2BA8', mint: '#D6B4F2', heroDim: '#EBDAF8' }, dark: { primary: '#C08EF0', primaryDark: '#4D2A73', tint: '#2E2040', tintText: '#DFC3F7', mint: '#D6B4F2', heroDim: '#EBDAF8' } },
  ember: { label: 'Ember', swatch: '#C2410C', light: { primary: '#C2410C', primaryDark: '#5A200A', tint: '#FBE9DF', tintText: '#9A3412', mint: '#F4B896', heroDim: '#F9D9C6' }, dark: { primary: '#F58A52', primaryDark: '#7A2F0F', tint: '#3A2216', tintText: '#FBBE9C', mint: '#F4B896', heroDim: '#F9D9C6' } },
  ink: { label: 'Ink', swatch: '#16231F', light: { primary: '#16231F', primaryDark: '#0E1513', tint: '#E9ECEB', tintText: '#16231F', mint: '#B8C7C1', heroDim: '#D3DDD9' }, dark: { primary: '#B8C7C1', primaryDark: '#26332F', tint: '#243029', tintText: '#D3DDD9', mint: '#B8C7C1', heroDim: '#D3DDD9' } },
  rose: { label: 'Rose', swatch: '#B42318', light: { primary: '#B42318', primaryDark: '#5C1A14', tint: '#FBE7E4', tintText: '#8E1F15', mint: '#F2B1AA', heroDim: '#F7D2CD' }, dark: { primary: '#F27A6F', primaryDark: '#7A2820', tint: '#3C2220', tintText: '#F7B3AB', mint: '#F2B1AA', heroDim: '#F7D2CD' } },
  // Glass (APK only, src/glass.js): frosted panels over a soft colour backdrop, glossy tiles like app icons. Its own ground below.
  glass: { label: 'Glass', swatch: '#1F6BF2', light: { primary: '#1752C9', primaryDark: '#123A8C', tint: '#E2ECFE', tintText: '#1A4FB8', mint: '#EEF4FF', heroDim: '#F4F8FF' }, dark: { primary: '#7EC0FF', primaryDark: '#1C3D7A', tint: '#18263F', tintText: '#BFDDFF', mint: '#DCEBFF', heroDim: '#EEF5FF' } },
};

// The Glass theme's ground (opaque, for sheets, fields and pickers) and the glass itself: the backdrop's colour glows
// ([colour, x, y, radius] as parts of the screen, and their strength), the frosted fill and rim of panels, the shine on
// their top half (barFill: the tab bar, nearly solid so the list scrolling under it stays quiet), and the glossy tiles' gradients (top, bottom) with their bright rim.
// The glossy tiles' gradients [top, bottom], deep enough that white text reads 4.5:1 across them (tests/suites/ledger-theme.mjs).
// hero: the Home "Today" panel, whose small label sits at the very top.
const GLOSS_TILES = { blue: ['#3C6ED2', '#1752C9'], red: ['#B33F3F', '#A51A1A'], amber: ['#A16329', '#8F4500'], green: ['#35824C', '#0F6A2A'], purple: ['#7C51BA', '#6330AD'], hero: ['#2C4A8A', '#0E347E'] };
const GLASS = {
  light: {
    ground: { bg: '#E6EDFB', surface: '#F7F9FE', surfaceAlt: '#EBF0FA', border: '#D6DFEE', fieldBorder: '#C9D4E6', text: '#0F172A', textDim: '#475569', chevron: '#94A3B8', dark: false },
    glass: {
      base: '#E6EDFB', glow: 0.9,
      orbs: [['#7FB6FF', 0.12, 0.06, 0.62], ['#C4A3FF', 0.95, 0.3, 0.55], ['#8EE8D0', 0.15, 0.78, 0.55], ['#FFC9A8', 0.92, 0.95, 0.5]],
      fill: 'rgba(255,255,255,0.55)', fillStrong: 'rgba(255,255,255,0.74)', barFill: 'rgba(250,252,255,0.9)', rim: 'rgba(255,255,255,0.9)', sheen: '#FFFFFF', sheenOpacity: 0.5,
      tileRim: 'rgba(255,255,255,0.5)', tileInk: '#FFFFFF', tileSheen: 0.18,
      tiles: GLOSS_TILES,
    },
  },
  dark: {
    // Red text a touch lighter than Ledger's, so it reads on a panel over the teal and blue glows.
    signal: { danger: '#FFA39A' },
    ground: { bg: '#07090F', surface: '#121725', surfaceAlt: '#1A2133', border: '#273149', fieldBorder: '#34405C', text: '#F1F5F9', textDim: '#B9C5D6', chevron: '#64748B', dark: true },
    glass: {
      base: '#07090F', glow: 0.2,
      orbs: [['#3B82F6', 0.15, 0.08, 0.6], ['#8B5CF6', 0.98, 0.36, 0.55], ['#14B8A6', 0.08, 0.86, 0.5]],
      fill: 'rgba(255,255,255,0.07)', fillStrong: 'rgba(255,255,255,0.12)', barFill: 'rgba(22,28,44,0.92)', rim: 'rgba(255,255,255,0.18)', sheen: '#FFFFFF', sheenOpacity: 0.08,
      tileRim: 'rgba(255,255,255,0.3)', tileInk: '#FFFFFF', tileSheen: 0.14,
      tiles: GLOSS_TILES,
    },
  },
};

export const build = (key, dark) => {
  const glassy = key === 'glass' ? GLASS[dark ? 'dark' : 'light'] : null;
  const g = glassy ? glassy.ground : dark ? GROUND.dark : GROUND.light;
  const s = { ...(dark ? SIGNAL.dark : SIGNAL.light), ...(glassy && glassy.signal) };
  const c = COLOURS[key][dark ? 'dark' : 'light'];
  return {
    key,
    label: COLOURS[key].label,
    ...g,
    ...s,
    primary: c.primary,
    primaryDark: c.primaryDark,
    tint: c.tint,
    tintText: c.tintText,
    mint: c.mint,
    heroDim: c.heroDim,
    // Names the screens have always read.
    bgAlt: g.surfaceAlt,
    accent: c.primary,
    // Text on a primary-coloured button: white on the light themes, near-black on the lightened dark primaries.
    onAccent: dark ? '#0B1A15' : '#FFFFFF',
    radius: 20,
    heroRadius: 24,
    btnRadius: 14,
    fieldRadius: 14,
    sheetRadius: 24,
    // Flat: a 1px line does the separating. Only the + button has a soft shadow (fabShadow).
    shadow: {},
    fabShadow: { shadowColor: c.primary, shadowOpacity: dark ? 0.3 : 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
    // The priority dots: High red, Medium amber, Low green.
    prioDot: { High: s.danger, Medium: s.amber, Low: s.ok },
    bar: g.surface,
    hairline: g.border,
    sideEdge: g.border,
    font: FONT_BY_WEIGHT,
    fontDisplay: FONT_DISPLAY,
    // Only the Glass theme has these: the glass pieces in src/glass.js read them, every other screen sees the opaque ground.
    glass: glassy ? glassy.glass : null,
    ...(glassy ? { radius: 22, heroRadius: 28, btnRadius: 16 } : null),
  };
};

/** The themes, as the light version of each (the dark twin is built from the same key when the phone is in dark mode). */
export const THEMES = Object.fromEntries(Object.keys(COLOURS).map((k) => [k, build(k, false)]));
export const DEFAULT_THEME = 'forest';
/** Config > Appearance: the colour swatches. */
export const THEME_SWATCHES = Object.entries(COLOURS).map(([key, v]) => ({ key, label: v.label, color: v.swatch }));
/** The dark twin of a theme (home-screen widgets and the like read it directly). */
export const darkTheme = (key) => build(COLOURS[key] ? key : DEFAULT_THEME, true);

// Themes stored by earlier looks: the ones that map sensibly keep their colour family, everything else becomes Forest.
const OLD_THEME_KEYS = { ocean: 'harbour', violet: 'plum', lilac: 'plum', sunset: 'ember', night: 'ink' };
/** A stored theme key (possibly one from an earlier look) as one of the themes. */
export const themeKeyOf = (stored) => (COLOURS[stored] ? stored : OLD_THEME_KEYS[stored] || DEFAULT_THEME);

// Four font-size levels from the spec.
export const FONT_LEVELS = { 1: 0.9, 2: 1.0, 3: 1.15, 4: 1.3 };

/**
 * Colours for the native launch splash (app.json's android.adaptiveIcon and
 * expo-splash-screen plugin both use the same navy). App.js's pre-`ready`
 * fallback view has to match this exactly - see App.js for why - and since
 * that view renders before the store (and so before useTheme has real data),
 * it can't pull from THEMES. Defined here rather than inline in App.js so
 * every colour in the app still lives in one place, per scripts/check.js.
 */
// The app's logo (assets/icon.png, AnimatedLogo.js): a white ring and tick on a teal gradient, whatever the theme.
export const BRAND = { top: '#2dd4bf', bottom: '#0d9488', mark: '#ffffff' };

export const SPLASH = { bg: '#0B1220', spinner: '#4F8CFF' };
// The web.app alarm window's fixed looks (src/WebAlarm.js): the dark window and the red top banner keep their colours
// whatever the app theme, like an alarm clock's.
export const ALARM_COLORS = {
  // The phone's full-screen alert (PastDueAlert): its background follows the task's priority (deep red / amber-brown / green / slate).
  priority: {
    High: { top: '#4A1712', bottom: '#4A1712', dim: '#F6CFC9', label: 'HIGH PRIORITY', icon: '🚨' },
    Medium: { top: '#4A2E0A', bottom: '#4A2E0A', dim: '#F3DDB4', label: 'MEDIUM PRIORITY', icon: '⏰' },
    Low: { top: '#123A2F', bottom: '#123A2F', dim: '#CFE8DD', label: 'LOW PRIORITY', icon: '🔔' },
    None: { top: '#1F2F3F', bottom: '#1F2F3F', dim: '#C9D8E6', label: 'TASK', icon: '🔔' },
  },
  glass: { fill: 'rgba(255,255,255,0.14)', fillStrong: 'rgba(255,255,255,0.26)', line: 'rgba(255,255,255,0.28)', text: '#FFFFFF', dim: 'rgba(255,255,255,0.78)', paper: 'rgba(255,255,255,0.96)', ink: '#1F2937' },
  dark: { surface: '#111827', surfaceAlt: '#1F2937', text: '#F9FAFB', textDim: '#9CA3AF', border: '#374151', title: '#F87171', link: '#93C5FD' },
  banner: { bg: '#B91C1C', label: '#FEE2E2', doneText: '#15803D' },
};

