/**
 * A small log of what went wrong with alerts (the last 40 lines), so a failure is no longer invisible:
 * Config > Alerts shows it. Best effort - the log itself never throws.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'MPT_ALERT_LOG';
const MAX = 40;

export async function logAlert(kind, text) {
  try {
    const all = JSON.parse((await AsyncStorage.getItem(KEY)) || '[]') || [];
    all.unshift({ at: Date.now(), kind: String(kind), text: String(text || '').slice(0, 200) });
    await AsyncStorage.setItem(KEY, JSON.stringify(all.slice(0, MAX)));
  } catch { /* best effort */ }
}
export async function readAlertLog() {
  try { return JSON.parse((await AsyncStorage.getItem(KEY)) || '[]') || []; } catch { return []; }
}
export async function clearAlertLog() { try { await AsyncStorage.removeItem(KEY); } catch { /* best effort */ } }
