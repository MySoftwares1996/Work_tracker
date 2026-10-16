import { buildReport, toEntry, mergeAi } from '../../newweb/src/reportEngine.js';
import { fromDoc, addFollowUp, logWork, toDoc } from '../../newweb/src/data.js';
import { SAMPLE_FORMATS } from '../../newweb/src/reportFormats.js';

export async function run({ ck, section }) {
  section('New website: the Daily Report uses the phone app\'s report engine');
  const day = '2026-10-16';
  const done = fromDoc('a', { description: 'Prepared the monthly MIS', category: 'Reports', status: 'Completed', completedAt: '2026-10-16T09:00:00.000Z', darInclude: true, notes: 'Shared with the manager' });
  const bank = fromDoc('b', { description: 'HDFC FD Statement Collation.', category: "Bank Follow-up's", status: 'Pending', subCategory: "Urgent Bank Follow Up's", subCategoryFields: { "Banker's Reply's:": 'Need to collect on an urgent basis' } });
  const worked = addFollowUp(bank, { remarks: 'Banker will share the statement tomorrow', next: new Date(2026, 9, 17, 10) }, new Date(2026, 9, 16, 11));
  ck('a follow-up is written to the work log and the follow-ups', worked.workLog.length === 1 && worked.workLog[0].d === day && worked.bankFollowUps.length === 1 && worked._wl && worked._bf);
  ck('the follow-up and work log are written back with the task', JSON.stringify(toDoc(worked).workLog) === JSON.stringify(worked.workLog) && toDoc(worked).bankFollowUps.length === 1);
  ck('completing logs the day', logWork(done, 'Completed', new Date(2026, 9, 16, 9)).workLog[0].s === 'Completed');
  const doc = buildReport([{ ...done, completedAt: new Date(2026, 9, 16, 9, 0) }, worked], { categories: [], subCategories: [] }, { holidays: [], leaveDays: [] }, day, { headings: true, subFields: true });
  ck('the report has the old sections: Other work completed and Followed up', /Other work completed/.test(doc.text) && /Followed up \/ in progress/.test(doc.text));
  ck('a completed task is written from its notes (the old format)', /Shared with the manager/.test(doc.text));
  const bare = buildReport([{ ...done, notes: '', completedAt: new Date(2026, 9, 16, 9, 0) }], { categories: [] }, {}, day, { headings: true, subFields: false });
  ck('without notes the line is the task itself', /Prepared the monthly MIS/.test(bare.text));
  ck('a bank follow-up carries the banker\'s update', /Banker will share the statement tomorrow/.test(doc.text));
  const plain = buildReport([{ ...done, completedAt: new Date(2026, 9, 16, 9, 0) }], { categories: [] }, {}, day, { headings: false, subFields: false });
  ck('without headings it is plain bullets', !/Other work completed/.test(plain.text) && /^\* /m.test(plain.text));
  const aiOk = mergeAi(doc.model, doc.text);
  ck('a Gemini reply that keeps everything is accepted', !!aiOk.text && !aiOk.error);
  const aiBad = mergeAi(doc.model, 'Nothing here');
  ck('a Gemini reply that drops items is rejected', !!aiBad.error);
  ck('toEntry keeps dates as ISO strings', typeof toEntry({ ...done, completedAt: new Date() }).completedAt === 'string');

  section('New website: report formats per Sub Category (Tally narration sheet)');
  const pay = fromDoc('p', { description: 'Pay ACME', category: 'Payments', status: 'Completed', completedAt: '2026-10-16T09:30:00.000Z', darInclude: true, subCategory: 'Invoice Payment', subCategoryFields: { 'Name of vendor': 'ACME Traders', 'Invoice No': 'INV-4471' } });
  const withFormats = buildReport([{ ...pay, completedAt: new Date(2026, 9, 16, 9, 30) }, { ...done, completedAt: new Date(2026, 9, 16, 9, 0) }], { categories: [] }, {}, day, { headings: true, subFields: false, formats: SAMPLE_FORMATS });
  const paySec = withFormats.model.sections.find((x) => x.key === 'pay');
  ck('a task with a format goes under Payments, written from the format', paySec.rows.length === 1 && /^ACME Traders: - Being amount paid against Invoice No\. INV-4471 towards \[Towards\]\.$/.test(paySec.rows[0].line));
  ck('the standard payment lines come with it', paySec.intro.length >= 1 && /Payments/.test(withFormats.text));
  ck('a field with no value is reported as missing', withFormats.model.missing.length === 1 && withFormats.model.missing[0].marks[0] === 'Towards');
  ck('other tasks stay where they were', /Shared with the manager/.test(withFormats.text));
  const none = buildReport([{ ...pay, completedAt: new Date(2026, 9, 16, 9, 30) }], { categories: [] }, {}, day, { headings: true, subFields: false, formats: [] });
  ck('without formats the task is written as before', !/Being amount paid/.test(none.text));
  const changed = mergeAi(withFormats.model, withFormats.text.replace('Being amount paid', 'Paid'));
  ck('a format line stays word for word even if Gemini changes it', !changed.error && /Being amount paid against Invoice No\. INV-4471/.test(changed.text));

  section('New website: move lines between the Report groups');
  const noDar = { ...done, id: 'n', title: 'Left-out task', notes: '', dar: false, completedAt: new Date(2026, 9, 16, 10) };
  const dupA = { ...done, id: 'd1', title: 'Same job', notes: '', completedAt: new Date(2026, 9, 16, 11) };
  const dupB = { ...done, id: 'd2', title: 'Same job', notes: '', completedAt: new Date(2026, 9, 16, 12) };
  const all = [noDar, dupA, dupB];
  const base = buildReport(all, { categories: [] }, {}, day, { headings: true, subFields: false });
  ck('the groups list what is inside each chip', base.model.groups.out.length === 1 && base.model.groups.dup.length === 1 && base.model.groups.oth.length === 1);
  const mv = buildReport(all, { categories: [] }, {}, day, { headings: true, subFields: false, moves: { n: 'oth', d2: 'fol' } });
  ck('a left-out task moved to Other work is in the report and the count', mv.model.data.others === 2 && mv.model.data.excluded === 0 && /Left-out task/.test(mv.text));
  ck('a merged duplicate moved to Followed up is listed there', mv.model.data.followed === 1 && mv.model.dupes === 0 && /Followed up/.test(mv.text));
  const back = buildReport(all, { categories: [] }, {}, day, { headings: true, subFields: false, moves: { d1: 'out' } });
  ck('a listed task moved to Left out leaves the report', back.model.data.excluded === 2 && back.model.data.others === 0 && back.model.groups.out.some((x) => x.id === 'd1'));
}
