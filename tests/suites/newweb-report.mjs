import { buildReport, toEntry, mergeAi } from '../../newweb/src/reportEngine.js';
import { fromDoc, addFollowUp, logWork, toDoc } from '../../newweb/src/data.js';

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
}
