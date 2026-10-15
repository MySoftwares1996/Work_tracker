/**
 * A backup of the Working Dashboard every day, kept on the phone itself (the last 7), so a bad edit, a wrong Replace or a
 * restore gone wrong can be rolled back to yesterday without having made a backup by hand. Phone only - the website's
 * data lives in the account, not in the browser. Files: <documents>/auto-backup/auto-YYYY-MM-DD.json.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { buildBackup } from './backup';

export const KEEP_BACKUPS = 7;
const dirUri = () => `${FileSystem.documentDirectory || FileSystem.cacheDirectory}auto-backup/`;
const p2 = (n) => String(n).padStart(2, '0');
export const backupName = (d = new Date()) => `auto-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}.json`;

/** Names to delete so that only the newest `keep` remain (names sort by date). Pure. */
export const backupsToPrune = (names = [], keep = KEEP_BACKUPS) => names.filter((n) => /^auto-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse().slice(keep);

/** Writes today's backup unless it exists; prunes the old ones. Returns the file name written, or '' (already there / not on the phone). */
export async function runAutoBackup(db, now = new Date()) {
  if (Platform.OS === 'web') return '';
  try {
    const dir = dirUri();
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
    const name = backupName(now);
    const have = await FileSystem.readDirectoryAsync(dir).catch(() => []);
    let written = '';
    if (!have.includes(name) && db && db.workingDashboard && (db.workingDashboard.entries || []).length) {
      await FileSystem.writeAsStringAsync(dir + name, JSON.stringify(buildBackup(db, ['settings', 'workingDashboard'])), { encoding: 'utf8' });
      written = name;
    }
    const all = await FileSystem.readDirectoryAsync(dir).catch(() => []);
    for (const old of backupsToPrune(all)) await FileSystem.deleteAsync(dir + old, { idempotent: true }).catch(() => {});
    return written;
  } catch { return ''; }
}

/** [{ name, label, size }] newest first. */
export async function listAutoBackups() {
  if (Platform.OS === 'web') return [];
  try {
    const dir = dirUri();
    const names = (await FileSystem.readDirectoryAsync(dir).catch(() => [])).filter((n) => /^auto-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse();
    const out = [];
    for (const name of names) {
      const info = await FileSystem.getInfoAsync(dir + name).catch(() => ({}));
      out.push({ name, label: name.replace(/^auto-|\.json$/g, ''), size: Number(info.size) || 0 });
    }
    return out;
  } catch { return []; }
}

export async function readAutoBackup(name) {
  const text = await FileSystem.readAsStringAsync(dirUri() + name, { encoding: 'utf8' });
  return JSON.parse(text);
}
