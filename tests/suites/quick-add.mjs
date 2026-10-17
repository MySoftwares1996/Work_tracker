import { parseQuickAdd, describeQuickAdd } from '../../src/quickAdd.js';

export async function run(h) {
  await runQuickAdd(h);
  await runTemplates(h);
  await runChecklist(h);
  await runSnooze(h);
  await runSummaryAi(h);
  await runNarrationHistory(h);
  await runCsv(h);
  await runVendorTotals(h);
  await runMeeting(h);
  await runAudit(h);
  await runBackupContent(h);
  await runQuickAddSettings(h);
}
async function runQuickAdd({ ck, section }) {
  section('Quick add: a sentence becomes a task');
  const now = new Date(2026, 9, 9, 10, 0);      // Fri 9 Oct 2026, 10:00
  const opt = { now, categories: ['Payments', 'Tally'], assignees: ['Rahul', 'Self'] };
  const a = parseQuickAdd('Pay ICICI invoice tomorrow 5pm high with Rahul Payments', opt);
  ck('title is what is left', a.title === 'Pay ICICI invoice', a.title);
  ck('priority, person and category are read', a.priority === 'High' && a.pendingWith === 'Rahul' && a.category === 'Payments');
  const d = new Date(a.dueAt);
  ck('tomorrow 5 pm', d.getDate() === 10 && d.getHours() === 17 && d.getMinutes() === 0);
  const b = parseQuickAdd('send report on monday', opt);
  ck('a weekday is the next one (Mon 12 Oct), date only', new Date(b.dueAt).getDate() === 12 && b.dateOnly && b.title === 'send report');
  const c = parseQuickAdd('call bank in 2 hours', opt);
  ck('in 2 hours', Math.round((new Date(c.dueAt) - now) / 3600000) === 2 && c.title === 'call bank');
  const e = parseQuickAdd('file GST 15 oct 11:30', opt);
  ck('15 Oct 11:30', new Date(e.dueAt).getMonth() === 9 && new Date(e.dueAt).getDate() === 15 && new Date(e.dueAt).getHours() === 11 && e.title === 'file GST');
  const f = parseQuickAdd('reconcile nostro at 9', opt);
  ck('"at 9" is 9 am, tomorrow because it has passed', new Date(f.dueAt).getDate() === 10 && new Date(f.dueAt).getHours() === 9);
  const g = parseQuickAdd('RE: Invoice INV/118 payment advice', opt);
  ck('a mail subject is the title and the mail chain', g.reference.startsWith('RE: Invoice') && g.title === 'Invoice INV/118 payment advice');
  const h = parseQuickAdd('plain task with nothing special', opt);
  ck('nothing recognised: all text stays the title', h.title === 'plain task with nothing special' && !h.dueAt && !h.priority);
  ck('a readable summary', describeQuickAdd(a, now) === 'High · Tomorrow 5:00 PM · Payments · with Rahul', describeQuickAdd(a, now));
  const i = parseQuickAdd('review 25/12/2026', opt);
  ck('dd/mm/yyyy is day first', new Date(i.dueAt).getMonth() === 11 && new Date(i.dueAt).getDate() === 25);
}

import { templateFrom, applyTemplate, saveTemplate } from '../../src/templates.js';
async function runTemplates({ ck, section }) {
  section('Templates');
  const e = { id: 'x1', title: 'Month-end reconciliation', category: 'Accounts', priority: 'High', status: 'Pending', dueAt: '2026-10-31T10:00:00.000Z', reference: 'RE: old', keyPoints: [{ key: 'Bank', value: 'ICICI' }], notes: 'Check nostro' };
  const t = templateFrom(e);
  ck('a template keeps the usual fields, not dates or mail chain', t.fields.category === 'Accounts' && !t.fields.dueAt && !t.fields.reference && t.name === 'Month-end reconciliation');
  ck('key points keep their labels but not their values', t.fields.keyPoints[0].key === 'Bank' && t.fields.keyPoints[0].value === '');
  const d = applyTemplate({ id: 'new1', title: '', priority: 'Medium', dueAt: '2026-11-01T09:00:00.000Z' }, t);
  ck('a new task starts from it and keeps its own id and date', d.id === 'new1' && d.title === 'Month-end reconciliation' && d.priority === 'High' && d.dueAt === '2026-11-01T09:00:00.000Z');
  ck('same name replaces, newest first', saveTemplate([{ id: 'a', name: 'month-end reconciliation', fields: {} }], t).length === 1);
}

import { checklistText, checklistOpen, addStep, toggleStep, removeStep } from '../../src/checklist.js';
export async function runChecklist({ ck, section }) {
  section('Checklist');
  let l = addStep(addStep([], 'Download statement'), 'Match entries');
  ck('steps are added, blank ones are not', l.length === 2 && addStep(l, '  ').length === 2);
  l = toggleStep(l, l[0].id);
  ck('progress reads 1/2 and one step is open', checklistText({ checklist: l }) === '1/2' && checklistOpen({ checklist: l }).length === 1);
  ck('a task without a checklist shows nothing', checklistText({}) === '');
  ck('a step can be removed', removeStep(l, l[0].id).length === 1);
}

import { snoozeSuggestions } from '../../src/pastDue.js';
import { snoozeEntry } from '../../src/workingDashboard.js';
export async function runSnooze({ ck, section }) {
  section('Smart snooze suggestions');
  let e = { id: 'a', title: 't', dueAt: '2026-10-09T10:00:00.000Z' };
  for (let i = 0; i < 2; i++) e = snoozeEntry(e, Date.now() + 60000);
  ck('two snoozes: no suggestion yet', snoozeSuggestions(e, { assignees: ['Self', 'Pending With Bank'] }).length === 0 && e.snoozeCount === 2);
  e = snoozeEntry(e, Date.now() + 60000);
  const tips = snoozeSuggestions(e, { assignees: ['Self', 'Pending With Bank'], now: new Date(2026, 9, 9, 10, 0) });
  ck('three snoozes: move to the next working day and hand over to the bank', tips.length === 2 && !!tips[0].dueAt && tips[1].patch.pendingWith === 'Pending With Bank');
}

import { buildSummaryPrompt, summaryNumbersLost } from '../../src/reportStyle.js';
export async function runSummaryAi({ ck, section }) {
  section('Weekly / monthly AI summary');
  ck('your instructions reach the summary prompt', buildSummaryPrompt('Week of 5 Oct\n12 payments', 'Two lines each, formal.', 'week').includes('Two lines each, formal.'));
  ck('a rewrite that keeps every number is accepted', summaryNumbersLost('12 payments, Rs 4,35,000', 'Twelve payments... 12 payments and Rs 435000 in all').length === 0);
  ck('a rewrite that loses a number is caught', summaryNumbersLost('12 payments, 40 tasks', 'Many payments and 12 done').join() === '40');
}

import { addHistory, toggleFav, removeHistory } from '../../src/narrationHistory.js';
export async function runNarrationHistory({ ck, section }) {
  section('Narration history and favourites');
  let l = addHistory([], 'Being Balance amount paid against Invoice No: 52', 'Balance', 1000);
  l = addHistory(l, 'Being Advance paid', 'Advance', 2000);
  l = addHistory(l, 'Being Balance amount paid against Invoice No: 52', 'Balance', 3000);
  ck('the same text moves to the top, not twice', l.length === 2 && l[0].typeName === 'Balance');
  l = toggleFav(l, l[1].id);
  for (let i = 0; i < 40; i++) l = addHistory(l, `n${i}`, '', 5000 + i);
  ck('a starred one stays when old ones are dropped', l.some((x) => x.fav) && l.length <= 31);
  ck('a history line can be removed', removeHistory(l, l[0].id).length === l.length - 1);
}

import { reportCsvRows } from '../../src/workingDashboardReport.js';
export async function runCsv({ ck, section }) {
  section('Report to Excel (CSV rows)');
  const m = reportCsvRows({ sections: [{ title: 'Payments', rows: [{ line: 'Tech: paid 45,000' }] }, { title: 'Other', rows: [{ line: 'Called the bank' }] }] }, '');
  ck('a daily report gives Section / Entry rows', m.rows.length === 2 && m.rows[0].Section === 'Payments' && m.columns.join() === 'Section,Entry');
  const w = reportCsvRows(null, 'Week of 5 Oct\n* 12 payments\n\n* 3 follow-ups');
  ck('a summary gives one row per line', w.rows.length === 3 && w.rows[1].Line === '12 payments');
}

import { paymentsByVendor } from '../../src/workingDashboardReport.js';
export async function runVendorTotals({ ck, section }) {
  section('Payments by vendor');
  const mk = (id, vendor, amt, done = '2026-10-05T10:00:00') => ({ id, title: `${vendor}: pay`, category: 'Payments', done: true, completedAt: new Date(done).toISOString(), keyPoints: amt ? [{ key: 'Amount', value: String(amt) }] : [], narration: { typeName: 'COD Charges against PO', fieldsValues: { 'Vendor Name': vendor } } });
  const r = paymentsByVendor([mk('1', 'Tech Profuse', 45000), mk('2', 'Tech Profuse', 5000), mk('3', 'Acme', 20000), mk('4', 'Old', 9999, '2026-09-30T10:00:00'), { id: '5', title: 'x', category: 'Other', done: true, completedAt: '2026-10-05T10:00:00.000Z' }], undefined, '2026-10');
  ck('this month only, payments only', r.count === 3 && r.total === 70000);
  ck('grouped by vendor, biggest first', r.rows[0].total === 50000 && r.rows[0].count === 2 && r.rows.length === 2, JSON.stringify(r.rows));
}

import { entryAlertPlan, isQuietTime } from '../../src/workingDashboard.js';
export async function runMeeting({ ck, section }) {
  section('Meeting mode holds alerts');
  const now = new Date(2026, 9, 9, 10, 0);
  const e = { id: 'm1', title: 'Pay', priority: 'High', status: 'Pending', dueAt: new Date(2026, 9, 9, 11, 0).toISOString() };
  const plain = entryAlertPlan(e, now, {});
  const hold = new Date(2026, 9, 9, 12, 0).getTime();
  const held = entryAlertPlan(e, now, { holdUntil: hold });
  ck('without it the alerts fall before 12:00', plain.some((x) => x.at.getTime() < hold));
  ck('with it nothing rings before the hold ends (High priority too)', held.length > 0 && held.every((x) => x.at.getTime() >= hold));
  ck('nudges are quiet during it', isQuietTime(new Date(2026, 9, 9, 11, 0), { holdUntil: hold }) === true && isQuietTime(new Date(2026, 9, 9, 13, 0), { holdUntil: hold }) === false);
}


import { addAudit, auditDiff } from '../../src/audit.js';
export async function runAudit({ ck, section }) {
  section('Audit trail');
  const a = { title: 'Pay', status: 'Pending', priority: 'Medium', dueAt: '2026-10-09T10:00:00.000Z', notes: '' };
  const b = { ...a, status: 'In-Progress', dueAt: '2026-10-12T11:30:00.000Z', notes: 'called' };
  const d = auditDiff(a, b);
  ck('changes are listed', d.includes('Status: Pending → In-Progress') && d.some((x) => x.startsWith('Due moved to')) && d.includes('Notes edited'));
  ck('nothing changed, nothing listed', auditDiff(a, { ...a }).length === 0);
  ck('a new task is "Created"', auditDiff(null, a)[0] === 'Created');
  let l = [];
  for (let i = 0; i < 40; i++) l = addAudit(l, `step ${i}`, i % 2 ? 'web' : 'phone', 1000 + i);
  ck('the newest 30 are kept, newest first, with the device', l.length === 30 && l[0].what === 'step 39' && l[0].by === 'web');
}

import { buildBackup } from '../../src/backup.js';
export async function runBackupContent({ ck, section }) {
  section('Backups leave out working copies');
  const b = buildBackup({ settings: {}, workingDashboard: { entries: [{ id: 1 }], undoHistory: [{ id: 'u' }], narrationHistory: [{ id: 'n' }] } });
  ck('entries are in, history copies are not', b.data.workingDashboard.entries.length === 1 && !('undoHistory' in b.data.workingDashboard) && !('narrationHistory' in b.data.workingDashboard));
}

export async function runQuickAddSettings({ ck, section }) {
  section('Quick add settings');
  const now = new Date(2026, 9, 9, 10, 0);
  const a = parseQuickAdd('review 05/10', { now, dateOrder: 'mdy' });
  ck('month first reads 05/10 as 10 May', new Date(a.dueAt).getMonth() === 4 && new Date(a.dueAt).getDate() === 10);
  const b = parseQuickAdd('send file tomorrow', { now, dateOnlyTime: '17:00' });
  ck('a date alone takes the chosen time', new Date(b.dueAt).getHours() === 17 && !b.dateOnly);
  const e = { id: 'a', snoozeCount: 3, pendingWith: 'Self' };
  ck('the bank word is configurable', snoozeSuggestions(e, { assignees: ['Self', 'Canara'], bankWord: 'canara', now }).some((x) => x.patch && x.patch.pendingWith === 'Canara'));
}
