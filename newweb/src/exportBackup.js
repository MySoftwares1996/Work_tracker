import { buildBackupExport, backupExportName, backupExportText } from '../../src/backupExport.js';
import { toDoc } from './data.js';

/** The export file for the website's data: tasks in the document shape (what Import reads as it is), plus lists, calendar, links, templates and the saved report formats. */
export function webBackup({ tasks = [], lists = {}, calendar = {}, links = [], templates = [], savedFormats = [] } = {}, now = new Date()) {
  return buildBackupExport({
    entries: tasks.filter((t) => t && !t.purged).map((t) => ({ ...toDoc(t, now), updatedAt: t.updatedAt || now.getTime() })),
    lists, links, templates, reportFormats: savedFormats, holidays: calendar.holidays, leaveDays: calendar.leaveDays, source: 'web',
  }, now);
}

/** Downloads the export as a file; returns how many tasks it holds. */
export function exportBackupFile(store, now = new Date()) {
  const payload = webBackup(store, now);
  const a = document.createElement('a');
  const url = URL.createObjectURL(new Blob([backupExportText(payload)], { type: 'application/json;charset=utf-8' }));
  a.href = url; a.download = backupExportName(now);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return payload.data.workingDashboard.entries.length;
}
