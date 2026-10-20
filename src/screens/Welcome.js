import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useStore } from '../store';
import { useLayout } from '../ui';
import Icon from '../icons';
import { display } from '../fonts';
import { signInWithGoogle } from '../firebaseSync';

const POINTS = [
  'Alarms that ring on time, even on the lock screen',
  'One tap to finish a task, or add it to the daily report',
  'The same data on every device you sign in on',
];

/**
 * The first screen for someone who has not signed in (Ledger): the dark primary panel, a serif headline, three ticks and a
 * white Google button. Signing in with Google is all a new person does: their own space in Firebase is created with their
 * first sign-in (RealtimeSync.js / firebaseSync.js), and the phone app and the website both show it from then on.
 * "Use on this phone only" keeps everything on this device.
 */
export default function Welcome() {
  const t = useTheme();
  const { update } = useStore();
  const { tablet } = useLayout();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const signIn = async () => {
    setBusy(true);
    setError('');
    try { await signInWithGoogle(); } catch (e) { setError(e?.message || 'Sign-in did not finish. Please try again.'); }
    finally { setBusy(false); }
  };
  const useLocally = () => update((db) => ({ ...db, workingDashboard: { ...(db.workingDashboard || {}), localOnly: true } }));

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.primaryDark }} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 28, paddingTop: 40, paddingBottom: 24 }}>
        <View style={{ flexGrow: 1, width: '100%', maxWidth: tablet ? 460 : undefined, alignSelf: 'center', gap: 22 }}>
          <View style={{ width: 68, height: 68, borderRadius: 22, backgroundColor: t.mint, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="done" size={38} color={t.primaryDark} stroke={2.4} />
          </View>
          <Text accessibilityRole="header" style={{ color: '#fff', fontFamily: display(), fontWeight: '600', fontSize: t.fs(44), lineHeight: t.fs(45), letterSpacing: -1.4, marginTop: 6 }}>Your work, always in step.</Text>
          <Text style={{ color: t.heroDim, fontWeight: '500', fontSize: t.fs(16), lineHeight: t.fs(24) }}>
            Tasks, alerts and the daily report - on your phone and on the web, kept in sync.
          </Text>

          <View style={{ gap: 14, marginTop: 6 }}>
            {POINTS.map((text) => (
              <View key={text} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <View style={{ width: 26, height: 26, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center', marginTop: -2 }}>
                  <Icon name="check" size={15} color={t.mint} stroke={2.6} />
                </View>
                <Text style={{ flex: 1, color: '#fff', fontWeight: '600', fontSize: t.fs(15), lineHeight: t.fs(20) }}>{text}</Text>
              </View>
            ))}
          </View>

          <View style={{ flexGrow: 1, minHeight: 12 }} />

          <View style={{ gap: 6 }}>
            <Pressable
              onPress={signIn}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Sign in with Google"
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
                backgroundColor: '#fff', borderRadius: 18, paddingVertical: 17, opacity: busy ? 0.7 : pressed ? 0.9 : 1,
              })}
            >
              {busy ? <ActivityIndicator color={t.primaryDark} /> : (
                <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: t.border, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(14) }}>G</Text>
                </View>
              )}
              <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(16) }}>{busy ? 'Signing in…' : 'Sign in with Google'}</Text>
            </Pressable>
            {!!error && <Text style={{ color: '#fff', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 12, padding: 10, fontSize: t.fs(13.5), lineHeight: t.fs(19) }}>{error}</Text>}
            <Pressable onPress={useLocally} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 12 }}>
              <Text style={{ color: t.heroDim, fontWeight: '700', fontSize: t.fs(14) }}>{Platform.OS === 'web' ? 'Use on this browser only' : 'Use on this phone only'}</Text>
            </Pressable>
            <Text style={{ textAlign: 'center', color: t.mint, fontWeight: '600', fontSize: t.fs(12) }}>Your tasks stay in your own private space.</Text>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
