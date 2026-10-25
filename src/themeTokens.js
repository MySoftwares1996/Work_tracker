// Ledger's colours, fonts and the six themes as plain data - no React, so the tests can read them (theme.js adds the provider).
/**
 * "Ledger" structure with the "Pearl" colours - the one look of the app (Pearl is the default). Six colour themes share one structure: a warm paper ground,
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

// The light and dark ground shared by every colour theme: "Pearl" (flat, calm: a cool grey page, solid white cards, one violet accent) and its dark
// twin "Aurora dark". Secondary text is #62667C (a hair darker than the design's #6B6F85) so it keeps 4.5:1 on the page colour.
const GROUND = {
  light: { bg: '#F0F1F7', surface: '#FFFFFF', surfaceAlt: '#F4F6FA', border: '#E6E8F1', fieldBorder: '#DADDEA', text: '#14132B', textDim: '#62667C', chevron: '#9AA0B8', dark: false },
  dark: { bg: '#0C1228', surface: '#161E3B', surfaceAlt: '#1D2648', border: '#2A3459', fieldBorder: '#34406A', text: '#F2F4FF', textDim: '#A3ACCB', chevron: '#7C86AB', dark: true },
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
// The solid tool tiles: a flat colour with white text / icon (Home's counts).
const TILES = { red: '#E8503C', amber: '#B04E0A', navy: '#2F55D4', violet: '#7B3FD0', teal: '#0E8F83', ink: '#14132B', pink: '#E24A82', grey: '#5E6173' };

// The six colour themes: [light, dark] values of primary / primaryDark / primaryTint / tint text / mint / soft text on the dark panels.
const COLOURS = {
  pearl: { label: 'Pearl', swatch: '#4B33C8', light: { primary: '#4B33C8', primaryDark: '#14132B', tint: '#ECE9FB', tintText: '#3A27A0', mint: '#2EC4B6', heroDim: '#C9C6E8' }, dark: { primary: '#A48BFF', primaryDark: '#2B2470', tint: '#26204F', tintText: '#CFC5FF', mint: '#2EC4B6', heroDim: '#C9C6E8' } },
  forest: { label: 'Forest', swatch: '#0B6B52', light: { primary: '#0B6B52', primaryDark: '#123A2F', tint: '#E3F1EC', tintText: '#0B5A45', mint: '#9BD3BF', heroDim: '#D4EBE1' }, dark: { primary: '#3FBF98', primaryDark: '#1B4A3C', tint: '#1C3A31', tintText: '#8FE0C4', mint: '#9BD3BF', heroDim: '#D4EBE1' } },
  harbour: { label: 'Harbour', swatch: '#2457C5', light: { primary: '#2457C5', primaryDark: '#14284F', tint: '#E4ECFA', tintText: '#1C4399', mint: '#A9C4F5', heroDim: '#D3E1FA' }, dark: { primary: '#7FA6F5', primaryDark: '#1E3A75', tint: '#1D2B4A', tintText: '#B4CCFA', mint: '#B4CCFA', heroDim: '#D3E1FA' } },
  plum: { label: 'Plum', swatch: '#8A3FD1', light: { primary: '#8A3FD1', primaryDark: '#3A1B57', tint: '#F0E6FA', tintText: '#6B2BA8', mint: '#D6B4F2', heroDim: '#EBDAF8' }, dark: { primary: '#C08EF0', primaryDark: '#4D2A73', tint: '#2E2040', tintText: '#DFC3F7', mint: '#D6B4F2', heroDim: '#EBDAF8' } },
  ember: { label: 'Ember', swatch: '#C2410C', light: { primary: '#C2410C', primaryDark: '#5A200A', tint: '#FBE9DF', tintText: '#9A3412', mint: '#F4B896', heroDim: '#F9D9C6' }, dark: { primary: '#F58A52', primaryDark: '#7A2F0F', tint: '#3A2216', tintText: '#FBBE9C', mint: '#F4B896', heroDim: '#F9D9C6' } },
  ink: { label: 'Ink', swatch: '#16231F', light: { primary: '#16231F', primaryDark: '#0E1513', tint: '#E9ECEB', tintText: '#16231F', mint: '#B8C7C1', heroDim: '#D3DDD9' }, dark: { primary: '#B8C7C1', primaryDark: '#26332F', tint: '#243029', tintText: '#D3DDD9', mint: '#B8C7C1', heroDim: '#D3DDD9' } },
  glass: { label: 'Glass', swatch: '#4B4CD8', light: { primary: '#4B4CD8', primaryDark: '#232566', tint: '#E8E9FF', tintText: '#3638A8', mint: '#B9BBFF', heroDim: '#DCDDFF', ground: { bg: '#EBEFFC', surface: '#F7F9FF', surfaceAlt: '#EDF0FC', border: '#C9D3F1', fieldBorder: '#B8C4EA', chevron: '#8A94B8' } }, dark: { primary: '#9A9BFF', primaryDark: '#2B2D78', tint: '#25264A', tintText: '#C9CAFF', mint: '#B9BBFF', heroDim: '#DCDDFF' } },
  rose: { label: 'Rose', swatch: '#B42318', light: { primary: '#B42318', primaryDark: '#5C1A14', tint: '#FBE7E4', tintText: '#8E1F15', mint: '#F2B1AA', heroDim: '#F7D2CD' }, dark: { primary: '#F27A6F', primaryDark: '#7A2820', tint: '#3C2220', tintText: '#F7B3AB', mint: '#F2B1AA', heroDim: '#F7D2CD' } },
};

export const build = (key, dark) => {
  const c = COLOURS[key][dark ? 'dark' : 'light'];
  const g = { ...(dark ? GROUND.dark : GROUND.light), ...(c.ground || {}) };
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
    btnRadius: 999,       // pill buttons
    fieldRadius: 16,
    sheetRadius: 26,
    tile: TILES,          // solid tiles ...
    onTile: '#FFFFFF',    // ... and the text / icon on them
    toggleOn: dark ? '#2EC4B6' : '#2EC4B6',   // switches: on is teal
    toggleOff: dark ? '#34406A' : '#D5D8E6',
    // Cards read cardFill / cardEdge (Glass: frosted white over its tinted backdrop, see Screen in ui.js; every other theme: the plain surface and line).
    glass: !!(key === 'glass' && !dark),
    glow: ['#9CCBFF', '#C5B8FF', '#F3C9E4'],      // Glass's backdrop glows: blue, lilac, pink
    cardFill: key === 'glass' && !dark ? 'rgba(255,255,255,0.66)' : g.surface,
    cardEdge: key === 'glass' && !dark ? 'rgba(255,255,255,0.9)' : g.border,
    // Flat: a 1px line does the separating. Only the + button has a soft shadow (fabShadow); Glass cards have a soft tinted one.
    shadow: key === 'glass' && !dark ? { shadowColor: c.primary, shadowOpacity: 0.16, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 3 } : {},
    fabShadow: { shadowColor: c.primary, shadowOpacity: dark ? 0.3 : 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
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
/** Config > Appearance: the colour swatches. */
export const THEME_SWATCHES = Object.entries(COLOURS).map(([key, v]) => ({ key, label: v.label, color: v.swatch }));
/** The dark twin of a theme (home-screen widgets and the like read it directly). */
export const darkTheme = (key) => build(COLOURS[key] ? key : DEFAULT_THEME, true);

// Themes stored by earlier looks: the ones that map sensibly keep their colour family, everything else becomes Pearl.
const OLD_THEME_KEYS = { ocean: 'harbour', violet: 'plum', lilac: 'plum', sunset: 'ember', night: 'ink' };
/** A stored theme key (possibly one from an earlier look) as one of the six. */
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

