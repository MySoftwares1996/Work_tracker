import { weeklyReview, weekStart, slipReason } from '../../src/weeklyReview.js';

export async function run({ ck, section }) {
  section('Weekly review: slipping, due soon, done this week');
  const now = new Date(2026, 9, 15, 12, 0); // Thursday 15 Oct 2026, so the week began Monday 12 Oct
  const at = (days, h = 10) => new Date(2026, 9, 15 + days, h, 0).toISOString();
  ck('the week starts on Monday', weekStart(now).getDate() === 12 && weekStart(new Date(2026, 9, 18)).getDate() === 12 && weekStart(new Date(2026, 9, 19)).getDate() === 19);
  const entries = [
    { id: 'snz', title: 'Snoozed', dueAt: at(1), snoozeCount: 3 },
    { id: 'old', title: 'Old', dueAt: at(-9), snoozeCount: 0 },
    { id: 'six', title: 'Six days', dueAt: at(-6) },
    { id: 'seven', title: 'Seven days', dueAt: at(-7) },
    { id: 'twice', title: 'Twice', dueAt: at(2), snoozeCount: 2 },
    { id: 'bin', title: 'Binned', dueAt: at(-20), binned: true },
    { id: 'dn', title: 'Done old', dueAt: at(-20), done: true, snoozeCount: 5, completedAt: at(-1) },
    { id: 'wk', title: 'Done Tue', done: true, completedAt: at(-2) },
    { id: 'last', title: 'Done last week', done: true, completedAt: at(-5) },
    { id: 'binDone', title: 'Done then binned', done: true, binned: true, completedAt: at(0, 9) },
    { id: 'in7', title: 'In 7', dueAt: at(7) },
    { id: 'in8', title: 'In 8', dueAt: at(8) },
    { id: 'today', title: 'Later today', dueAt: at(0, 18) },
    { id: 'nodue', title: 'No due' },
  ];
  const r = weeklyReview(entries, now);
  ck('slipping = snoozed 3+ or overdue 7+ days, open, not binned', r.slipping.map((s) => s.entry.id).join() === 'old,seven,snz');
  ck('two snoozes / six days overdue are not slipping', !r.slipping.some((s) => s.entry.id === 'twice' || s.entry.id === 'six'));
  ck('done and binned tasks never slip', !r.slipping.some((s) => s.entry.id === 'dn' || s.entry.id === 'bin'));
  ck('worst first, with the reason', r.slipping[0].daysOverdue === 9 && slipReason(r.slipping[2]) === 'snoozed 3×' && slipReason(r.slipping[0]) === '9 days overdue');
  ck('overdue counts every open late task (old, six, seven)', r.overdue === 3);
  ck('due soon = tomorrow..7 days ahead, soonest first', r.dueSoon.count === 3 && r.dueSoon.first.map((e) => e.id).join() === 'snz,twice,in7');
  ck('done this week counts since Monday, not binned', r.doneThisWeek === 2);
  ck('not empty', r.empty === false);

  const many = Array.from({ length: 9 }, (_, i) => ({ id: 'm' + i, dueAt: at(1 + (i % 6), 8 + i) }));
  const m = weeklyReview(many, now);
  ck('due soon lists the first 5 but counts all', m.dueSoon.count === 9 && m.dueSoon.first.length === 5);

  section('Weekly review: website task shape and empty state');
  const web = [
    { id: 'w1', title: 'W1', due: new Date(2026, 9, 1), hasTime: false, snoozeCount: 0 },
    { id: 'w2', title: 'W2', due: new Date(2026, 9, 15), hasTime: false },
    { id: 'w3', title: 'W3', due: new Date(2026, 9, 16, 9), hasTime: true, snoozeCount: 4 },
    { id: 'w4', title: 'W4', done: true, completedAt: new Date(2026, 9, 14, 9) },
    { id: 'w5', title: 'W5', purged: true, due: new Date(2026, 8, 1), hasTime: false },
  ];
  const w = weeklyReview(web, now, { holidays: [{ date: '2026-10-16' }] });
  ck('Date due / hasTime tasks work', w.slipping.map((s) => s.entry.id).join() === 'w1,w3' && w.overdue === 1);
  ck('a date-only task due today is not yet overdue', !w.slipping.some((s) => s.entry.id === 'w2'));
  ck('web done this week', w.doneThisWeek === 1);
  ck('a due-soon task on a holiday is flagged', w.dueSoon.offDays.join() === 'w3');
  const e = weeklyReview([], now);
  ck('nothing to show is reported as empty', e.empty === true && weeklyReview(null, now).empty === true && e.dueSoon.count === 0);
  ck('work done long ago does not count', weeklyReview([{ id: 'x', done: true, completedAt: at(-30) }], now).empty === true);
}
