import fs from 'fs';
import { checklistOf, toggleStep } from '../../src/checklist.js';

export async function run({ ck, section }) {
  section('web.app: ✓ / DAR opens the task\'s checklist first');
  const src = fs.readFileSync('src/screens/WorkingDashboard.js', 'utf8');
  const act = src.slice(src.indexOf('const act = (shown, kind, opts = {}) => {'));
  ck('on the website and the phone, completing a task with a checklist opens it', /kind === 'complete' && !opts\.checklistOk[\s\S]{0,200}checklistOf\(live\)\.length\) \{ setChecklistSheet\(\{ id: live\.id, opts \}\); return; \}/.test(act));
  ck('...before the DAR notes are asked for', act.indexOf('setChecklistSheet({ id: live.id, opts })') < act.indexOf('setDarNote('));
  ck('the sheet completes with the same choice (✓ or DAR)', src.includes("act(ce, 'complete', { ...o, checklistOk: true })") && src.includes("dar ? 'Done + DAR' : 'Mark done'"));
  ck('ticking a step there saves it on the task', src.includes('checklist: toggleStep(x.checklist, id), ...editedNow()'));
  const e = { checklist: [{ id: 'a', text: 'Invoice', done: false }, { id: 'b', text: ' ', done: false }] };
  ck('blank steps do not count as a checklist', checklistOf(e).length === 1 && checklistOf({}).length === 0);
  ck('a step toggles', toggleStep(e.checklist, 'a')[0].done === true);
}
