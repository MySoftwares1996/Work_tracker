import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, BackHandler, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useTheme } from '../theme';
import { WEB_APP_URL, isOwnUrl, parseBridgeMessage, replyScript, safeFileName } from '../webBridge';
import { googleIdToken, signOutOfGoogle } from '../firebaseSync';
import { setWebUi } from '../appMode';

/**
 * The Android app's home: the new website (newweb/) in a built-in browser, so every screen, card, form and the look are the
 * website's own, and a website update reaches the app without a new build. The app keeps what a web page cannot do: the phone's
 * alarms (they run from the same account in the background), Google sign-in, copy, print, saving files and the phone settings.
 */
export default function WebApp({ navigation }) {
  const t = useTheme();
  const web = useRef(null);
  const canGoBack = useRef(false);
  const [state, setState] = useState('loading');           // loading | ready | error
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (canGoBack.current && web.current) { web.current.goBack(); return true; } return false; });
    return () => sub.remove();
  }, []);

  const answer = useCallback((id, value) => { if (web.current) web.current.injectJavaScript(replyScript(id, value)); }, []);

  const onMessage = useCallback(async (event) => {
    const { url, data } = event.nativeEvent;
    if (!isOwnUrl(url)) return;                          // only the site itself may ask the app for anything
    const m = parseBridgeMessage(data);
    if (!m) return;
    try {
      if (m.type === 'token') answer(m.id, await googleIdToken().catch(() => null));
      else if (m.type === 'signin') answer(m.id, await googleIdToken({ interactive: true }).catch(() => null));
      else if (m.type === 'signout') { await signOutOfGoogle(); answer(m.id, true); }
      else if (m.type === 'copy') { await Clipboard.setStringAsync(String(m.text ?? '')); answer(m.id, true); }
      else if (m.type === 'print') { const Print = await import('expo-print'); await Print.printAsync({ html: String(m.html || '') }); answer(m.id, true); }
      else if (m.type === 'file') {
        const uri = `${FileSystem.cacheDirectory}${safeFileName(m.name)}`;
        await FileSystem.writeAsStringAsync(uri, String(m.text ?? ''));
        if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: String(m.mime || 'text/plain'), dialogTitle: safeFileName(m.name) });
        answer(m.id, true);
      } else if (m.type === 'settings') { navigation.navigate('Settings'); answer(m.id, true); }
      else if (m.type === 'classic') { setWebUi(false); answer(m.id, true); }
    } catch { answer(m.id, null); }
  }, [answer, navigation]);

  // Links to other sites and mail open in the phone's own browser / mail app, not inside the dashboard.
  const onShouldStart = useCallback((req) => {
    if (isOwnUrl(req.url)) return true;
    Linking.openURL(req.url).catch(() => {});
    return false;
  }, []);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top', 'bottom', 'left', 'right']}>
      <WebView
        key={attempt}
        ref={web}
        source={{ uri: WEB_APP_URL }}
        style={{ flex: 1, backgroundColor: t.bg }}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        allowFileAccess={false}
        mixedContentMode="never"
        originWhitelist={['https://*', 'about:*']}
        onMessage={onMessage}
        onShouldStartLoadWithRequest={onShouldStart}
        onNavigationStateChange={(s) => { canGoBack.current = !!s.canGoBack; }}
        onLoadEnd={() => setState((x) => (x === 'error' ? x : 'ready'))}
        onError={() => setState('error')}
        onHttpError={() => setState('error')}
        pullToRefreshEnabled
      />
      {state === 'loading' && (
        <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg }}>
          <ActivityIndicator color={t.accent} size="large" />
          <Text style={{ color: t.textDim, marginTop: 12 }}>Opening Working Dashboard…</Text>
        </View>
      )}
      {state === 'error' && (
        <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, padding: 24, gap: 14 }}>
          <Text style={{ color: t.text, fontSize: t.fs(20), fontWeight: '800', textAlign: 'center' }}>Could not open the dashboard</Text>
          <Text style={{ color: t.textDim, textAlign: 'center' }}>Check the internet connection and try again. You can also use the phone's own screens, which work without internet.</Text>
          <Pressable onPress={() => { setState('loading'); setAttempt((n) => n + 1); }} style={{ backgroundColor: t.accent, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22 }} accessibilityRole="button"><Text style={{ color: '#fff', fontWeight: '700' }}>Try again</Text></Pressable>
          <Pressable onPress={() => setWebUi(false)} style={{ paddingVertical: 10 }} accessibilityRole="button"><Text style={{ color: t.accent, fontWeight: '700' }}>Use the phone screens</Text></Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
