import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, AppState, StyleSheet, Alert, BackHandler } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Btn, Small } from './ui';
import { useTheme } from './theme';
import { useStore } from './store';
import { hasPin, setPin as savePin, verifyPin, pinLength, isBiometricAvailable, authenticateWithBiometric, authenticateDetailed, loadLockout, saveLockout, clearLockout } from './appLock';
import { lockPhase, shouldRelock, PIN_MIN, PIN_MAX, lockoutMs } from './appLockCore';
import { setRecentsHidden } from './tracker';

/**
 * Guards the whole app. Nothing inside it is mounted on a cold start until
 * the PIN or biometric check passes, so no data is ever drawn behind the
 * lock. When the app comes back after RELOCK_AFTER_MS in the background, an
 * opaque full-screen lock covers it again (the screens underneath keep their
 * place, so a half-filled form is not lost).
 *
 * Right after the name is entered on first launch, it asks for a PIN and
 * offers fingerprint / face unlock before the dashboard opens.
 */
export default function AppLockGate({ children }) {
  const t = useTheme();
  const { data, ready, update } = useStore();
  const lock = data.settings?.appLock || {};
  const named = !!data.profile?.displayName;

  const [phase, setPhase] = useState('checking');
  const [opened, setOpened] = useState(false);       // children mounted at least once
  const leftAt = useRef(0);
  // An opaque cover while the app is leaving the screen, so the recent-apps preview of an older
  // Android (no native switch for it) shows a blank screen rather than the data behind the lock.
  const [veiled, setVeiled] = useState(false);

  // With the lock on, keep the app's screen out of the recent-apps preview (Android 13+).
  useEffect(() => { if (ready) setRecentsHidden(!!lock.enabled); }, [ready, lock.enabled]);

  const decide = useCallback(async () => {
    const pinSet = await hasPin();
    setPhase(lockPhase({ named, enabled: !!lock.enabled, setupDone: !!lock.setupDone, hasPin: pinSet }));
  }, [named, lock.enabled, lock.setupDone]);

  // Cold start, and right after onboarding sets the name.
  useEffect(() => {
    if (!ready) return;
    if (phase === 'checking' || (phase === 'open' && named && !lock.setupDone && !lock.enabled)) decide();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-decide on these transitions, not on every store write.
  }, [ready, named, lock.setupDone, lock.enabled]);

  useEffect(() => { if (phase === 'open') setOpened(true); }, [phase]);

  // Re-lock after a while in the background; a quick trip to a picker or the camera does not.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (lock.enabled && s !== 'active') setVeiled(true);
      if (s === 'background') leftAt.current = Date.now();
      else if (s === 'active') {
        setVeiled(false);
        if (lock.enabled) setRecentsHidden(true);    // a recreated activity starts without it
        const away = leftAt.current;
        leftAt.current = 0;
        if (lock.enabled && shouldRelock(away)) hasPin().then((p) => { if (p) setPhase('locked'); });
      }
    });
    return () => sub.remove();
  }, [lock.enabled]);

  const finishSetup = async ({ pin, biometric }) => {
    try {
      await savePin(pin);
    } catch (e) {
      Alert.alert('PIN not saved', `${e?.message || 'The phone\'s secure storage refused it.'} Try again.`);
      return;
    }
    update({ settings: { appLock: { enabled: true, biometric, setupDone: true } } });
    setPhase('open');
  };

  const cover = phase !== 'open';

  // While the lock covers the screens, Android's back button must not move them underneath.
  useEffect(() => {
    if (!cover || !opened) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [cover, opened]);
  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      {opened && children}
      {veiled && !cover && <View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg }]} />}
      {cover && (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg }]}>
          {phase === 'locked' && <LockScreen name={data.profile?.displayName} biometricOn={!!lock.biometric} onUnlock={() => setPhase('open')} />}
          {phase === 'setup' && <LockSetup onDone={finishSetup} />}
        </View>
      )}
    </View>
  );
}

/** Dots for the digits typed so far. */
function PinDots({ length, filled, error }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, marginVertical: 22 }}>
      {Array.from({ length }, (_, i) => (
        <View key={i} style={{
          width: 14, height: 14, borderRadius: 7,
          backgroundColor: i < filled ? (error ? t.danger : t.accent) : 'transparent',
          borderWidth: 2, borderColor: error ? t.danger : i < filled ? t.accent : t.border,
        }} />
      ))}
    </View>
  );
}

/** 1-9, then [left], 0, ⌫. */
function PinPad({ onDigit, onBack, left }) {
  const t = useTheme();
  const key = (label, onPress, opts = {}) => (
    <Pressable
      key={label}
      onPress={onPress}
      disabled={!onPress}
      accessibilityLabel={opts.a11y || label}
      style={({ pressed }) => ({
        width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center',
        backgroundColor: onPress && !opts.plain ? (pressed ? t.accent + '33' : t.surfaceAlt) : 'transparent',
      })}
    >
      <Text style={{ color: t.text, fontSize: opts.small ? t.fs(15) : t.fs(26), fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
  const rows = [['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']];
  return (
    <View style={{ alignItems: 'center', gap: 14 }}>
      {rows.map((r) => (
        <View key={r[0]} style={{ flexDirection: 'row', gap: 22 }}>{r.map((d) => key(d, () => onDigit(d)))}</View>
      ))}
      <View style={{ flexDirection: 'row', gap: 22 }}>
        {left ? key(left.label, left.onPress, { plain: true, a11y: left.a11y, small: left.small }) : key(' ', null)}
        {key('0', () => onDigit('0'))}
        {key('⌫', onBack, { plain: true, a11y: 'Delete' })}
      </View>
    </View>
  );
}

function LockScreen({ name, biometricOn, onUnlock }) {
  const t = useTheme();
  const [pin, setPinText] = useState('');
  const [len, setLen] = useState(0);              // digits in the saved PIN
  const [error, setError] = useState('');
  const [wrong, setWrong] = useState(0);
  const [waitUntil, setWaitUntil] = useState(0);
  const [canBio, setCanBio] = useState(false);
  const [, tick] = useState(0);
  // The parent re-renders on every store change; keep the latest callback
  // without re-running the effects below (which would re-prompt biometric).
  const unlockRef = useRef(onUnlock);
  unlockRef.current = onUnlock;

  const unlock = useCallback(() => { clearLockout(); unlockRef.current(); }, []);
  const tryBiometric = useCallback(async (attempt = 0) => {
    const { ok, error } = await authenticateDetailed();
    if (ok) return unlock();
    if (error === 'lockout') setError('Too many face / fingerprint tries - use your PIN');
    // Android cancels the prompt itself when the app is not fully on screen yet (just resumed): ask again.
    else if (attempt < 2 && ['system_cancel', 'app_cancel', 'timeout', 'unable_to_process', 'unknown'].includes(error)) {
      setTimeout(() => tryBiometric(attempt + 1), 700);
    }
  }, [unlock]);

  // Once per lock: learn the PIN length, pick up a cool-down still running from before a restart,
  // and, if enabled, ask for biometric.
  useEffect(() => {
    pinLength().then(setLen);
    loadLockout().then(({ wrong: w, until }) => {
      setWrong(w);
      if (until > Date.now()) { setWaitUntil(until); setError('Too many wrong PINs'); }
    });
    (async () => {
      const ok = biometricOn && (await isBiometricAvailable());
      setCanBio(ok);
      if (ok) setTimeout(() => tryBiometric(), 400);     // let the screen settle before the system prompt
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately once per lock screen.
  }, []);

  useEffect(() => {
    if (!waitUntil) return undefined;
    const i = setInterval(() => { if (Date.now() >= waitUntil) setWaitUntil(0); tick((n) => n + 1); }, 1000);
    return () => clearInterval(i);
  }, [waitUntil]);

  const fail = () => {
    const n = wrong + 1;
    setWrong(n);
    setPinText('');
    const wait = lockoutMs(n);
    const until = wait ? Date.now() + wait : 0;
    if (wait) setWaitUntil(until);
    saveLockout(n, until);
    setError(wait ? 'Too many wrong PINs' : 'Wrong PIN');
  };

  // Checked exactly once, when as many digits as the saved PIN are entered -
  // every wrong full-length try counts towards the cool-down.
  const target = len || PIN_MAX;
  const waiting = waitUntil > Date.now();
  const onDigit = async (d) => {
    if (waiting || pin.length >= target) return;
    const next = pin + d;
    setPinText(next); setError('');
    if (next.length === target) {
      if (await verifyPin(next)) unlock(); else fail();
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <Text style={{ fontSize: t.fs(44) }}>🔒</Text>
      <Text style={{ color: t.text, fontSize: t.fs(20), fontWeight: '800', marginTop: 10 }}>{name ? `Welcome back, ${name}` : 'Locked'}</Text>
      <Small style={{ marginTop: 4 }}>{canBio ? 'Use your fingerprint / face, or enter your PIN' : 'Enter your PIN'}</Small>
      <PinDots length={target} filled={pin.length} error={!!error} />
      <Small style={{ color: t.danger, minHeight: 18, marginTop: -10, marginBottom: 8 }}>
        {waiting ? `${error} - try again in ${Math.ceil((waitUntil - Date.now()) / 1000)} s` : error}
      </Small>
      <PinPad
        onDigit={onDigit}
        onBack={() => { setPinText((p) => p.slice(0, -1)); setError(''); }}
        left={canBio ? { label: '👆', onPress: () => tryBiometric(), a11y: 'Use fingerprint or face' } : null}
      />
    </SafeAreaView>
  );
}

/** First launch: create a PIN, confirm it, then offer fingerprint / face unlock. */
function LockSetup({ onDone }) {
  const t = useTheme();
  const [step, setStep] = useState('create');      // create | confirm | biometric
  const [first, setFirst] = useState('');
  const [pin, setPinText] = useState('');
  const [error, setError] = useState('');
  const [canBio, setCanBio] = useState(false);

  useEffect(() => { isBiometricAvailable().then(setCanBio); }, []);

  const onDigit = (d) => {
    const next = (pin + d).slice(0, PIN_MAX);
    setPinText(next); setError('');
    if (step === 'confirm' && next.length === first.length) {
      if (next === first) { if (canBio) setStep('biometric'); else onDone({ pin: first, biometric: false }); }
      else { setError('PINs do not match - try again'); setPinText(''); }
    }
  };

  const enableBiometric = async () => {
    if (await authenticateWithBiometric()) onDone({ pin: first, biometric: true });
    else Alert.alert('Not turned on', 'Fingerprint / face was not confirmed. You can turn it on later in Settings → App lock.');
  };

  if (step === 'biometric') {
    return (
      <SafeAreaView style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: t.fs(56), textAlign: 'center' }}>👆</Text>
        <Text style={{ color: t.text, fontSize: t.fs(22), fontWeight: '800', textAlign: 'center', marginTop: 12 }}>Unlock with fingerprint or face?</Text>
        <Small style={{ textAlign: 'center', marginTop: 8 }}>Faster than typing your PIN every time. Your PIN still works as a backup.</Small>
        <Btn style={{ marginTop: 28 }} title="Use fingerprint / face" onPress={enableBiometric} />
        <Btn style={{ marginTop: 10 }} kind="soft" title="PIN only" onPress={() => onDone({ pin: first, biometric: false })} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
      <Text style={{ fontSize: t.fs(44) }}>🛡️</Text>
      <Text style={{ color: t.text, fontSize: t.fs(20), fontWeight: '800', marginTop: 10, textAlign: 'center' }}>
        {step === 'create' ? 'Secure your app' : 'Confirm your PIN'}
      </Text>
      <Small style={{ marginTop: 4, textAlign: 'center' }}>
        {step === 'create' ? `Choose a ${PIN_MIN}-${PIN_MAX} digit PIN. It is needed to open the app and is never included in backups.` : 'Enter the same PIN again.'}
      </Small>
      <PinDots length={step === 'confirm' ? first.length : Math.max(PIN_MIN, pin.length)} filled={pin.length} error={!!error} />
      <Small style={{ color: t.danger, minHeight: 18, marginTop: -10, marginBottom: 8 }}>{error}</Small>
      <PinPad
        onDigit={onDigit}
        onBack={() => { setPinText((p) => p.slice(0, -1)); setError(''); }}
        left={step === 'confirm' ? { label: 'Back', small: true, onPress: () => { setStep('create'); setPinText(first); setError(''); } } : null}
      />
      {step === 'create' && (
        <Btn
          style={{ marginTop: 18, alignSelf: 'stretch' }}
          title="Continue"
          disabled={pin.length < PIN_MIN}
          onPress={() => { setFirst(pin); setPinText(''); setStep('confirm'); }}
        />
      )}
    </SafeAreaView>
  );
}
