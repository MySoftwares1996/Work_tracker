import React from 'react';
import { View, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Btn } from '../ui';
import { useTheme } from '../theme';

/**
 * Shown once on the phone, after sign-in, when Android would show task alerts only as a notification to tap
 * ("Open over other apps" / full-screen alarms off). One tap takes the person to the setting; Skip leaves the
 * dashboard's own reminder banner in place.
 */
export default function WdAlarmIntro({ kind, onAllow, onSkip }) {
  const t = useTheme();
  return (
    <SafeAreaView accessibilityViewIsModal style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, zIndex: 60, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', padding: 28 }}>
      <Text style={{ color: t.textDim, fontWeight: '800', fontSize: t.fs(11), letterSpacing: 0.8 }}>ONE QUICK SETTING</Text>
      <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: t.accent + '1F', alignItems: 'center', justifyContent: 'center', marginVertical: 18 }}>
        <Text style={{ fontSize: t.fs(44) }}>🔔</Text>
      </View>
      <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(24), textAlign: 'center' }}>Alarms that actually ring</Text>
      <Text style={{ color: t.textDim, fontSize: t.fs(15), lineHeight: t.fs(22), textAlign: 'center', marginTop: 10, maxWidth: 340 }}>
        {kind === 'fullscreen'
          ? 'Allow full-screen alarms so a due task opens over the lock screen instead of hiding in a notification.'
          : 'Allow "Open over other apps" so a due task opens full screen - on the lock screen and while you use the phone.'}
      </Text>
      <Btn style={{ marginTop: 24, alignSelf: 'stretch' }} title="Allow alarms" onPress={onAllow} />
      <Btn style={{ marginTop: 10, alignSelf: 'stretch' }} kind="soft" title="Skip for now" onPress={onSkip} />
    </SafeAreaView>
  );
}
