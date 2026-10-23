import { buildReport, toEntry, mergeAi } from '../../newweb/src/reportEngine.js';
import { fromDoc, addFollowUp, logWork, toDoc } from '../../newweb/src/data.js';
import { SAMPLE_FORMATS } from '../../newweb/src/reportFormats.js';

export async function run({ ck, section }) {
  section('New website: the Daily Report uses the phone app\'s report engine');
  const day = '2026-10-16';
  const done = fromDoc('a', { description: 'Prepared the monthly MIS', category: 'Reports', status: 'Completed', completedAt: '2026-10-16T09:00:00.000Z', darInclude: true, notes: 'Shared with the manager' });
  const bank = fromDoc('b', { description: 'Bank A FD Statement Collation.', category: "Bank Follow-up's", status: 'Pending', subCategory: "Urgent Bank Follow Up's", subCategoryFields: { "Banker's Reply's:": 'Need to collect on an urgent basis' } });
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
  const pay = fromDoc('p', { description: 'Pay ACME', category: 'Payments', status: 'Completed', completedAt: '2026-10-16T09:30:00.000Z', darInclude: true, subCategory: 'Invoice Payment', subCategoryFields: { 'Name of vendor': 'Vendor D', 'Invoice No': 'INV-4471' } });
  const withFormats = buildReport([{ ...pay, completedAt: new Date(2026, 9, 16, 9, 30) }, { ...done, completedAt: new Date(2026, 9, 16, 9, 0) }], { categories: [] }, {}, day, { headings: true, subFields: false, formats: SAMPLE_FORMATS });
  const paySec = withFormats.model.sections.find((x) => x.key === 'pay');
  ck('a task with a format goes under Payments, written from the format', paySec.rows.length === 1 && /^Vendor D: - Being amount paid against Invoice No\. INV-4471 towards \[Towards\]\.$/.test(paySec.rows[0].line));
  ck('no fixed lines: Payments has none unless report points are ticked on the task', paySec.intro.length === 0 && /Payments/.test(withFormats.text));
  const ticked = buildReport([{ ...pay, reportPoints: ['Checked the party statement.'], completedAt: new Date(2026, 9, 16, 9, 30) }], { categories: [] }, {}, day, { headings: true, subFields: false, formats: SAMPLE_FORMATS });
  ck('a ticked report point is the Payments intro', ticked.model.sections.find((x) => x.key === 'pay').intro.join() === 'Checked the party statement.' && /Checked the party statement\./.test(ticked.text));
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

  section('New website: a Demand Draft task is written from its format and stays in Other work');
  const dd = fromDoc('dd', { description: 'Prepare DD', category: 'Demand Draft', status: 'Completed', completedAt: '2026-10-16T09:30:00.000Z', darInclude: true, subCategory: 'Online', subCategoryFields: { 'Payee Name': 'High Court', 'DD No': '1', Amount: '5,000', 'Case No': 'C1' } });
  const ddRep = buildReport([{ ...dd, completedAt: new Date(2026, 9, 16, 9, 30) }], { categories: [] }, {}, day, { headings: true, subFields: false, formats: SAMPLE_FORMATS });
  ck('the Demand Draft line is written from its format', /^Prepared Online Demand Draft application forms/m.test(ddRep.model.sections.find((x) => x.key === 'oth').rows[0].line));
  ck('and it is not moved under Payments', ddRep.model.data.payments === 0 && ddRep.model.data.others === 1);

  section('New website: remarks written in the Notes follow every payment line');
  const noted = { ...pay, notes: 'Remarks: paid after the manager approved it', completedAt: new Date(2026, 9, 16, 9, 30) };
  const withNote = buildReport([noted], { categories: [] }, {}, day, { headings: true, subFields: false, formats: SAMPLE_FORMATS });
  ck('a formatted payment line ends with the Notes', /INV-4471 towards \[Towards\]\. Paid after the manager approved it\.$/m.test(withNote.model.sections.find((x) => x.key === 'pay').rows[0].line));
  const noNote = buildReport([{ ...noted, notes: '' }], { categories: [] }, {}, day, { headings: true, subFields: false, formats: SAMPLE_FORMATS });
  ck('without Notes the line is only the format', /towards \[Towards\]\.$/m.test(noNote.model.sections.find((x) => x.key === 'pay').rows[0].line));
  const plainPay = buildReport([{ ...noted, subCategory: '' }], { categories: [] }, {}, day, { headings: true, subFields: false, formats: [] });
  ck('a payment with no format also carries its Notes', /Paid after the manager approved it/.test(plainPay.text));

  const probe = (notes) => buildReport([{ ...pay, notes, completedAt: new Date(2026, 9, 16, 9, 30) }], { categories: [] }, {}, day, { headings: true, subFields: false, formats: SAMPLE_FORMATS }).model.sections.find((x) => x.key === 'pay').rows[0].line;
  ck('a short remark that is a word of the line is still added', /\[Towards\]\. Paid\.$/.test(probe('Paid')));
  ck('several remarks are all added, stamps removed', /\. Payment approved by CFO\. Urgent\.$/.test(probe('[16 Oct 2026] Payment approved by CFO\nUrgent')));
  ck('a remark the line already says in full is not repeated', !/Invoice No\. INV-4471 towards \[Towards\]\. .*Invoice No\. INV-4471/.test(probe('Being amount paid against Invoice No. INV-4471')));

}
