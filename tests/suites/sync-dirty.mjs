import { dirtyEntries } from '../../src/firebaseSyncCore.js';
import { completeEntry, reopenEntry, binEntry, toggleEntryDar } from '../../src/workingDashboard.js';
import { moveEntry, withRemark, skipOccurrence } from '../../src/pastDue.js';

export async function run({ ck, section }) {
  section('Realtime Sync: every kind of phone edit is queued for the web app');
  const base = { id: 'e1', title: 'Birthday status', dueAt: new Date(2026, 9, 5, 10, 0).toISOString(), done: false, binned: false, recurrence: 'none', src: 'cloud', updatedAt: new Date(2026, 9, 1).toISOString() };
  const ack = { e1: new Date(base.updatedAt).getTime() };
  ck('an untouched entry from the web app is not sent back', dirtyEntries([base], ack).length === 0);
  const now = new Date(2026, 9, 4, 12, 0);
  const edits = {
    'Mark done': completeEntry(base, now),
    'reopen': reopenEntry(completeEntry(base, now), now),
    'bin': binEntry(base, now),
    'daily report': toggleEntryDar(base, now),
    'move / postpone': moveEntry(base, new Date(2026, 9, 7, 9, 0).toISOString(), now),
    'a remark': withRemark(base, 'called', now),
    'skip': skipOccurrence({ ...base, recurrence: 'daily' }, [], now).skipped,
  };
  for (const [name, e] of Object.entries(edits)) ck(`${name}: queued to be sent`, dirtyEntries([e], ack).length === 1, JSON.stringify({ l: e.localEditAt, u: e.updatedAt }));
  ck('...and once sent it is not sent again', dirtyEntries([edits['Mark done']], { e1: new Date(edits['Mark done'].updatedAt).getTime() }).length === 0);
}
