import { applyBackup, buildBackup, unpackBackup, normaliseBackupFile, BACKUP_SECTIONS } from '../../src/backup.js';

export async function run({ ck, section }) {
  section('Backup: the Working Dashboard and settings');
  const db = {
    settings: { theme: 'pearl', fontLevel: 2 },
    workingDashboard: { entries: [{ id: 'a', title: 'Pay vendor' }], categories: ['GST'], alarmRingtone: 'chime' },
    expenses: { txns: [{ id: 'x' }] },
  };
  const b = buildBackup(db);
  ck('a backup holds only the Working Dashboard and settings', BACKUP_SECTIONS.join() === 'settings,workingDashboard' && !!b.data.workingDashboard && !!b.data.settings && !b.data.expenses);
  ck('...in the same file shape as My Personal Tracker, so either app reads it', b.app === 'My_Personal_Tracker' && !!b.exportedAt);

  const incoming = { data: { workingDashboard: { entries: [{ id: 'a', title: 'Old copy' }, { id: 'b', title: 'Send SOA' }], categories: ['GST', 'TDS'] } } };
  const merged = applyBackup(db, incoming, 'merge');
  ck('merge adds entries by id and keeps the phone\'s copy of one it has', merged.workingDashboard.entries.length === 2 && merged.workingDashboard.entries[0].title === 'Pay vendor');
  ck('...and adds list values it lacks', merged.workingDashboard.categories.join() === 'GST,TDS');
  const replaced = applyBackup(db, incoming, 'replace');
  ck('replace takes the file\'s Working Dashboard', replaced.workingDashboard.entries.length === 2 && replaced.workingDashboard.entries[0].title === 'Old copy');

  ck('unpack hands the backup back as it is (no attachment files here)', (await unpackBackup(incoming)) === incoming);
  let err = null; try { normaliseBackupFile({ nope: 1 }); } catch (e) { err = e; }
  ck('a file that is not a backup is refused', /backup file/.test(err?.message || ''));
}
