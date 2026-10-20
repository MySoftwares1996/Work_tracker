/**
 * "Export a backup": every task (done and binned ones too, not purged ones) plus the lists, links, templates and report formats, as one
 * JSON file. Pure, shared by the phone (More > Export a backup) and the website (Config > Export a backup). The file is
 * { app, version, exportedAt, data: { workingDashboard: { entries, categories, ... } } }, the section the website's Import
 * (newweb/src/importBackup.js) already reads, so an export can be imported back.
 */
export const EXPORT_APP = 'Working_Dashboard_Export';
export const EXPORT_VERSION = 1;
const LIST_KEYS = ['categories', 'priorities', 'statuses', 'pendingWith', 'subCategories', 'subCategoryCategories', 'narrationTypes', 'darPaymentIntro', 'reminderCategories'];

export function buildBackupExport({ entries = [], lists = {}, links = [], templates = [], reportFormats = [], holidays = [], leaveDays = [], source = '' } = {}, now = new Date()) {
  const wd = { entries: (Array.isArray(entries) ? entries : []).filter((e) => e && e.id && e.purged !== true) };
  const src = lists && typeof lists === 'object' ? lists : {};
  LIST_KEYS.forEach((k) => { if (src[k] !== undefined && src[k] !== null) wd[k] = src[k]; });
  if (Array.isArray(holidays) && holidays.length) wd.holidays = holidays;
  if (Array.isArray(leaveDays) && leaveDays.length) wd.leaveDays = leaveDays;
  if (Array.isArray(links) && links.length) wd.links = links;
  if (Array.isArray(templates) && templates.length) wd.templates = templates;
  if (Array.isArray(reportFormats) && reportFormats.length) wd.reportFormats = reportFormats;
  return { app: EXPORT_APP, version: EXPORT_VERSION, source, exportedAt: now.toISOString(), data: { workingDashboard: wd } };
}

export const backupExportName = (now = new Date()) => `working-dashboard-backup-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}.json`;
export const backupExportText = (payload) => JSON.stringify(payload, null, 2);
