import React, { createContext, useContext, useMemo } from 'react';
import { useColorScheme, Platform } from 'react-native';
import { useStore } from './store';
import { THEMES, FONT_LEVELS, themeKeyOf, build, DEFAULT_THEME } from './themeTokens';

// Everything below is re-exported, so screens keep importing from './theme'.
export * from './themeTokens';

const ThemeCtx = createContext(null);

export function ThemeProvider({ children }) {
  const { data } = useStore();
  const stored = themeKeyOf(data?.settings?.theme);
  // Glass is the APK's own look: the website keeps the default if the setting comes along.
  const themeKey = stored === 'glass' && Platform.OS === 'web' ? DEFAULT_THEME : stored;
  const fontLevel = data?.settings?.fontLevel || 2;
  // "Follow the phone's dark mode" (Config > Appearance): on unless switched off.
  const followDark = data?.settings?.followDark !== false;

  const scheme = useColorScheme();
  const value = useMemo(() => {
    const t = build(themeKey, followDark && scheme === 'dark');
    const scale = FONT_LEVELS[fontLevel] || 1;
    return { ...t, fs: (n) => Math.round(n * scale), fontLevel };
  }, [themeKey, fontLevel, scheme, followDark]);

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

/** Its children see `value` as the theme: the web.app's dark alarm window (style 5) gives its date and pick
 *  fields the window's dark colours this way. `value` is a whole theme (fs() included). */
export function ThemeOverride({ value, children }) {
  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

// Outside the provider (nothing renders there today) a bare theme would have no fs() and crash the first caller.
const FALLBACK_THEME = { ...THEMES.forest, fs: (n) => n, fontLevel: 2 };
export const useTheme = () => useContext(ThemeCtx) || FALLBACK_THEME;


// Pure colour maths lives in colour.js so it can be tested without React.
export { blend, opaque, withAlpha } from './colour';
