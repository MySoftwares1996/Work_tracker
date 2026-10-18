/**
 * The Working Dashboard's backup: its entries, lists, activity log and config, plus the app settings (theme,
 * text size). The file has the same shape as a My Personal Tracker backup, so either app's file restores in the
 * other - here only the sections below are taken from it.
 */
export const BACKUP_SECTIONS = ['settings', 'workingDashboard'];

export function buildBackup(db, sections = BACKUP_SECTIONS) {
  const payload = { app: 'My_Personal_Tracker', schema: db.schema || 1, exportedAt: new Date().toISOString(), data: {} };
  for (const s of sections) if (db[s] !== undefined) payload.data[s] = db[s];
  // Working copies that only bloat a backup: the saved "Recent Changes" snapshots and the narration history.
  if (payload.data.workingDashboard) { const { undoHistory, narrationHistory, ...rest } = payload.data.workingDashboard; payload.data.workingDashboard = rest; }
  return payload;
}

