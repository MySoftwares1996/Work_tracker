import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Platform } from 'react-native';
import { useTheme } from './theme';

/**
 * web.app only: a page that stays open keeps running the version it loaded, so a deploy went unseen until the person
 * reloaded by hand ("not fixed"). Every few minutes, and when the tab comes back to the front, the page asks the
 * server for index.html (always fresh) and compares the script it names with the one running. A different one means
 * a new version: a bar offers "Reload".
 */
const SCRIPT = /\/_expo\/static\/js\/web\/index-[A-Za-z0-9]+\.js/;
const running = () => {
  const doc = globalThis.document;
  if (!doc) return '';
  const el = [...doc.getElementsByTagName('script')].map((s) => s.getAttribute('src') || '').find((s) => SCRIPT.test(s));
  return el ? (SCRIPT.exec(el) || [''])[0] : '';
};

export default function NewVersion() {
  const t = useTheme();
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof fetch !== 'function') return undefined;
    const mine = running();
    if (!mine) return undefined;     // a dev server: nothing to compare
    let stop = false;
    const look = async () => {
      try {
        const res = await fetch('/index.html', { cache: 'no-store' });
        if (!res.ok) return;
        const m = SCRIPT.exec(await res.text());
        if (!stop && m && m[0] !== mine) setFresh(true);
      } catch { /* offline: look again later */ }
    };
    const timer = setInterval(look, 5 * 60000);
    const onShow = () => { if (globalThis.document?.visibilityState === 'visible') look(); };
    globalThis.document?.addEventListener('visibilitychange', onShow);
    look();
    return () => { stop = true; clearInterval(timer); globalThis.document?.removeEventListener('visibilitychange', onShow); };
  }, []);
  if (Platform.OS !== 'web' || !fresh) return null;
  return (
    <View accessibilityRole="alert" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 99999, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 10, backgroundColor: t.accent }}>
      <Text style={{ color: '#fff', fontWeight: '700' }}>A new version of the Working Dashboard is ready.</Text>
      <Pressable onPress={() => globalThis.location?.reload()} accessibilityRole="button" style={{ paddingVertical: 6, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#fff' }}>
        <Text style={{ color: t.accent, fontWeight: '800' }}>Reload</Text>
      </Pressable>
    </View>
  );
}
