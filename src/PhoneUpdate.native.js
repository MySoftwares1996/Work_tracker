import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, AppState } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { useTheme } from './theme';
import { warnQuiet } from './quietCatch';
import UpdateBar from './UpdateBar';

/**
 * Only in a build made with the update settings (docs/PHONE_UPDATES.md). When the app opens or comes back to the front it looks for a
 * newer version of its screens (at most once a minute) and downloads it. An update downloaded at any time - here, or by the automatic
 * check at launch - makes "A new version of the app is ready - Restart" appear; the bar follows the update state itself, so it does not
 * depend on this check finding anything new. Without the settings (or while developing) it does nothing.
 */
export default function PhoneUpdate() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { isUpdatePending, isChecking, isDownloading, downloadProgress, downloadError } = Updates.useUpdates();
  // The bar at the top while the app checks / downloads: a clock that runs only then, and the estimate from the progress.
  const working = !!(isChecking || isDownloading);
  const startedAt = useRef(0);
  const [elapsed, setElapsed] = useState(0);
  const [showError, setShowError] = useState(false);
  useEffect(() => {
    if (!working) { startedAt.current = 0; return undefined; }
    if (!startedAt.current) startedAt.current = Date.now();
    setElapsed(Date.now() - startedAt.current);
    const i = setInterval(() => setElapsed(Date.now() - startedAt.current), 500);
    return () => clearInterval(i);
  }, [working]);
  useEffect(() => {
    if (!downloadError) return undefined;
    setShowError(true);
    const x = setTimeout(() => setShowError(false), 5000);
    return () => clearTimeout(x);
  }, [downloadError]);
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

  if (!Updates.isEnabled) return null;
  if (working || showError) return <UpdateBar phase={showError && !working ? 'error' : isDownloading ? 'downloading' : 'checking'} progress={isDownloading ? downloadProgress : undefined} elapsedMs={elapsed} top={insets.top} />;
  if (!isUpdatePending) return null;
  return (
    <View accessibilityRole="alert" style={{ position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom, 8) + 84, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, backgroundColor: t.accent, ...t.shadow }}>
      <Text style={{ flex: 1, color: '#fff', fontWeight: '700' }}>A new version of the app is ready.</Text>
      <Pressable onPress={() => { Updates.reloadAsync().catch(warnQuiet('PhoneUpdate.native')); }} accessibilityRole="button" style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#fff' }}>
        <Text style={{ color: t.accent, fontWeight: '800' }}>Restart</Text>
      </Pressable>
    </View>
  );
}
