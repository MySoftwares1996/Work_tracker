import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { useTheme } from './theme';

/**
 * Only in a build made with the update settings (docs/PHONE_UPDATES.md). When the app opens or comes back to the front it looks for a
 * newer version of its screens (at most once a minute) and downloads it. An update downloaded at any time - here, or by the automatic
 * check at launch - makes "A new version of the app is ready - Restart" appear; the bar follows the update state itself, so it does not
 * depend on this check finding anything new. Without the settings (or while developing) it does nothing.
 */
export default function PhoneUpdate() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { isUpdatePending } = Updates.useUpdates();
  const busy = useRef(false);
  const lastLook = useRef(0);

  useEffect(() => {
    if (!Updates.isEnabled) return undefined;
    const look = async () => {
      if (busy.current || Date.now() - lastLook.current < 60000) return;
      busy.current = true; lastLook.current = Date.now();
      try {
        const res = await Updates.checkForUpdateAsync();
        if (res && res.isAvailable) await Updates.fetchUpdateAsync();
      } catch { /* offline, or nothing new: look again later */ }
      busy.current = false;
    };
    look();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') look(); });
    return () => sub.remove();
  }, []);

  if (!Updates.isEnabled || !isUpdatePending) return null;
  return (
    <View accessibilityRole="alert" style={{ position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom, 8) + 84, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: t.accent, ...t.shadow }}>
      <Text style={{ flex: 1, color: '#fff', fontWeight: '700' }}>A new version of the app is ready.</Text>
      <Pressable onPress={() => { Updates.reloadAsync().catch(() => {}); }} accessibilityRole="button" style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#fff' }}>
        <Text style={{ color: t.accent, fontWeight: '800' }}>Restart</Text>
      </Pressable>
    </View>
  );
}
