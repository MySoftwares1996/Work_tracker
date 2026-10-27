// Ledger's colours, fonts and the six themes as plain data - no React, so the tests can read them (theme.js adds the provider).
/**
 * "Ledger" structure with the "Pearl" colours - the one look of the app (Pearl is the default). Six colour themes share one structure: a warm paper ground,
 * flat white cards with a 1px line, Fraunces for titles and big numbers, Manrope for everything else. A theme only swaps
 * its primary / primaryDark / primaryTint (and the mint on dark panels); every theme has a dark twin that follows the
 * phone's dark mode (Config > Appearance can turn that off).
 * Every screen reads colours from here only - never hard-code a hex in a screen.
 */

// The families loaded by src/fonts.js (@expo-google-fonts). Fraunces for titles and big numbers; Manrope picked by weight for the rest.
export const FONT_DISPLAY = 'Manrope_800ExtraBold';      // titles and big numbers: bold sans (G); Fraunces is no longer used
export const FONT_BY_WEIGHT = { 400: 'Manrope_500Medium', 500: 'Manrope_500Medium', 600: 'Manrope_600SemiBold', 700: 'Manrope_700Bold', 800: 'Manrope_800ExtraBold', 900: 'Manrope_800ExtraBold' };
/** The Manrope family for a fontWeight ('700', 'bold', 600 ...). */
export const fontFor = (weight) => {
  const w = weight === 'bold' ? 700 : weight === 'normal' || weight == null ? 400 : Number(weight) || 400;
  return FONT_BY_WEIGHT[Math.max(400, Math.min(900, Math.round(w / 100) * 100))] || FONT_BY_WEIGHT[400];
};

// The light and dark ground shared by every colour theme: "Pearl" (flat, calm: a cool grey page, solid white cards, one violet accent) and its dark
// twin "Aurora dark". Secondary text is #62667C (a hair darker than the design's #6B6F85) so it keeps 4.5:1 on the page colour.
// "Gradient bento" (the owner's pick, G): a soft lavender page, white cards, deep indigo ink.
const GROUND = {
  light: { bg: '#F5F3FF', surface: '#FFFFFF', surfaceAlt: '#F1EEFB', border: '#ECE8FA', fieldBorder: '#DDD7F3', text: '#1E1B4B', textDim: '#5F6381', chevron: '#9AA0B4', dark: false },
  dark: { bg: '#110E27', surface: '#1B1736', surfaceAlt: '#241F45', border: '#2F2957', fieldBorder: '#3A3368', text: '#F4F2FF', textDim: '#B3ADD8', chevron: '#8580AE', dark: true },
};
// Signal colours: the plain colour (dots, text), the tint behind it and the text on that tint. The design's own brighter reds / ambers /
// teal are the solid tiles (`tile`, below), where white text sits on them.
const SIGNAL = {
  light: {
    danger: '#C23B28', dangerTint: '#FDE9E5', dangerText: '#9E2C1C',
    amber: '#E89A00', warn: '#9A5B00', warnTint: '#FFF1D6', warnText: '#7A4700',
    slateTint: '#E8ECFA', slateText: '#2342A8', accent2: '#0B7A70',
    ok: '#0B7A70', okTint: '#DDF3F0', okText: '#0A5F57',
    indigo: '#4B33C8', teal: '#0B7A70', pink: '#C23872', purple: '#7B3FD0',
  },
  dark: {
    danger: '#FF8A7E', dangerTint: '#3A1D2A', dangerText: '#FFB4AB',
    amber: '#EE9A13', warn: '#EE9A13', warnTint: '#3A2B10', warnText: '#F2C679',
    slateTint: '#1D2648', slateText: '#A9B8F0', accent2: '#2EC4B6',
    ok: '#3FD0C2', okTint: '#14383B', okText: '#8FE6DC',
    indigo: '#A99BFF', teal: '#2EC4B6', pink: '#F2668B', purple: '#C9A0F2',
  },
};
/*
 * The gradients of the "Gradient bento" look (two or three stops, top-left to bottom-right): the brand violet-pink (the + button,
 * Save, the chosen chip), the hero card, the four count tiles and one per category (catGrads, picked by name in src/gradient.js).
 * White text sits on them; the ends are dark enough for the big bold numbers and labels.
 */
export const GRADS = {
  brand: ['#8B5CF6', '#DB2777'],
  hero: ['#6D28D9', '#A21CAF', '#DB2777'],
  red: ['#FF5A6E', '#E11D48'],
  orange: ['#F59E0B', '#EA580C'],
  blue: ['#0EA5E9', '#2563EB'],
  green: ['#10B981', '#047857'],
  teal: ['#14B8A6', '#0E7490'],
  violet: ['#A78BFA', '#6D28D9'],
  pink: ['#F472B6', '#BE185D'],
  slate: ['#94A3B8', '#475569'],
  done: ['#10B981', '#0891B2'],
};
export const CAT_GRADS = [['#8B5CF6', '#DB2777'], ['#F97316', '#DC2626'], ['#06B6D4', '#2563EB'], ['#10B981', '#4D7C0F'], ['#EC4899', '#9333EA'], ['#F59E0B', '#C2410C'], ['#14B8A6', '#0E7490'], ['#6366F1', '#7C3AED']];

// The solid tool tiles: a flat colour with white text / icon (Home's counts).
const TILES = { red: '#E8503C', amber: '#B04E0A', navy: '#2F55D4', violet: '#7B3FD0', teal: '#0E8F83', ink: '#14132B', pink: '#E24A82', grey: '#5E6173' };

// The one colour theme, Pearl: [light, dark] values of primary / primaryDark / primaryTint / tint text / mint / soft text on the dark panels.
const COLOURS = {
  pearl: { label: 'Gradient', light: { primary: '#6D28D9', primaryDark: '#1E1B4B', tint: '#EDE9FE', tintText: '#5B21B6', mint: '#A7F3D0', heroDim: '#F5E8FF' }, dark: { primary: '#B79CFF', primaryDark: '#2B1F66', tint: '#2B2260', tintText: '#D9CCFF', mint: '#A7F3D0', heroDim: '#F0E4FF' } },
};

export const build = (key, dark) => {
  const c = COLOURS[key][dark ? 'dark' : 'light'];
  const g = dark ? GROUND.dark : GROUND.light;
  const s = dark ? SIGNAL.dark : SIGNAL.light;
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
    onAccent: dark ? '#0C1228' : '#FFFFFF',
    radius: 22,
    heroRadius: 26,
    btnRadius: 16,        // rounded-square buttons (G)
    fieldRadius: 16,
    sheetRadius: 26,
    tile: TILES,          // solid tiles ...
    onTile: '#FFFFFF',    // ... and the text / icon on them
    toggleOn: dark ? '#A78BFA' : '#7C3AED',   // switches: on is violet
    grad: GRADS,
    catGrads: CAT_GRADS,
    toggleOff: dark ? '#34406A' : '#D5D8E6',
    // Flat: a 1px line does the separating. Only the + button has a soft shadow (fabShadow).
    shadow: {},
    fabShadow: { shadowColor: '#A21CAF', shadowOpacity: dark ? 0.4 : 0.4, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 10 },
    // The soft coloured lift under a gradient tile or a white card (G).
    glow: (color) => ({ shadowColor: color, shadowOpacity: 0.3, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 4 }),
    lift: { shadowColor: '#3B2A8C', shadowOpacity: dark ? 0 : 0.07, shadowRadius: 14, shadowOffset: { width: 0, height: 4 }, elevation: dark ? 0 : 2 },
    // The priority dots: High red, Medium amber, Low green.
    prioDot: { High: s.danger, Medium: s.amber, Low: s.ok },
    bar: g.surface,
    hairline: g.border,
    sideEdge: g.border,
    font: FONT_BY_WEIGHT,
    fontDisplay: FONT_DISPLAY,
  };
};

/** The themes, as the light version of each (the dark twin is built from the same key when the phone is in dark mode). */
export const THEMES = Object.fromEntries(Object.keys(COLOURS).map((k) => [k, build(k, false)]));
export const DEFAULT_THEME = 'pearl';
/** The dark twin of a theme (home-screen widgets and the like read it directly). */
export const darkTheme = (key) => build(COLOURS[key] ? key : DEFAULT_THEME, true);


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
  // "Gradient bento": a gradient by priority - High rose to violet, Medium orange to violet, Low green to indigo, otherwise violet to pink.
  // `bottom` is the deep end (the text colour on the white main button), `dim` the soft text on the gradient.
  priority: {
    High: { top: '#E11D48', bottom: '#5B21B6', grad: ['#E11D48', '#A21CAF', '#5B21B6'], dim: '#FCE7F3', label: 'HIGH PRIORITY', icon: '🚨' },
    Medium: { top: '#EA580C', bottom: '#6D28D9', grad: ['#EA580C', '#BE185D', '#6D28D9'], dim: '#FFEDD5', label: 'MEDIUM PRIORITY', icon: '⏰' },
    Low: { top: '#047857', bottom: '#3730A3', grad: ['#047857', '#0E7490', '#3730A3'], dim: '#D1FAE5', label: 'LOW PRIORITY', icon: '🔔' },
    None: { top: '#6D28D9', bottom: '#5B21B6', grad: ['#7C3AED', '#A21CAF', '#BE185D'], dim: '#F3E8FF', label: 'TASK', icon: '🔔' },
  },
  glass: { fill: 'rgba(255,255,255,0.14)', fillStrong: 'rgba(255,255,255,0.26)', line: 'rgba(255,255,255,0.28)', text: '#FFFFFF', dim: 'rgba(255,255,255,0.78)', paper: 'rgba(255,255,255,0.96)', ink: '#1F2937' },
  dark: { surface: '#111827', surfaceAlt: '#1F2937', text: '#F9FAFB', textDim: '#9CA3AF', border: '#374151', title: '#F87171', link: '#93C5FD' },
  banner: { bg: '#B91C1C', label: '#FEE2E2', doneText: '#15803D' },
};

