import { lockPhase } from '../../src/appLockCore.js';
import { hasPin, setPin, verifyPin, clearPin, isBiometricAvailable, authenticateWithBiometric } from '../../src/appLock.js';
import { __reset as resetSecureStore } from '../stubs/expo-secure-store.mjs';
import { __set as setBiometric } from '../stubs/expo-local-authentication.mjs';

export async function run({ ck, section }) {
  section('App lock: the PIN lives only in the device\'s encrypted store');
  resetSecureStore();

  ck('no PIN set yet', (await hasPin()) === false);
  ck('nothing to verify against yet', (await verifyPin('1234')) === false);

  await setPin('1234');
  ck('a PIN now exists', (await hasPin()) === true);
  ck('the right PIN verifies', (await verifyPin('1234')) === true);
  ck('a wrong PIN does not', (await verifyPin('9999')) === false);
  ck('a numeric PIN is compared as a string, not coerced oddly', (await verifyPin(1234)) === true);

  await setPin('5678');
  ck('setting a new PIN replaces the old one', (await verifyPin('1234')) === false && (await verifyPin('5678')) === true);

  await clearPin();
  ck('clearing removes it entirely', (await hasPin()) === false);
  ck('clearing twice is harmless', await clearPin().then(() => true));

  section('App lock: biometric is only offered when the device genuinely supports it');
  setBiometric(true, true, true);
  ck('hardware present and a face/fingerprint enrolled: available', (await isBiometricAvailable()) === true);

  setBiometric(true, false, true);
  ck('hardware present but nothing enrolled: not available', (await isBiometricAvailable()) === false);

  setBiometric(false, false, true);
  ck('no sensor at all: not available', (await isBiometricAvailable()) === false);

  setBiometric(true, true, true);
  ck('a successful scan resolves true', (await authenticateWithBiometric()) === true);

  setBiometric(true, true, false);
  ck('a failed/cancelled scan resolves false, not a throw', (await authenticateWithBiometric()) === false);
}

export async function runExtra({ ck, section }) {
  const { loadLockout, saveLockout, clearLockout } = await import('../../src/appLock.js');
  section('App lock: the wrong-PIN cool-down survives closing the app');
  resetSecureStore();
  ck('nothing recorded at first', JSON.stringify(await loadLockout()) === JSON.stringify({ wrong: 0, until: 0 }));
  const until = Date.now() + 30000;
  await saveLockout(5, until);
  const back = await loadLockout();
  ck('the count and the cool-down end are read back after a restart', back.wrong === 5 && back.until === until);
  await clearLockout();
  ck('a successful unlock clears it', (await loadLockout()).wrong === 0);

  section('App lock: when it engages');
  ck('lock on with a PIN asks for it', lockPhase({ enabled: true, hasPin: true }) === 'locked');
  ck('lock on without a PIN asks for one', lockPhase({ enabled: true, hasPin: false }) === 'setup');
  ck('lock off opens the app (no profile name needed)', lockPhase({ enabled: false, hasPin: false }) === 'open' && lockPhase({ enabled: false, hasPin: true }) === 'open');
}
