import { buildBackupExport, backupExportName, backupExportText } from '../../src/backupExport.js';
import { toDoc } from './data.js';
import { formatsBackupText } from './reportFormats.js';

/** The export file for the website's data: tasks in the document shape (what Import reads as it is), plus lists, calendar, links, templates and the saved report formats. */
export function webBackup({ tasks = [], lists = {}, calendar = {}, links = [], templates = [], savedFormats = [] } = {}, now = new Date()) {
  return buildBackupExport({
    entries: tasks.filter((t) => t && !t.purged).map((t) => ({ ...toDoc(t, now), updatedAt: t.updatedAt || now.getTime() })),
    lists, links, templates, reportFormats: savedFormats, holidays: calendar.holidays, leaveDays: calendar.leaveDays, source: 'web',
  }, now);
}

const LAST_BACKUP = 'wd-last-backup';
/** When a backup was last downloaded from this browser (ms), or 0. */
export function lastBackupAt() { try { return Number(localStorage.getItem(LAST_BACKUP)) || 0; } catch { return 0; } }

/** Downloads the export as a file; returns how many tasks it holds. */
export function exportBackupFile(store, now = new Date()) {
  const payload = webBackup(store, now);
  const a = document.createElement('a');
  const url = URL.createObjectURL(new Blob([backupExportText(payload)], { type: 'application/json;charset=utf-8' }));
  a.href = url; a.download = backupExportName(now);
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  try { localStorage.setItem(LAST_BACKUP, String(Date.now())); } catch { /* not remembered */ }
  return payload.data.workingDashboard.entries.length;
}

/** Every report format as readable text: Sub Category, Category and the sentence with its {Field} marks. */
export function formatsText(formats = [], now = new Date()) {
  const list = (formats || []).filter((f) => f && String(f.template || '').trim());
  const head = `Report formats - ${list.length} (${now.toISOString().slice(0, 10)})`;
  const body = list.map((f, i) => [`${i + 1}. ${f.subCategory || '(no Sub Category)'}`, `   Category: ${f.category || '-'}`, `   Format: ${String(f.template).trim()}`].join('\n'));
  return [head, '='.repeat(head.length), '', ...body.flatMap((b) => [b, ''])].join('\n');
}

/** Downloads every current report format as a text file; returns how many. */
export function downloadFormatsFile(formats, now = new Date()) {
  const text = formatsText(formats, now);
  const a = document.createElement('a');
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  a.href = url; a.download = `report-formats-${now.toISOString().slice(0, 10)}.txt`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return (formats || []).filter((f) => f && String(f.template || '').trim()).length;
}

/** Downloads a restorable backup (JSON) of every current report format; returns how many. */
export function downloadFormatsBackup(formats, now = new Date()) {
  const a = document.createElement('a');
  const url = URL.createObjectURL(new Blob([formatsBackupText(formats, now)], { type: 'application/json;charset=utf-8' }));
  a.href = url; a.download = `report-formats-backup-${now.toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return (formats || []).filter((f) => f && String(f.template || '').trim()).length;
}
