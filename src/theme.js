import React, { createContext, useContext, useMemo } from 'react';
import { Platform, useColorScheme } from 'react-native';
import { useStore } from './store';

/**
 * Five themes from the spec: Pearl, Glassmorphism, Neumorphism, Claymorphism, 3D Hero.
 * Every screen reads colours from here only - never hard-code a hex in a screen.
 */
export const THEMES = {
  pearl: {
    key: 'pearl',
    label: 'Pearl (auto dark mode)',
    dark: false,
    // iOS system palette: systemGroupedBackground, secondarySystemGroupedBackground,
    // separator, label/secondaryLabel, and the standard systemBlue/red/orange/green.
    bg: '#F2F2F7',
    bgAlt: '#E5E5EA',
    surface: '#FFFFFF',
    surfaceAlt: '#F2F2F7',
    border: '#E5E5EA',
    text: '#000000',
    textDim: '#8E8E93',
    accent: '#007AFF',
    accent2: '#5AC8FA',
    danger: '#FF3B30',
    warn: '#FF9500',
    ok: '#34C759',
    // Extra category colours, so different tools/sections can each carry
    // their own identity instead of the whole app reading as one flat blue.
    indigo: '#5856D6',
    teal: '#30B0C7',
    pink: '#FF2D55',
    purple: '#AF52DE',
    radius: 14,
    // iOS cards sit nearly flat against the grouped background - a hairline
    // border does the separating, not a heavy drop shadow.
    shadow: { shadowColor: '#000000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  },
  glass: {
    key: 'glass',
    label: 'Glassmorphism',
    dark: false,
    bg: '#DDE7FF',
    bgAlt: '#F6DDF0',
    surface: 'rgba(255,255,255,0.55)',
    surfaceAlt: 'rgba(255,255,255,0.35)',
    border: 'rgba(255,255,255,0.75)',
    text: '#1B2340',
    textDim: '#5B6486',
    accent: '#5A5BFF',
    accent2: '#16B39C',
    danger: '#E0464B',
    warn: '#E08A00',
    ok: '#12A06F',
    indigo: '#6B5CE0',
    teal: '#16A0B3',
    pink: '#E0559A',
    purple: '#8A5CE0',
    radius: 24,
    blur: true,
    shadow: { shadowColor: '#4B5A9B', shadowOpacity: 0.22, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
  },
  neu: {
    key: 'neu',
    label: 'Neumorphism',
    dark: false,
    bg: '#E4E9F0',
    bgAlt: '#E4E9F0',
    surface: '#E4E9F0',
    surfaceAlt: '#EDF1F7',
    border: '#D2D9E4',
    text: '#2A3140',
    textDim: '#78818F',
    accent: '#4A76F0',
    accent2: '#2AA79B',
    danger: '#D4565B',
    warn: '#D79A16',
    ok: '#27A06F',
    indigo: '#6A6FD1',
    teal: '#2C9AAA',
    pink: '#D1608F',
    purple: '#8C6FD1',
    radius: 20,
    soft: true,
    shadow: { shadowColor: '#A7B2C4', shadowOpacity: 0.9, shadowRadius: 10, shadowOffset: { width: 6, height: 6 }, elevation: 2 },
  },
  clay: {
    key: 'clay',
    label: 'Claymorphism',
    dark: false,
    bg: '#EDE4FF',
    bgAlt: '#F6EEFF',
    surface: '#FFFFFF',
    surfaceAlt: '#F7F1FF',
    border: '#E2D4FF',
    text: '#2B2150',
    textDim: '#6F6592',
    accent: '#7A4DFF',
    accent2: '#FF7AA2',
    danger: '#F0555F',
    warn: '#FFA630',
    ok: '#39C08B',
    indigo: '#8579F5',
    teal: '#3FBFCF',
    pink: '#FF7AA2',
    purple: '#B27AFF',
    radius: 30,
    puffy: true,
    shadow: { shadowColor: '#9C7BE8', shadowOpacity: 0.35, shadowRadius: 18, shadowOffset: { width: 0, height: 12 }, elevation: 6 },
  },
  hero: {
    key: 'hero',
    label: '3D Hero',
    dark: true,
    bg: '#070C1A',
    bgAlt: '#0D1730',
    surface: '#111C36',
    surfaceAlt: '#16224A',
    border: '#243358',
    text: '#EAF1FF',
    textDim: '#8DA0C6',
    accent: '#4F8CFF',
    accent2: '#33E1C4',
    danger: '#FF5F6D',
    warn: '#FFC542',
    ok: '#2BD9A0',
    indigo: '#8C8AFF',
    teal: '#33E1C4',
    pink: '#FF6FA5',
    purple: '#C58CFF',
    radius: 20,
    glow: true,
    shadow: { shadowColor: '#4F8CFF', shadowOpacity: 0.45, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  },
};


/**
 * Pearl's dark twin: iOS / macOS dark mode. Not a choice in the theme list - Pearl switches to it by itself when the
 * phone or computer is set to dark (ThemeProvider below).
 */
const PEARL_NIGHT = {
  ...THEMES.pearl,
  dark: true,
  bg: '#000000',
  bgAlt: '#1C1C1E',
  surface: '#1C1C1E',
  surfaceAlt: '#2C2C2E',
  border: '#38383A',
  text: '#FFFFFF',
  textDim: '#98989F',
  accent: '#0A84FF',
  accent2: '#64D2FF',
  danger: '#FF453A',
  warn: '#FF9F0A',
  ok: '#30D158',
  indigo: '#5E5CE6',
  teal: '#40C8E0',
  pink: '#FF375F',
  purple: '#BF5AF2',
  shadow: { shadowColor: '#000000', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
};

/**
 * The website's six colour themes (newweb/src/themes.js) in the phone's Pearl shape: same corners, shadows and backdrop tint,
 * their own backdrop, accent and the colours the tiles use (danger / warn / accent / accent2 = the tile colours).
 */
const palette = (key, label, c) => ({ ...(c.dark ? PEARL_NIGHT : THEMES.pearl), key, label, skinned: true, ...c });
THEMES.pearl.skinned = true;
Object.assign(THEMES, {
  violet: palette('violet', 'Vivid Violet (auto dark mode)', { bg: '#F5F2FF', accent: '#6A3DF5', accent2: '#3D86FF', danger: '#FF5A5F', warn: '#FFB81F', darkTwin: { accent: '#8B6CFF', bg: '#0B0614' } }),
  aqua: palette('aqua', 'Aqua Green', { bg: '#F1F4F3', accent: '#0AA56D', accent2: '#2457C5', danger: '#D93A3A', warn: '#A8650A', ok: '#0AA56D' }),
  ocean: palette('ocean', 'Ocean Blue', { bg: '#EFF3FA', accent: '#1F6BFF', accent2: '#5B8CFF', danger: '#D63A4A', warn: '#A86A0A' }),
  sunset: palette('sunset', 'Sunset Orange', { bg: '#F7F3EF', accent: '#F2631B', accent2: '#2B5FC4', danger: '#D33A3A', warn: '#9B6208' }),
  lilac: palette('lilac', 'Lilac Mist', { bg: '#F4F2FA', accent: '#7B5CF5', accent2: '#3A64D6', danger: '#D23B5A', warn: '#A1660B' }),
  // The phone's "Warm" look (chosen by the owner from the style studio): cream backdrop, orange accent, 18px corners, tinted shadows.
  warm: palette('warm', 'Warm (auto dark mode)', { bg: '#FFF7EF', surface: '#FFFFFF', surfaceAlt: '#FFEEDD', border: '#F3E2D0', text: '#2B1A0E', textDim: '#9A7B64', accent: '#EA580C', accent2: '#2B5FC4', danger: '#DC2626', warn: '#B45309', ok: '#16A34A', darkTwin: { bg: '#17100A', surface: '#241911', surfaceAlt: '#302216', border: '#3D2B1C', text: '#FDF2E7', textDim: '#BDA089', accent: '#FB923C' } }),
  night: palette('night', 'Midnight Black', { dark: true, bg: '#000000', surface: '#17181B', surfaceAlt: '#232428', accent: '#34D9A0', accent2: '#8FB5FF', danger: '#FF8A80', warn: '#FFCC66', ok: '#34D9A0' }),
});

/**
 * The design language by platform. The website follows macOS (Sonoma): a frosted side bar, 10px corners, thin
 * separators and soft layered shadows. The phone app follows the website: the same corners, shadows and backdrop tint. Only the Pearl look gets this; the other themes keep their own shapes.
 */
const SKIN = {
  web: {
    radius: 12, btnRadius: 8, fieldRadius: 8, sheetRadius: 14,
    bar: { light: 'rgba(246,246,248,0.72)', dark: 'rgba(36,36,38,0.72)' },
    shadow: { light: { boxShadow: '0 0 0 0.5px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.05), 0 6px 20px rgba(0,0,0,0.05)' }, dark: { boxShadow: '0 0 0 0.5px rgba(255,255,255,0.08), 0 1px 3px rgba(0,0,0,0.4), 0 6px 20px rgba(0,0,0,0.35)' } },
  },
  // The phone app takes the website's look (same corners, soft shadows and tinted backdrop), sized for touch.
  phone: {
    radius: 12, btnRadius: 10, fieldRadius: 10, sheetRadius: 20,
    bar: { light: 'rgba(250,250,252,0.97)', dark: 'rgba(30,30,34,0.97)' },
    tint: { light: '#EFEEFA', dark: '#0E0F1C' },
    shadow: { light: { shadowColor: '#5B5BA8', shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 }, dark: { shadowColor: '#000000', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 2 } },
  },
};

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
  // The phone's full-screen alert (PastDueAlert): its background follows the task's priority.
  priority: {
    High: { top: '#DC2626', bottom: '#7F1D1D', label: 'HIGH PRIORITY', icon: '🚨' },
    Medium: { top: '#D97706', bottom: '#78350F', label: 'MEDIUM PRIORITY', icon: '⏰' },
    Low: { top: '#059669', bottom: '#064E3B', label: 'LOW PRIORITY', icon: '🔔' },
    None: { top: '#2563EB', bottom: '#1E3A8A', label: 'TASK', icon: '🔔' },
  },
  glass: { fill: 'rgba(255,255,255,0.14)', fillStrong: 'rgba(255,255,255,0.26)', line: 'rgba(255,255,255,0.28)', text: '#FFFFFF', dim: 'rgba(255,255,255,0.78)', paper: 'rgba(255,255,255,0.96)', ink: '#1F2937' },
  dark: { surface: '#111827', surfaceAlt: '#1F2937', text: '#F9FAFB', textDim: '#9CA3AF', border: '#374151', title: '#F87171', link: '#93C5FD' },
  banner: { bg: '#B91C1C', label: '#FEE2E2', doneText: '#15803D' },
};

const ThemeCtx = createContext(null);

export function ThemeProvider({ children }) {
  const { data } = useStore();
  // Pearl that nobody picked (the old default) shows as Warm; picking a theme in Config marks it chosen.
  const picked = data?.settings?.theme;
  const themeKey = !picked || (picked === 'pearl' && !data?.settings?.themePicked) ? 'warm' : picked;
  const fontLevel = data?.settings?.fontLevel || 2;
  const classic = data?.settings?.uiMode === 'classic';

  const scheme = useColorScheme();
  const value = useMemo(() => {
    let t = THEMES[themeKey] || THEMES.pearl;
    const scale = FONT_LEVELS[fontLevel] || 1;
    let skin = null;
    if (t.skinned) {
      if (scheme === 'dark' && (t.key === 'pearl' || t.key === 'violet' || t.key === 'warm')) t = { ...PEARL_NIGHT, ...(t.darkTwin || null), key: t.key };
      skin = classic ? null : Platform.OS === 'web' ? SKIN.web : SKIN.phone;
      if (skin) t = { ...t, radius: skin.radius, shadow: skin.shadow[t.dark ? 'dark' : 'light'], ...(skin.tint ? { bg: skin.tint[t.dark ? 'dark' : 'light'] } : null) };
      // Warm keeps its own cream backdrop and has rounder corners and an orange-tinted shadow on the phone.
      if (skin && t.key === 'warm' && Platform.OS !== 'web') {
        const shadow = { shadowColor: t.dark ? '#000000' : '#EA580C', shadowOpacity: t.dark ? 0.4 : 0.1, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 };
        t = { ...t, bg: scheme === 'dark' ? '#17100A' : '#FFF7EF', radius: 18, shadow };
      }
    }
    return {
      ...t,
      btnRadius: skin ? skin.btnRadius : t.radius - 6,
      fieldRadius: skin ? skin.fieldRadius : t.radius - 8,
      sheetRadius: skin ? skin.sheetRadius : 20,
      // Frosted bars (tab bar, side bar): translucent, blurred where the platform can (the website, iOS).
      bar: skin ? skin.bar[t.dark ? 'dark' : 'light'] : t.surface,
      frosted: !!skin,
      // The website's desktop backdrop: a soft wallpaper-like tint, so the frosted side bar has something to blur.
      bgGradient: skin && Platform.OS === 'web' ? (t.dark ? 'linear-gradient(135deg,#0B0F1E 0%,#150F24 55%,#1E1218 100%)' : 'linear-gradient(135deg,#E6ECFB 0%,#F2ECF9 55%,#FCF0EA 100%)') : null,
      hairline: t.dark ? 'rgba(255,255,255,0.18)' : 'rgba(60,60,67,0.29)',
      sideEdge: t.dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)',
      mac: Platform.OS === 'web',
      fs: (n) => Math.round(n * scale),
      fontLevel,
    };
  }, [themeKey, fontLevel, scheme, classic]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

/** Its children see `value` as the theme: the web.app's dark alarm window (style 5) gives its date and pick
 *  fields the window's dark colours this way. `value` is a whole theme (fs() included). */
export function ThemeOverride({ value, children }) {
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

// Outside the provider (nothing renders there today) a bare theme would have no fs() and crash the first caller.
const FALLBACK_THEME = { ...THEMES.pearl, btnRadius: 8, fieldRadius: 6, sheetRadius: 20, bar: THEMES.pearl.surface, frosted: false, mac: false, hairline: '#E5E5EA', sideEdge: '#E5E5EA', fs: (n) => n, fontLevel: 2 };
export const useTheme = () => useContext(ThemeCtx) || FALLBACK_THEME;


// Pure colour maths lives in colour.js so it can be tested without React.
export { blend, opaque, withAlpha } from './colour';
