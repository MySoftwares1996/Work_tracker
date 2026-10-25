import { ringingEntries, entryOfAlarm, pastDueEntries, closedOn, postponeDue, withRemark, moveEntry, skipOccurrence, silenceMinutes } from '../../src/pastDue.js';

export async function run({ ck, section }) {
  section('Past Due Alert');
  const now = new Date(2026, 9, 3, 15, 0);
  const at = (d, h, m) => new Date(2026, 9, d, h, m).toISOString();
  const e = (id, dueAt, extra = {}) => ({ id, title: id, dueAt, done: false, binned: false, recurrence: 'none', ...extra });
  const list = pastDueEntries([e('late', at(2, 12, 45)), e('older', at(1, 9, 0)), e('future', at(4, 9, 0)), e('done', at(1, 9, 0), { done: true })], now);
  ck('only open, past-due entries, longest overdue first', list.map((x) => x.id).join() === 'older,late', list.map((x) => x.id).join());

  const hols = [{ title: 'Mahatma Gandhi Jayanti', date: '2026-10-02' }];
  const c = closedOn(e('x', at(2, 12, 45)), hols, []);
  ck('a due date on a holiday names it', c && c.name === 'Mahatma Gandhi Jayanti', JSON.stringify(c));
  ck('...an ordinary day is not closed', closedOn(e('x', at(3, 12, 45)), hols, []) === null);
  ck('...a leave day counts too', closedOn(e('x', at(5, 9, 0)), [], ['2026-10-05'])?.name === 'a leave day');
  // now = Sat 3 Oct, 3 pm: 12:45 today has passed and Sunday is off, so Monday 5 Oct.
  const moved = new Date(postponeDue(e('x', at(2, 12, 45)), hols, [], now));
  ck('postponed to the next working day ahead of now, same time', moved.getDate() === 5 && moved.getHours() === 12 && moved.getMinutes() === 45, moved.toString());
  const morning = new Date(postponeDue(e('x', at(2, 12, 45)), hols, [], new Date(2026, 9, 3, 9, 0)));
  ck('...or later today when that time is still ahead', morning.getDate() === 3 && morning.getHours() === 12, morning.toString());
  const old = new Date(postponeDue(e('x', new Date(2026, 8, 20, 10, 0).toISOString()), [], [], now));
  ck('...an entry two weeks late moves ahead of today, not to a day that has also passed', old >= now && old.getDate() === 5, old.toString());
  const skip = new Date(postponeDue(e('x', at(2, 12, 45)), [...hols, { title: 'Bridge', date: '2026-10-03' }], [], now));
  ck('...skipping a second holiday in the way, and the Sunday after it (4 Oct 2026)', skip.getDate() === 5, skip.toString());

  ck('a remark is added to the notes with its date', withRemark(e('x', at(1, 9, 0), { notes: 'old' }), ' call back ', now).notes === 'old\n[3 Oct] call back');
  ck('a remark counts as a phone edit, so it syncs to the web app', Number(withRemark(e('x', at(1, 9, 0)), 'hi', now).localEditAt) > 0);
  ck('no remark leaves the entry as it was', withRemark(e('x', at(1, 9, 0)), '  ', now).notes === undefined);
  ck('move sets the new due time', moveEntry(e('x', at(1, 9, 0)), at(6, 10, 0), now).dueAt === at(6, 10, 0));

  // The web app's Skip: not a completion. It stays open, is silenced for today and kept out of today's report.
  const r = skipOccurrence(e('m', at(1, 9, 0), { recurrence: 'daily' }), [], now);
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  ck('Skip leaves the entry open and opens nothing new', !r.skipped.done && r.next === null);
  ck('...silenced for today and marked skipped today', r.skipped.lastAckDate === today && r.skipped.deadlineAckDate === today && r.skipped.skippedDates.includes(today) && r.skipped.localEditAt > 0);
  ck('a one-off can be skipped too', skipOccurrence(e('x', at(1, 9, 0)), [], now).skipped.skippedDates.length === 1);

  ck('silence today lasts until tomorrow 09:30', silenceMinutes(now, '09:30') === 18 * 60 + 30);
  ck('...a bad morning time falls back to 09:30', silenceMinutes(now, '25:00') === 18 * 60 + 30);

  section('Past Due Alert shows what rang');
  const rnow = new Date(2026, 9, 6, 15, 0, 20);                 // 15:00:20: the 15:00 alarm has just gone off
  const mk = (id, due, extra = {}) => ({ id, title: id, dueAt: due, done: false, binned: false, recurrence: 'none', ...extra });
  const yest15 = mk('a', new Date(2026, 9, 5, 15, 0).toISOString());     // due yesterday 15:00: its daily reminder is 15:00 today
  const yest15b = mk('b', new Date(2026, 9, 4, 15, 0).toISOString());    // another one due at 15:00, two days ago
  const other = mk('c', new Date(2026, 9, 5, 11, 30).toISOString());     // overdue, but its time is 11:30
  const none = mk('d', new Date(2026, 9, 1, 9, 0).toISOString());        // overdue since long ago, 09:00
  const all = [yest15, yest15b, other, none];
  const got = ringingEntries(all, 'wd:a:daily-1', rnow).map((x) => x.id).sort().join();
  ck('only the tasks whose time it is ring: the one that rang and any other at the same moment', got === 'a,b', got);
  ck('overdue tasks at other times of day stay out', !got.includes('c') && !got.includes('d'));
  ck('the entry behind an alarm id', entryOfAlarm('wd:abc:due') === 'abc' && entryOfAlarm('task-9') === null);
  ck('a snooze alarm shows its own task', ringingEntries(all, 'wd:d:snooze', rnow).some((x) => x.id === 'd'));
  ck('a done task is never shown', !ringingEntries([{ ...yest15, done: true }], 'wd:a:daily-1', rnow).length);

  const silenced = moveEntry(e('s', at(3, 10, 0), { snoozeUntil: 5, lastAckDate: '2026-10-03', deadlineAckDate: '2026-10-03', skippedDates: ['2026-10-03', '2026-10-01'] }), at(3, 18, 0), now);
  ck('Move clears snooze, silence and today\'s skip', !silenced.snoozeUntil && !silenced.lastAckDate && !silenced.deadlineAckDate && silenced.skippedDates.join() === '2026-10-01', JSON.stringify(silenced));
  section('Past Due Alert: Set reminder');
  const pdSrc = (await import('fs')).readFileSync('src/screens/PastDueAlert.js', 'utf8');
  ck('Set reminder saves the date with a fresh edit stamp (so it syncs), books the alert, stops the ring and closes the card', /const setReminder = \(shown\) => \{[\s\S]*nextReminderAt: when\.toISOString\(\)[\s\S]*\.\.\.editedNow\(\)[\s\S]*scheduleEntryAlert\(next[\s\S]*stopAlarmRinging[\s\S]*hide\(e\.id\)/.test(pdSrc) && pdSrc.includes('onPress={() => setReminder(entry)}'));
  ck('it asks for a date still ahead instead of doing nothing', pdSrc.includes('Pick the reminder date and time first') && pdSrc.includes('Pick a time that is still ahead'));
}
