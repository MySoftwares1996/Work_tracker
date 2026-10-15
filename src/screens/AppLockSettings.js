import React, { useState } from 'react';
import { Alert, Platform, Switch } from 'react-native';
import { Small, Btn, Field, Sheet, Group, Item } from '../ui';
import { useTheme } from '../theme';
import { useStore } from '../store';
import { hasPin, setPin as saveAppPin, clearPin as clearAppPin, isBiometricAvailable } from '../appLock';

// Home-screen widgets are an Android feature; the browser build has none.
const hasWidgets = Platform.OS === 'android';

/**
 * App lock (PIN, fingerprint) - the Security group of Settings, also shown in the Working Dashboard's Config page.
 * `title`/`footer` are the Group's.
 */
export default function AppLockSettings({ title = 'Security', footer = 'The PIN lives only on this phone and is never included in a backup.' }) {
  const t = useTheme();
  const { data, update } = useStore();
  const [biometricAvailable, setBiometricAvailable] = React.useState(false);
  const [pinSheet, setPinSheet] = React.useState(null); // 'set' | 'change' | null
  const [pin1, setPin1] = useState('');
  const [pin2, setPin2] = useState('');
  const [pinError, setPinError] = useState('');

  React.useEffect(() => { isBiometricAvailable().then(setBiometricAvailable); }, []);

  const openPinSheet = (mode) => { setPin1(''); setPin2(''); setPinError(''); setPinSheet(mode); };

  const savePin = async () => {
    if (pin1.length < 4) { setPinError('At least 4 digits'); return; }
    if (pin1 !== pin2) { setPinError('PINs do not match'); return; }
    try { await saveAppPin(pin1); } catch { setPinError('The PIN could not be saved on this phone. Try again.'); return; }
    if (pinSheet === 'set') update({ settings: { appLock: { ...(data.settings.appLock || {}), enabled: true, setupDone: true } } });
    setPinSheet(null);
    Alert.alert(pinSheet === 'set' ? 'App lock turned on' : 'PIN changed');
  };

  const toggleAppLock = async () => {
    if (data.settings.appLock?.enabled) {
      Alert.alert(
        'Turn off app lock?',
        'Anyone who opens this app will be able to see everything in it.',
        [{ text: 'Cancel' }, {
          text: 'Turn off', style: 'destructive', onPress: async () => {
            await clearAppPin();
            update({ settings: { appLock: { enabled: false, biometric: false, setupDone: true } } });
          },
        }],
      );
    } else if (await hasPin()) {
      update({ settings: { appLock: { ...(data.settings.appLock || {}), enabled: true, setupDone: true } } });
    } else {
      openPinSheet('set');
    }
  };

  const st = data.settings;
  const appLockOn = !!st.appLock?.enabled;

  return (
    <>
      <Group title={title} footer={footer}>
        <Item icon="🔒" color={t.danger} label="App lock" right={<Switch value={appLockOn} onValueChange={toggleAppLock} trackColor={{ false: t.border, true: t.ok }} />} last={!appLockOn} />
        {appLockOn && biometricAvailable && (
          <Item icon="🫆" color={t.ok} label="Unlock with fingerprint / face" right={<Switch value={!!st.appLock?.biometric} onValueChange={(v) => update({ settings: { appLock: { ...st.appLock, biometric: v } } })} trackColor={{ false: t.border, true: t.ok }} />} />
        )}
        {appLockOn && <Item icon="🔢" color={t.indigo} label="Change PIN" onPress={() => openPinSheet('change')} last={!hasWidgets} />}
        {appLockOn && hasWidgets && <Item icon="📱" color={t.accent2} label="Widgets show details while locked" right={<Switch value={!!st.widgets?.showWhenLocked} onValueChange={(v) => update({ settings: { widgets: { showWhenLocked: v } } })} trackColor={{ false: t.border, true: t.ok }} />} last />}
      </Group>

      <Sheet visible={!!pinSheet} onClose={() => setPinSheet(null)} title={pinSheet === 'set' ? 'Set a PIN' : 'Change PIN'}>
        <Field
          label="PIN (4-6 digits)"
          value={pin1}
          onChangeText={(v) => { setPin1(v.replace(/[^0-9]/g, '').slice(0, 6)); setPinError(''); }}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
          autoFocus
        />
        <Field
          label="Confirm PIN"
          value={pin2}
          onChangeText={(v) => { setPin2(v.replace(/[^0-9]/g, '').slice(0, 6)); setPinError(''); }}
          keyboardType="number-pad"
          secureTextEntry
          maxLength={6}
        />
        {!!pinError && <Small style={{ color: t.danger, marginBottom: 8 }}>{pinError}</Small>}
        <Btn title="Save" onPress={savePin} />
      </Sheet>
    </>
  );
}
