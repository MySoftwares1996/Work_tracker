/**
 * The phone's old daily backups (<documents>/auto-backup/auto-YYYY-MM-DD.json), kept on the phone when the auto backup was removed:
 * read only, for Config > Sub categories > Restore (src/listsRestore.js). Nothing writes them any more.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';

const dirUri = () => `${FileSystem.documentDirectory || FileSystem.cacheDirectory}auto-backup/`;

/** The backup file names, newest first ([] on the website or with none). */
export async function listAutoBackups() {
  if (Platform.OS === 'web') return [];
  try {
    return (await FileSystem.readDirectoryAsync(dirUri()).catch(() => [])).filter((n) => /^auto-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse();
  } catch { return []; }
}

/** One backup, parsed (null if it cannot be read). */
export async function readAutoBackup(name) {
  try { return JSON.parse(await FileSystem.readAsStringAsync(dirUri() + name, { encoding: 'utf8' })); } catch { return null; }
}
