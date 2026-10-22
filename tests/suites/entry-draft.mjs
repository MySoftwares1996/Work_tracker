import fs from 'fs';
import { draftOf, sameAsBlank, applyDraft } from '../../src/entryDraft.js';
import { blankEntry } from '../../src/workingDashboard.js';

export async function run({ ck, section }) {
  section('New entry draft on the phone');
  const blank = blankEntry();
  ck('a blank form has no draft', sameAsBlank({ ...blank, id: 'other', createdAt: 'x' }, blank));
  const typed = { ...blank, title: 'Pay Delta', notes: 'urgent', dueAt: '2026-10-30T10:00:00.000Z' };
  ck('a typed form is a draft', !sameAsBlank(typed, blank));
  const back = applyDraft(blankEntry(), draftOf(typed));
  ck('the draft comes back into a new blank form', back.title === 'Pay Delta' && back.notes === 'urgent' && back.dueAt === typed.dueAt && back.id !== typed.id);
  ck('no draft = the blank form', applyDraft(blank, null) === blank);
  const src = fs.readFileSync('src/screens/WorkingDashboard.js', 'utf8');
  ck('the New entry form has a Reset button, only for a new entry', src.includes('title="Reset" onPress={resetNewEntry}') && src.includes('draftId.current === entrySheet?.id'));
  ck('saving the entry clears the draft', /const commitEntry = \(d\) => \{\s*if \(draftId\.current === d\.id\) \{ draftId\.current = null; clearEntryDraft\(\)/.test(src));
}
