import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Platform, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from './theme';

/**
 * Phone only, and only in a build made with the update settings (docs/PHONE_UPDATES.md): when the app opens or comes back to the
 * front it looks for a newer version of its screens, downloads it quietly, and offers "Restart" to use it at once. Without the
 * settings (or while developing) it does nothing.
 */
export default function PhoneUpdate() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [ready, setReady] = useState(false);
  const busy = useRef(false);
  const lastLook = useRef(0);
  const Updates = useRef(null);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    try { Updates.current = require('expo-updates'); } catch { return undefined; }
    if (!Updates.current || !Updates.current.isEnabled) return undefined;
    const look = async () => {
      if (busy.current || Date.now() - lastLook.current < 60000) return;
      busy.current = true; lastLook.current = Date.now();
      try {
        const res = await Updates.current.checkForUpdateAsync();
        if (res && res.isAvailable) { await Updates.current.fetchUpdateAsync(); setReady(true); }
      } catch { /* offline, or no update: look again later */ }
      busy.current = false;
    };
    look();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') look(); });
    return () => sub.remove();
  }, []);

  if (!ready) return null;
  return (
    <View accessibilityRole="alert" style={{ position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom, 8) + 84, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: t.accent, ...t.shadow }}>
      <Text style={{ flex: 1, color: '#fff', fontWeight: '700' }}>A new version of the app is ready.</Text>
      <Pressable onPress={() => { try { Updates.current.reloadAsync(); } catch { /* stays on this version until the next open */ } }} accessibilityRole="button" style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#fff' }}>
        <Text style={{ color: t.accent, fontWeight: '800' }}>Restart</Text>
      </Pressable>
    </View>
  );
}
