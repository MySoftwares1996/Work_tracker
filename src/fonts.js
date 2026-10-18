import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { fontFor, FONT_DISPLAY } from './theme';
import { textHolder } from './textHolder';

/**
 * Ledger's fonts: Fraunces (titles, big numbers) and Manrope (everything else), from @expo-google-fonts. The files ship inside
 * the JavaScript bundle (no native change). React Native has no global default font, so patchText() makes every <Text>
 * without a font family of its own use the Manrope weight that matches its fontWeight. Fonts that fail to load never block
 * the app: it simply keeps the system font.
 */

let fontsReady = false;      // the patch only names a family once it is registered; before that the system font shows
const WEB_FALLBACK = ', system-ui, -apple-system, "Segoe UI", sans-serif';

/** The font family for a weight ('700', 600 ...), or undefined while the fonts are not loaded. */
export const ff = (weight = 500) => (fontsReady ? fontFor(weight) + (Platform.OS === 'web' ? WEB_FALLBACK : '') : undefined);
/** Fraunces (the display face), or undefined while the fonts are not loaded. */
export const display = () => (fontsReady ? FONT_DISPLAY + (Platform.OS === 'web' ? WEB_FALLBACK : '') : undefined);

/** Loads the fonts once. Returns true when the app may render: loaded, failed, or taken too long (then the system font is used). */
export function useAppFonts(timeoutMs = 2500) {
  const [state, setState] = useState(fontsReady ? 'ready' : 'loading');
  useEffect(() => {
    if (fontsReady) return undefined;
    let alive = true;
    const give = setTimeout(() => { if (alive) setState((s) => (s === 'loading' ? 'late' : s)); }, timeoutMs);
    (async () => {
      try {
        const Font = await import('expo-font');
        const fr = await import('@expo-google-fonts/fraunces');
        const mr = await import('@expo-google-fonts/manrope');
        await Font.loadAsync({
          Fraunces_600SemiBold: fr.Fraunces_600SemiBold,
          Manrope_500Medium: mr.Manrope_500Medium,
          Manrope_600SemiBold: mr.Manrope_600SemiBold,
          Manrope_700Bold: mr.Manrope_700Bold,
          Manrope_800ExtraBold: mr.Manrope_800ExtraBold,
        });
        fontsReady = true;
        if (alive) setState((s) => (s === 'late' ? 'ready-late' : 'ready'));
      } catch {
        if (alive) setState('failed');      // system fonts; the app still renders
      }
    })();
    return () => { alive = false; clearTimeout(give); };
  }, [timeoutMs]);
  // 'ready-late': the fonts arrived after the app was already drawn in the system font - the caller re-keys its tree once.
  return { show: state !== 'loading', key: state === 'ready-late' ? 'late' : 'first' };
}

const NestedCtx = React.createContext(false);
let patched = false;

/**
 * Wraps the platform's Text once. A Text with its own fontFamily is left alone; one without gets the Manrope weight of its
 * flattened fontWeight (400/500 -> Medium, 600 SemiBold, 700 Bold, 800 ExtraBold). A Text inside another Text with no
 * weight of its own keeps inheriting the outer family.
 */
export function patchText() {
  if (patched) return;
  patched = true;
  try {
    const holder = textHolder();
    const Orig = holder.default;
    if (!Orig) return;
    const Patched = (props) => {
      const { style, ...rest } = props;
      const nested = React.useContext(NestedCtx);
      const flat = StyleSheet.flatten(style) || {};
      let next = style;
      if (fontsReady && !flat.fontFamily && !(nested && flat.fontWeight == null)) {
        next = [style, { fontFamily: ff(flat.fontWeight), fontWeight: 'normal' }];
      }
      const el = <Orig {...rest} style={next} />;
      return nested ? el : <NestedCtx.Provider value>{el}</NestedCtx.Provider>;
    };
    Patched.displayName = 'Text';
    Object.keys(Orig).forEach((k) => { try { Patched[k] = Orig[k]; } catch { /* static members are optional */ } });
    holder.default = Patched;
  } catch {
    /* no patch: the system font stays */
  }
}
