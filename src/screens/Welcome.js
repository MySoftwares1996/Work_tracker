import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme';
import { useStore } from '../store';
import { useLayout } from '../ui';
import { signInWithGoogle } from '../firebaseSync';
import AnimatedLogo from '../AnimatedLogo';

const POINTS = [
  ['📋', 'Your tasks, due dates and deadlines in one register'],
  ['⏰', 'Alerts before each task is due, and a Past Due list'],
  ['📝', 'A Daily Activity Report from what you completed'],
  ['🔄', 'The same data on your phone and on the web, kept in step live'],
];

/**
 * The first screen for someone who has not signed in. Signing in with Google is all a new person does: their own
 * space in Firebase is created with their first sign-in (RealtimeSync.js / firebaseSync.js), and the phone app and
 * the website both show it from then on. "Use without an account" keeps everything on this device only.
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
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
        <View style={{ width: '100%', maxWidth: tablet ? 460 : undefined, alignSelf: 'center', gap: 22 }}>
          <View style={{ gap: 8 }}>
            <AnimatedLogo size={72} />
            <Text style={{ color: t.accent, fontWeight: '800', fontSize: t.fs(13), letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 8 }}>Working Dashboard</Text>
            <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(28), lineHeight: t.fs(34) }}>Sign in to get started</Text>
            <Text style={{ color: t.textDim, fontSize: t.fs(15), lineHeight: t.fs(22) }}>
              Use your Google account. Your data is private to your account, and you can sign in on {Platform.OS === 'web' ? 'the Android app' : 'the website'} too.
            </Text>
          </View>

          <View style={{ gap: 12 }}>
            {POINTS.map(([icon, text]) => (
              <View key={text} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
                <Text style={{ fontSize: t.fs(18) }}>{icon}</Text>
                <Text style={{ flex: 1, color: t.text, fontSize: t.fs(14.5), lineHeight: t.fs(21) }}>{text}</Text>
              </View>
            ))}
          </View>

          <View style={{ gap: 10 }}>
            <Pressable
              onPress={signIn}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => ({
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                backgroundColor: t.accent, borderRadius: 14, paddingVertical: 15, opacity: busy ? 0.7 : pressed ? 0.88 : 1,
              })}
            >
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: t.fs(16) }}>G</Text>}
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: t.fs(16) }}>{busy ? 'Signing in…' : 'Sign in with Google'}</Text>
            </Pressable>
            {!!error && <Text style={{ color: t.danger, fontSize: t.fs(13.5), lineHeight: t.fs(19) }}>{error}</Text>}
            <Pressable onPress={useLocally} accessibilityRole="button" style={{ alignItems: 'center', paddingVertical: 10 }}>
              <Text style={{ color: t.textDim, fontSize: t.fs(14), textDecorationLine: 'underline' }}>Use without an account (this device only)</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
