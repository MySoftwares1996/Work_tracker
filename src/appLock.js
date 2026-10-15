import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

/**
 * The app's own lock screen - a PIN, with biometric as an optional shortcut.
 *
 * The PIN lives only in SecureStore (Android Keystore-backed encryption),
 * never in the regular settings JSON, so it never rides along in a backup
 * file and a restore on a new phone never silently carries an old PIN over.
 */
const PIN_KEY = 'MPT_APP_LOCK_PIN';

export async function hasPin() {
  try { return (await SecureStore.getItemAsync(PIN_KEY)) != null; } catch { return false; }
}

export async function setPin(pin) {
  await SecureStore.setItemAsync(PIN_KEY, String(pin));
}

export async function verifyPin(pin) {
  try { return (await SecureStore.getItemAsync(PIN_KEY)) === String(pin); } catch { return false; }
}

/** How many digits the saved PIN has, so the pad can check it exactly once it is complete. */
export async function pinLength() {
  try { return String((await SecureStore.getItemAsync(PIN_KEY)) || '').length; } catch { return 0; }
}

/**
 * Wrong PINs in a row and the cool-down end, kept with the PIN rather than in
 * memory: the cool-down used to reset whenever the app was closed and opened
 * again, so it slowed nobody down.
 */
const LOCKOUT_KEY = 'MPT_APP_LOCK_FAILS';
export async function loadLockout() {
  try {
    const v = JSON.parse((await SecureStore.getItemAsync(LOCKOUT_KEY)) || '{}');
    return { wrong: Number(v.wrong) || 0, until: Number(v.until) || 0 };
  } catch { return { wrong: 0, until: 0 }; }
}
export async function saveLockout(wrong, until) {
  try { await SecureStore.setItemAsync(LOCKOUT_KEY, JSON.stringify({ wrong, until })); } catch { /* best effort */ }
}
export async function clearLockout() {
  try { await SecureStore.deleteItemAsync(LOCKOUT_KEY); } catch { /* nothing to clear */ }
}

export async function clearPin() {
  try { await SecureStore.deleteItemAsync(PIN_KEY); } catch { /* nothing to clear */ }
}

/** False on iOS Simulator, an emulator with no fingerprint/face enrolled, or no sensor at all. */
export async function isBiometricAvailable() {
  if (Platform.OS === 'web') return false;
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && enrolled;
  } catch {
    return false;
  }
}

/**
 * Asks for fingerprint / face. Resolves { ok, error } - error is the system's reason ('user_cancel', 'lockout',
 * 'system_cancel'...) so the lock screen can retry when Android cancelled the prompt itself.
 * requireConfirmation is off: with it on, a recognised face still waited for a tap on "Confirm", which felt like
 * face unlock not working.
 */
export async function authenticateDetailed() {
  try {
    const res = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Unlock Working Dashboard',
      cancelLabel: 'Use PIN instead',
      disableDeviceFallback: true, // the app's own PIN screen is the fallback, not the phone's lock PIN
      requireConfirmation: false,
      biometricsSecurityLevel: 'weak',   // camera face unlock (Class 2) counts, not only fingerprint
    });
    return { ok: !!res.success, error: res.success ? null : (res.error || 'unknown') };
  } catch {
    return { ok: false, error: 'unknown' };
  }
}

/** True on success. */
export async function authenticateWithBiometric() {
  return (await authenticateDetailed()).ok;
}
