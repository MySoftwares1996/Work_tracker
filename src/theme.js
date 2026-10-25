import React, { useEffect, createContext, useContext, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import { useStore } from './store';
import { THEMES, FONT_LEVELS, themeKeyOf, build } from './themeTokens';

// Everything below is re-exported, so screens keep importing from './theme'.
export * from './themeTokens';

const ThemeCtx = createContext(null);

export function ThemeProvider({ children }) {
  const { data, ready, update } = useStore();
  // One time, when the Pearl look arrived: a phone still on the old default (Forest) moves to Pearl; any other colour the person chose stays.
  const lookDone = !!data?.settings?.lookPearl;
  useEffect(() => {
    if (!ready || lookDone) return;
    const cur = data?.settings?.theme;
    update({ settings: { lookPearl: true, ...(!cur || cur === 'forest' ? { theme: 'pearl' } : null) } });
  }, [ready, lookDone]);      // eslint-disable-line react-hooks/exhaustive-deps
  const themeKey = themeKeyOf(data?.settings?.theme);
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
