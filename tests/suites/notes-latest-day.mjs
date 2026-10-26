import { latestDayNotes } from '../../src/notesLatest.js';
import { notesForReport } from '../../src/workingDashboardReport.js';

export async function run({ ck, section }) {
  section('Notes: only the last day of dated notes counts');
  const n = '[24-10-2026] Coordinated with the Tech team.\n\n[25-10-2026] Prepared all invoices.\nShared with the team.';
  ck('keeps the last day, with its continuation lines', latestDayNotes(n) === '[25-10-2026] Prepared all invoices.\nShared with the team.');
  ck('the latest date wins even if written first', latestDayNotes('[26-10-2026] New.\n[24-10-2026] Old.') === '[26-10-2026] New.');
  ck('notes with no date are kept as they are', latestDayNotes('Plain note.\nSecond.') === 'Plain note.\nSecond.');
  ck('other date styles', latestDayNotes('[1 Oct 2026] a\n[2 Oct 2026] b') === '[2 Oct 2026] b');
  ck('the report line uses the last day only', notesForReport({ title: 'x', notes: n }).join(' ') === 'Prepared all invoices. Shared with the team.');
}
