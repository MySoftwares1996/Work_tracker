import { buildBackupExport, backupExportName, backupExportText, EXPORT_VERSION } from '../../src/backupExport.js';
import { buildBackup, BACKUP_SECTIONS } from '../../src/backup.js';

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

  section('Export a backup: all tasks as one JSON file');
  const now = new Date(2026, 9, 17, 9, 0);
  const ex = buildBackupExport({ entries: [{ id: 'a', title: 'Open' }, { id: 'b', title: 'Done', done: true }, { id: 'c', title: 'Binned', binned: true }, { id: 'd', title: 'Gone', purged: true }, null, { title: 'no id' }], lists: { categories: ['GST'], junk: 1 }, links: [{ id: 'l', url: 'https://x.test' }], templates: [{ id: 't', name: 'T' }] }, now);
  const wdx = ex.data.workingDashboard;
  ck('the export has a version and a time', ex.version === EXPORT_VERSION && ex.exportedAt === now.toISOString());
  ck('...all tasks, done and binned ones too, but not purged or id-less rows', wdx.entries.map((e) => e.id).join() === 'a,b,c');
  ck('...the lists, links and templates when there are some, and nothing unknown', wdx.categories.join() === 'GST' && wdx.links.length === 1 && wdx.templates.length === 1 && !('junk' in wdx) && !('holidays' in wdx));
  ck('...as JSON that reads back the same', JSON.stringify(JSON.parse(backupExportText(ex))) === JSON.stringify(ex));
  ck('...named by the day', backupExportName(now) === 'working-dashboard-backup-2026-10-17.json');
  ck('an empty store still gives a valid file', buildBackupExport({}, now).data.workingDashboard.entries.length === 0);
}
