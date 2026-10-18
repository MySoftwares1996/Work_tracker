import {
  blankEntry, dashboardStats, groupCounts, filterEntries, isWdFilterActive, sortEntries,
  completeEntry, reopenEntry, binEntry, restoreEntry, toggleEntryDar, isOpen,
  nextWorkingDay, holidaysWithinDays,
  nextFreeSlot, reminderTimesForToday, reminderTimesAhead, nextRecurringEntry, recurrenceLabel, RECURRENCES,
  normalizeCalendar, normalizeHolidays, holidayDateKey, completedTime, withCompletedAt,
} from '../../src/workingDashboard.js';

export async function run({ ck, section }) {
  const now = new Date(2026, 9, 3, 10, 0); // Sat 3 Oct 2026, 10:00
  const e = (patch) => ({ ...blankEntry(), ...patch });

  section('Working Dashboard: an entry\'s open/closed state');
  ck('a fresh entry is open', isOpen(e({})));
  ck('a done entry is not open', !isOpen(e({ done: true })));
  ck('a binned entry is not open', !isOpen(e({ binned: true })));

  section('Working Dashboard: dashboard stat tiles');
  const entries = [
    e({ id: '1', title: 'Overdue one', dueAt: new Date(2026, 9, 1).toISOString(), status: 'In-Progress' }),      // overdue, this month
    e({ id: '2', title: 'Due today', dueAt: new Date(2026, 9, 3, 18, 0).toISOString(), status: 'In-Progress' }), // due today, this month
    e({ id: '3', title: 'Next week', dueAt: new Date(2026, 9, 8).toISOString(), status: 'Not Yet Started' }),    // next 7 days, this month
    e({ id: '4', title: 'Later this month', dueAt: new Date(2026, 9, 25).toISOString(), status: 'Pending' }),    // this month
    e({ id: '5', title: 'No date', dueAt: null, status: 'Pending' }),                                            // no due date, pending
    e({ id: '6', title: 'Already done', dueAt: new Date(2026, 9, 1).toISOString(), done: true }),  // excluded: closed
    e({ id: '7', title: 'In the bin', dueAt: new Date(2026, 9, 1).toISOString(), binned: true }),  // excluded: closed
  ];
  const stats = dashboardStats(entries, now);
  ck('overdue counts only past-due open entries', stats.overdue === 1);
  ck('due today counts only today', stats.dueToday === 1);
  ck('pending as on today is overdue + due today', stats.pendingAsOnToday === 2);
  const todayMix = dashboardStats([
    e({ id: 'a', dueAt: new Date(2026, 9, 3, 8, 0).toISOString() }),   // today at 8:00, time passed -> overdue (web app)
    e({ id: 'b', dueAt: new Date(2026, 9, 3, 20, 0).toISOString() }),  // today, still ahead -> due today
    e({ id: 'c', dueAt: new Date(2026, 9, 3, 0, 0).toISOString() }),   // today, date only -> due today all day
  ], now);
  ck('like the web app: a timed entry is overdue once its time passes, a date-only one stays due today all day', todayMix.overdue === 1 && todayMix.dueToday === 2 && todayMix.pendingAsOnToday === 3);
  ck('it becomes overdue the next day', dashboardStats([e({ dueAt: new Date(2026, 9, 2, 23, 0).toISOString() })], now).overdue === 1);
  ck('next 7 days excludes today and overdue', stats.next7Days === 1);
  ck('this month counts every open entry due in October, overdue included', stats.thisMonth === 4);
  ck('no due date counts only open, undated entries', stats.noDueDate === 1);
  ck('pending counts entries with Pending status', stats.pending === 2);
  ck('done and binned entries never count toward any tile', stats.totalOpen === 5);

  section('Working Dashboard: group counts for the By X breakdowns');
  const cat = [e({ category: 'Payments' }), e({ category: 'Payments' }), e({ category: 'MIS' }), e({ category: null })];
  const counts = groupCounts(cat, (x) => x.category);
  ck('groups are counted and sorted busiest first', counts[0].label === 'Payments' && counts[0].count === 2);
  ck('a missing value falls back to Uncategorised', counts.some((c) => c.label === 'Uncategorised'));

  section('Working Dashboard: Register filters');
  const pool = [
    e({ title: 'Send GST mail', category: 'Daily Work', priority: 'High', status: 'In-Progress', pendingWith: 'Self' }),
    e({ title: 'BRS statement', category: 'Monthly Activity', priority: 'Medium', status: 'Pending', pendingWith: 'Rami' }),
  ];
  ck('no filter is not active', !isWdFilterActive({}));
  ck('a category filter is active', isWdFilterActive({ category: 'MIS' }));
  ck('text search matches the title', filterEntries(pool, { query: 'gst' }).length === 1);
  ck('text search also matches the reference', filterEntries([e({ title: 'x', reference: 'Ticket #555' })], { query: '555' }).length === 1);
  ck('category filter narrows correctly', filterEntries(pool, { category: 'MIS' }).length === 0 && filterEntries(pool, { category: 'Daily Work' }).length === 1);
  ck('priority filter narrows correctly', filterEntries(pool, { priority: 'High' }).length === 1);
  ck('due-within Overdue uses the real overdue rule', filterEntries(entries, { dueWithin: 'Overdue' }, now).length === 1);

  section('Working Dashboard: sorting');
  const sortPool = [
    e({ title: 'Zebra', dueAt: new Date(2026, 9, 10).toISOString() }),
    e({ title: 'Apple', dueAt: null }),
    e({ title: 'Mango', dueAt: new Date(2026, 9, 5).toISOString() }),
  ];
  ck('dueAsc sorts undated entries last, not first', sortEntries(sortPool, 'dueAsc').at(-1).title === 'Apple');
  ck('dueAsc otherwise sorts earliest first', sortEntries(sortPool, 'dueAsc')[0].title === 'Mango');
  const sameDay = [
    { title: 'Cash Voucher Pending', dueAt: new Date(2026, 8, 21).toISOString() },
    { title: 'Monthly BRS', dueAt: new Date(2026, 8, 21, 12, 3).toISOString() },
    { title: 'Next day', dueAt: new Date(2026, 8, 22, 9).toISOString() },
  ];
  ck('a date with no time sorts after that day\'s timed entries, as on the web app', sortEntries(sameDay, 'dueAsc').map((e) => e.title).join() === 'Monthly BRS,Cash Voucher Pending,Next day');
  ck('title sort is alphabetical', sortEntries(sortPool, 'title').map((x) => x.title).join(',') === 'Apple,Mango,Zebra');
  const prioPool = [e({ title: 'a', priority: 'Low' }), e({ title: 'b', priority: 'High' }), e({ title: 'c', priority: 'Medium' })];
  ck('priority sort is High, Medium, Low', sortEntries(prioPool, 'priority').map((x) => x.priority).join(',') === 'High,Medium,Low');

  section('Working Dashboard: card actions');
  const fresh = e({});
  const done = completeEntry(fresh, now);
  ck('completing sets done and a timestamp', done.done === true && done.completedAt === now.toISOString());
  ck('reopening clears both', reopenEntry(done).done === false && reopenEntry(done).completedAt === null);
  const binned = binEntry(fresh, now);
  ck('binning sets binned and a timestamp', binned.binned === true && !!binned.binnedAt);
  ck('restoring clears both', restoreEntry(binned).binned === false && restoreEntry(binned).binnedAt === null);
  ck('completing also clears any bin state (un-bins)', completeEntry(binned, now).binned === false);

  section('Working Dashboard: holidays');
  const holidays = [
    { id: 'h1', title: 'Gandhi Jayanti', date: '2026-10-02', endDate: '2026-10-02' },
    { id: 'h2', title: 'Diwali break', date: '2026-11-08', endDate: '2026-11-10' }, // 3-day continuous
  ];
  ck('next working day skips a single-day holiday', nextWorkingDay('2026-10-01', holidays) === '2026-10-03');
  ck('next working day skips every day of a continuous holiday', nextWorkingDay('2026-11-07', holidays) === '2026-11-11');
  ck('next working day also skips a marked leave day', nextWorkingDay('2026-10-01', [], ['2026-10-02']) === '2026-10-03');
  const upcoming = holidaysWithinDays(holidays, new Date(2026, 9, 1), 7);
  ck('holidays within N days finds the one in range', upcoming.length === 1 && upcoming[0].id === 'h1');

  section('Working Dashboard: time-slot conflicts');
  const busy = [e({ id: 'b1', dueAt: new Date(2026, 9, 3, 11, 15).toISOString() })];
  ck('a time inside the hold window is pushed to the next free slot', nextFreeSlot(new Date(2026, 9, 3, 11, 20).toISOString(), busy, 10) === new Date(2026, 9, 3, 11, 25).toISOString());
  ck('a time outside the hold window is left alone', nextFreeSlot(new Date(2026, 9, 3, 12, 0).toISOString(), busy, 10) === null);
  ck('the entry being edited does not conflict with itself', nextFreeSlot(new Date(2026, 9, 3, 11, 15).toISOString(), busy, 10, 'b1') === null);
  ck('no due date at all needs no check', nextFreeSlot(null, busy, 10) === null);
  ck('a closed entry never holds the clock', nextFreeSlot(new Date(2026, 9, 3, 11, 15).toISOString(), [e({ dueAt: new Date(2026, 9, 3, 11, 15).toISOString(), done: true })], 10) === null);

  section('Working Dashboard: walk/water reminder times');
  const nowMid = new Date(2026, 9, 3, 12, 0); // 12:00 noon
  const reminder = { enabled: true, start: '11:00', end: '13:00', everyMin: 60 };
  const times = reminderTimesForToday(reminder, nowMid);
  ck('only times still ahead of now are returned (11:00 already passed)', times.length === 1 && times[0].getHours() === 13);
  ck('a disabled reminder returns nothing', reminderTimesForToday({ ...reminder, enabled: false }, nowMid).length === 0);
  ck('a reminder entirely in the past today returns nothing', reminderTimesForToday({ enabled: true, start: '08:00', end: '09:00', everyMin: 30 }, nowMid).length === 0);

  section('Working Dashboard: alerts keep coming');
  const nowA = new Date(2026, 9, 3, 20, 0);
  const wr = { enabled: true, start: '09:00', end: '10:00', everyMin: 30 };
  ck('reminders are booked for the next days too, not just today', reminderTimesAhead(wr, nowA, 3).length === 6);
  section('Working Dashboard: hourly and custom-minute recurrence');
  const rNow = new Date(2026, 9, 3, 10, 0);
  const rBase = { id: 'r1', title: 'Check mail', recurrence: 'hourly', dueAt: new Date(2026, 9, 3, 9, 30).toISOString(), deadlineAt: new Date(2026, 9, 3, 11, 30).toISOString(), status: 'In-Progress', dar: true, done: false, binned: false };
  ck('hourly and custom are offered', RECURRENCES.includes('hourly') && RECURRENCES.includes('custom'));
  const nx = nextRecurringEntry(rBase, [rBase], rNow);
  ck('completing an hourly entry opens the next hour', nx && nx.id !== 'r1' && new Date(nx.dueAt).getTime() === new Date(2026, 9, 3, 10, 30).getTime() && nx.status === 'Not Yet Started' && !nx.done && nx.dar === true && nx.seriesId === 'r1');
  const answered = nextRecurringEntry({ ...rBase, snoozeUntil: rNow.getTime() + 600000, lastAckDate: '2026-10-03', deadlineAckDate: '2026-10-03' }, [], rNow);
  ck('the next occurrence does not inherit the snooze or "silence today"', answered.snoozeUntil === null && answered.lastAckDate === null && answered.deadlineAckDate === null);
  ck('the deadline moves by the same gap', new Date(nx.deadlineAt).getTime() === new Date(2026, 9, 3, 12, 30).getTime());
  const cx = nextRecurringEntry({ ...rBase, recurrence: 'custom', recurrenceEveryMin: 20 }, [], rNow);
  ck('custom minutes steps by the chosen gap', cx && new Date(cx.dueAt).getTime() === new Date(2026, 9, 3, 10, 10).getTime());
  ck('custom without minutes does not repeat', nextRecurringEntry({ ...rBase, recurrence: 'custom' }, [], rNow) === null);
  ck('a one-off does not repeat', nextRecurringEntry({ ...rBase, recurrence: 'none' }, [], rNow) === null);
  ck('daily and monthly still roll (a Daily task skips Sunday 4 Oct, as on the web app)', new Date(nextRecurringEntry({ ...rBase, recurrence: 'daily' }, [], rNow).dueAt).getDate() === 5 && new Date(nextRecurringEntry({ ...rBase, recurrence: 'monthly' }, [], rNow).dueAt).getMonth() === 10);
  ck('an occurrence already on the register is not duplicated', nextRecurringEntry(rBase, [rBase, { ...rBase, id: 'r2', dueAt: nx.dueAt }], rNow) === null);
  ck('labels read naturally', recurrenceLabel({ recurrence: 'hourly' }) === 'Every hour' && recurrenceLabel({ recurrence: 'custom', recurrenceEveryMin: 45 }) === 'Every 45 min' && recurrenceLabel({ recurrence: 'custom', recurrenceEveryMin: 120 }) === 'Every 2 h' && recurrenceLabel({ recurrence: 'none' }) === "Doesn't repeat");

  section('Working Dashboard: every change is stamped so Realtime Sync sends it');
  const t0 = new Date(2026, 9, 3, 9, 0);
  const base0 = { ...fresh, updatedAt: new Date(2020, 0, 1).toISOString() };
  const later = new Date(2026, 9, 3, 10, 0);
  ck('complete, reopen, bin, restore and DAR each move updatedAt forward', [
    completeEntry(base0, later), reopenEntry(base0, later), binEntry(base0, later), restoreEntry(base0, later), toggleEntryDar(base0, later),
  ].every((e) => e.updatedAt === later.toISOString()));
  ck('DAR toggles back and forth', toggleEntryDar(toggleEntryDar(base0, later), later).dar === base0.dar);

  section('Holidays: whatever shape the web app stored is read');
  ck('ISO, dd/mm/yyyy, timestamp and Excel serial all become the same local day', [
    holidayDateKey('2026-10-02'), holidayDateKey('02/10/2026'), holidayDateKey('2026-10-02T00:00:00'),
    holidayDateKey({ seconds: new Date(2026, 9, 2, 12).getTime() / 1000 }), holidayDateKey(46297),
  ].every((k) => k === '2026-10-02'));
  ck('garbage is rejected', holidayDateKey('not a date') === '' && holidayDateKey(null) === '');
  const cal = normalizeCalendar([[{ name: 'Gandhi Jayanti', date: '02/10/2026' }, { title: 'Diwali', start: '2026-11-08', end: '2026-11-10', type: 'Company' }, { title: 'bad' }], ['2026-10-05', { date: '2026-10-06' }]]);
  ck('web array shape: names and ranges read, unreadable row dropped', cal.holidays.length === 2 && cal.holidays[0].title === 'Gandhi Jayanti' && cal.holidays[1].endDate === '2026-11-10' && cal.holidays[1].tag === 'Company');
  ck('leave days normalised', cal.leaveDays.join() === '2026-10-05,2026-10-06');
  const obj = normalizeCalendar({ holidays: ['2026-12-25'], leave: ['2026-12-26'] });
  ck('object shape and bare date strings', obj.holidays[0].date === '2026-12-25' && obj.leaveDays[0] === '2026-12-26');
  ck('a bare holidays array and empty input', normalizeCalendar([{ date: '2026-01-26', title: 'R' }]).holidays.length === 1 && normalizeCalendar(undefined).holidays.length === 0);
  ck('duplicates collapse', normalizeHolidays([{ date: '2026-01-26', title: 'R' }, { date: '2026-01-26', title: 'r' }]).length === 1);
  ck('next working day skips a holiday range and leave', nextWorkingDay('2026-11-07', normalizeHolidays([{ title: 'D', date: '2026-11-08', endDate: '2026-11-10' }]), ['2026-11-11']) === '2026-11-12');
  ck('a multi-day holiday already under way still shows in the next 7 days', holidaysWithinDays(normalizeHolidays([{ title: 'D', date: '2026-10-01', endDate: '2026-10-05' }]), now, 7).length === 1);

  section('Completed: real completion time and order');
  const c1 = e({ id: 'c1', done: true, completedAt: new Date(2026, 9, 3, 16, 12).toISOString() });
  const c2 = e({ id: 'c2', done: true, completedOn: new Date(2026, 9, 3, 9, 5).toISOString() });       // web-style field name
  const c3 = e({ id: 'c3', done: true, completedAt: '1970-01-01T00:00:00.000Z' });                        // placeholder = unknown
  const c4 = e({ id: 'c4', done: true, doneAt: { seconds: new Date(2026, 9, 2, 18, 0).getTime() / 1000 } }); // Firestore timestamp
  ck('completion time read from completedAt, completedOn and a Firestore timestamp', completedTime(c1) > 0 && completedTime(c2) > 0 && completedTime(c4) > 0);
  ck('a 1970 placeholder is not a completion time', completedTime(c3) === 0);
  ck('newest first, unknown last', sortEntries([c3, c2, c4, c1], 'completedDesc').map((x) => x.id).join() === 'c1,c2,c4,c3');
  ck('oldest first, unknown still last', sortEntries([c3, c1, c2, c4], 'completedAsc').map((x) => x.id).join() === 'c4,c2,c1,c3');
  ck('withCompletedAt copies the web field into completedAt', withCompletedAt(c2).completedAt === c2.completedOn);
  ck('completing stamps the real time', completeEntry(e({}), now).completedAt === now.toISOString());
}

export async function runExtra({ ck, section }) {
  const { DUE_TILL_TODAY, dashboardStats: stats } = await import('../../src/workingDashboard.js');
  const now = new Date(2026, 9, 3, 10, 0);
  const e = (patch) => ({ ...blankEntry(), ...patch });

  section('Working Dashboard: a suggested free slot is really free');
  const at = (h, m) => new Date(2026, 9, 3, h, m).toISOString();
  const row = [e({ id: 'a', dueAt: at(10, 0) }), e({ id: 'b', dueAt: at(10, 15) })];
  ck('a slot after one clash that hits the next entry moves on past it', nextFreeSlot(at(10, 5), row, 10) === at(10, 25));
  const packed = [e({ id: 'p1', dueAt: at(9, 0) }), e({ id: 'p2', dueAt: at(9, 10) }), e({ id: 'p3', dueAt: at(9, 20) })];
  ck('a packed run is skipped as a whole', nextFreeSlot(at(9, 2), packed, 10) === at(9, 30));

  section('Working Dashboard: tiles and counts open the list they counted');
  const pool = [
    e({ id: 'o', dueAt: new Date(2026, 9, 1, 9).toISOString() }),           // overdue
    e({ id: 't', dueAt: new Date(2026, 9, 3, 18).toISOString() }),          // due today
    e({ id: 'n', dueAt: new Date(2026, 9, 6, 9).toISOString() }),           // later
  ];
  ck('"Pending as on Today" lists overdue + due today, the same number the tile shows',
    filterEntries(pool, { dueWithin: DUE_TILL_TODAY }, now).length === stats(pool, now).pendingAsOnToday && stats(pool, now).pendingAsOnToday === 2);
  const people = [e({ id: 'x', pendingWith: null }), e({ id: 'y', pendingWith: 'Bank' }), e({ id: 'z', category: null }), e({ id: 'w', category: 'MIS' })];
  const unassigned = groupCounts(people, (x) => x.pendingWith, 'Unassigned').find((r) => r.label === 'Unassigned');
  ck('the Unassigned row filters to the entries with nobody set', filterEntries(people, { pendingWith: 'Unassigned' }).length === unassigned.count && unassigned.count === 3);
  const uncategorised = groupCounts(people, (x) => x.category).find((r) => r.label === 'Uncategorised');
  ck('the Uncategorised row filters to the entries with no category', filterEntries(people, { category: 'Uncategorised' }).length === uncategorised.count && uncategorised.count === 3);

  await runExtra2({ ck, section });
}

export async function runExtra2({ ck, section }) {
  section('Working Dashboard: completing and reopening keep the status in step (the web app reads "Completed" as done)');
  const open = { ...blankEntry(), status: 'In-Progress' };
  const done = completeEntry(open);
  ck('completing sets status Completed', done.status === 'Completed' && done.done === true);
  ck('reopening a Completed entry makes it Pending', reopenEntry(done).status === 'Pending' && reopenEntry(done).done === false);
  ck('reopening keeps any other status', reopenEntry({ ...done, status: 'In-Progress' }).status === 'In-Progress');

  section('Working Dashboard: a month-end entry stays at month end');
  const jan31 = { ...blankEntry(), title: 'Month-end recon', recurrence: 'monthly', dueAt: new Date(2027, 0, 31, 17, 0).toISOString() };
  const feb = nextRecurringEntry(jan31, [], new Date(2027, 0, 31, 18, 0));
  ck('31 Jan rolls to 28 Feb', new Date(feb.dueAt).getMonth() === 1 && new Date(feb.dueAt).getDate() === 28);
  const mar = nextRecurringEntry(feb, [], new Date(2027, 1, 28, 18, 0));
  // Rolled on from the 28th by that date alone, it stayed on the 28th every month after.
  ck('...and 28 Feb rolls back to 31 Mar, not 28 Mar', new Date(mar.dueAt).getMonth() === 2 && new Date(mar.dueAt).getDate() === 31, mar.dueAt);
  const apr = nextRecurringEntry(mar, [], new Date(2027, 2, 31, 18, 0));
  ck('...then 30 Apr', new Date(apr.dueAt).getMonth() === 3 && new Date(apr.dueAt).getDate() === 30);
  const moved = { ...apr, dueAt: new Date(2027, 3, 15, 17, 0).toISOString() };
  const may = nextRecurringEntry(moved, [], new Date(2027, 3, 15, 18, 0));
  ck('moved by hand to the 15th, it repeats on the 15th', new Date(may.dueAt).getDate() === 15 && may.monthDay === 15);

  section('Working Dashboard: a range with a mistyped end year cannot freeze the screen');
  const t0 = Date.now();
  const leave = normalizeCalendar([[], [{ date: '2026-10-05', endDate: '9999-12-31' }]]).leaveDays;
  const back = nextWorkingDay('2026-12-24', normalizeHolidays([{ title: 'Typo', date: '2026-12-25', endDate: '9999-12-25' }]), []);
  ck('read in well under a second', Date.now() - t0 < 1000, `${Date.now() - t0} ms`);
  ck('...the leave still starts on its first day', leave[0] === '2026-10-05' && leave.length <= 400, `${leave.length} days`);
  ck('...and "back to work" is still a real date', /^\d{4}-\d{2}-\d{2}$/.test(back) && back > '2026-12-25', back);

  section('Working Dashboard alerts: warnings before due and deadline, with the app closed');
  {
    const { entryAlertPlan } = await import('../../src/workingDashboard.js');
    const now = new Date(2026, 9, 5, 8, 0);
    const dateOnlyForDaily = () => ({ id: 'dd2', title: 'File GST', dueAt: new Date(2026, 9, 4).toISOString() });
    const keys = (e, cfg) => entryAlertPlan(e, now, cfg).map((x) => x.key).filter((k) => !k.startsWith('daily-')).join();
    const timed = { id: 't', title: 'Pay vendor', priority: 'High', dueAt: new Date(2026, 9, 5, 14, 0).toISOString() };
    ck('a timed due: 1 hr and 15 min warnings, the alarm, then follow-ups', keys(timed) === 'due-60,due-15,due,nag-10,nag-30,nag-60,nag-120,nag-240');
    ck('the due moment and the follow-ups ring as alarms; the warnings do not', entryAlertPlan(timed, now).filter((x) => x.alarm && !x.key.startsWith('daily-')).map((x) => x.key).join() === 'due,nag-10,nag-30,nag-60,nag-120,nag-240');
    ck('...even with the old "warnings ring too" setting on', entryAlertPlan(timed, now, { warningsRing: true }).filter((x) => x.alarm && !x.key.startsWith('daily-')).map((x) => x.key).join() === 'due,nag-10,nag-30,nag-60,nag-120,nag-240');
    ck('the warning says how long and when', entryAlertPlan(timed, now)[0].title.startsWith('Due in 1 hr'));
    const daily = entryAlertPlan(timed, new Date(2026, 9, 6, 8, 0)).filter((x) => x.key.startsWith('daily-'));
    ck('still open the next day: rings again at the same time every day (14:00)', daily.length === 3 && daily.every((x) => x.at.getHours() === 14 && x.at.getMinutes() === 0 && x.alarm) && daily[0].at.getDate() === 6, daily.map((x) => x.at.getDate()).join());
    ck('...each reminder names the task and says when it was due', /Still overdue: Pay vendor/.test(daily[0].title) && /Was due/.test(daily[0].body));
    ck('...a date-only entry rings at the morning time each day', entryAlertPlan(dateOnlyForDaily(), now).filter((x) => x.key.startsWith('daily-')).every((x) => x.at.getHours() === 9 && x.at.getMinutes() === 30));
    ck('...off with "keep reminding after the due time"', !entryAlertPlan(timed, now, { followUps: false }).some((x) => x.key.startsWith('daily-')));
    ck('warnings already past are skipped', entryAlertPlan(timed, new Date(2026, 9, 5, 13, 50)).map((x) => x.key)[0] === 'due');
    ck('chosen warning times are used', keys(timed, { dueLeadMin: [1440, 30] }).startsWith('due-30,due,') && keys({ ...timed, dueAt: new Date(2026, 9, 6, 14, 0).toISOString() }, { dueLeadMin: [1440] }).startsWith('due-1440,due,'));
    ck('full-screen off: the due alert is a plain one', !entryAlertPlan(timed, now, { fullScreen: false }).some((x) => x.alarm));
    const dateOnly = { id: 'd', title: 'File GST', dueAt: new Date(2026, 9, 6).toISOString() };
    const dPlan = entryAlertPlan(dateOnly, now);
    ck('a date-only due alerts once: 7 PM on its date (alarm), no evening before, no next morning, no daily reminders', dPlan.map((x) => x.key).join() === 'due-day'
      && dPlan[0].at.getHours() === 19 && dPlan[0].at.getMinutes() === 0 && dPlan[0].at.getDate() === 6 && dPlan[0].alarm);
    const rem = { id: 'r', title: 'Chase bank', nextReminderAt: new Date(2026, 9, 6, 15, 30).toISOString() };
    const rPlan = entryAlertPlan(rem, now);
    ck('a next reminder alerts once, at its time', rPlan.length === 1 && rPlan[0].key === 'reminder' && rPlan[0].at.getHours() === 15 && rPlan[0].at.getMinutes() === 30);
    const dl = { id: 'l', title: 'Submit audit', deadlineAt: new Date(2026, 9, 7, 17, 0).toISOString() };
    ck('a deadline: 1 day, 2 hr and 30 min before, then an alarm at it', keys(dl) === 'dl-1440,dl-120,dl-30,dl' && entryAlertPlan(dl, now).at(-1).alarm);
    ck('deadline warnings can be turned off', keys(dl, { deadline: false }) === '');
    ck('a date-only deadline: the evening before and the morning of', keys({ id: 'l2', deadlineAt: new Date(2026, 9, 7).toISOString() }) === 'dl-eve,dl-day');
    ck('a done or binned entry gives no alerts', !entryAlertPlan({ ...timed, done: true }, now).length && !entryAlertPlan({ ...timed, binned: true }, now).length);
    const same = { ...timed, deadlineAt: timed.dueAt };
    ck('a deadline at the due time rings once', entryAlertPlan(same, now).filter((x) => x.at.getTime() === new Date(timed.dueAt).getTime()).length === 1);
  }

  {
    section('Working Dashboard: Alarm or Reminder, per task');
    const { alertModeOf, ALERT_MODES, entryAlertPlan, blankEntry } = await import('../../src/workingDashboard.js');
    const { fromWebDocOver, toWebTask } = await import('../../src/cloudSync.js');
    const now = new Date(2026, 9, 5, 9, 0);
    const base = { id: 'a1', title: 'Pay vendor', dueAt: new Date(2026, 9, 5, 15, 0).toISOString(), done: false, binned: false };
    const alarm = entryAlertPlan({ ...base, alertMode: 'alarm' }, now);
    const gentle = entryAlertPlan({ ...base, alertMode: 'gentle' }, now);
    ck('an Alarm task rings at the due time', alarm.some((x) => x.key === 'due' && x.alarm));
    ck('...and nags again while it stays pending', alarm.some((x) => x.key.startsWith('nag-') && x.alarm));
    ck('a Reminder task never rings an alarm', gentle.length > 0 && gentle.every((x) => !x.alarm));
    ck('...and has no repeated "still pending" nags', !gentle.some((x) => x.key.startsWith('nag-')));
    ck('...but still notifies at the due time', gentle.some((x) => x.key === 'due'));
    ck('a task without a choice follows Config (full-screen on: Alarm; off: Reminder)', alertModeOf(base) === 'alarm' && alertModeOf(base, { fullScreen: false }) === 'gentle');
    ck('a task\'s own choice wins over Config', alertModeOf({ alertMode: 'alarm' }, { fullScreen: false }) === 'alarm');
    const rule = { fullScreen: true, alarmPriorities: ['High'] };
    ck('Config by priority: a High task from the web app rings, a Medium one is a reminder', alertModeOf({ priority: 'High' }, rule) === 'alarm' && alertModeOf({ priority: 'Medium' }, rule) === 'gentle');
    ck('...matched whatever the case', alertModeOf({ priority: 'high ' }, rule) === 'alarm');
    ck('...an empty list makes every task a reminder; no list, every task an alarm', alertModeOf({ priority: 'High' }, { alarmPriorities: [] }) === 'gentle' && alertModeOf({ priority: 'Low' }, { alarmPriorities: null }) === 'alarm');
    ck('...and a task switched on the phone keeps its own choice', alertModeOf({ priority: 'Medium', alertMode: 'alarm' }, rule) === 'alarm');
    ck('a Medium task under that rule never rings', entryAlertPlan({ ...base, priority: 'Medium' }, now, rule).every((x) => !x.alarm));
    ck('two choices offered', ALERT_MODES.map((m) => m.key).join() === 'alarm,gentle');
    const doc = toWebTask({ ...base, alertMode: 'gentle', updatedAt: now.toISOString() });
    ck('the choice is sent to the web app with the task', doc.alertMode === 'gentle');
    const back = fromWebDocOver({ ...base, alertMode: 'gentle' }, { ...doc, alertMode: undefined }, blankEntry());
    ck('a web copy without the field keeps the phone\'s choice', back.alertMode === 'gentle');
  }

  {
    section('Snooze and Silence reach the other device');
    const wdm = await import('../../src/workingDashboard.js');
    const { toWebTask, fromWebDocOver } = await import('../../src/cloudSync.js');
    const { pastDueEntries } = await import('../../src/pastDue.js');
    const now = new Date(2026, 9, 5, 15, 5);
    const due = { ...wdm.blankEntry(), id: 's1', title: 'Pay vendor', dueAt: new Date(2026, 9, 5, 15, 0).toISOString() };
    const sn = wdm.snoozeEntry(due, now.getTime() + 30 * 60000, now);
    ck('Snooze on the phone is sent to the web app in its own field (snoozeUntil)', toWebTask(sn).snoozeUntil === now.getTime() + 30 * 60000);
    const si = wdm.silenceEntryToday(due, now);
    ck('Silence today is sent as lastAckDate = today', toWebTask(si).lastAckDate === '2026-10-05');
    ck('a task never snoozed on the phone does not clear the web app\'s snooze', !('snoozeUntil' in toWebTask(due)) && !('lastAckDate' in toWebTask(due)));
    const fromWeb = fromWebDocOver(due, { ...toWebTask(due), snoozeUntil: now.getTime() + 10 * 60000, lastAckDate: '2026-10-05' }, wdm.blankEntry());
    ck('Snooze / Silence pressed on the web app are read by the phone', fromWeb.snoozeUntil === now.getTime() + 10 * 60000 && fromWeb.lastAckDate === '2026-10-05');
    ck('a snoozed or silenced task leaves the phone\'s Past Due list, as on the web app', pastDueEntries([sn], now).length === 0 && pastDueEntries([si], now).length === 0 && pastDueEntries([due], now).length === 1);
    const plan = wdm.entryAlertPlan(sn, now);
    ck('snoozed: nothing rings before the snooze ends, then one alert at its end', plan.every((x) => x.at.getTime() >= now.getTime() + 30 * 60000) && plan[0].key === 'snooze');
    const planS = wdm.entryAlertPlan(si, now);
    ck('silenced today: nothing more today; it rings again from tomorrow', planS.every((x) => x.at.getDate() !== 5) && planS.some((x) => x.key.startsWith('daily-')));
    const dl = { ...due, deadlineAt: new Date(2026, 9, 5, 16, 30).toISOString() };
    const dlPlan = wdm.entryAlertPlan(wdm.silenceEntryToday(dl, now), now);
    ck('silencing the due-time reminder leaves a later deadline today armed (as on the web app)', dlPlan.some((x) => x.key === 'dl'));
  }

  {
    const wdm = await import('../../src/workingDashboard.js');
    const now = new Date(2026, 9, 5, 12, 0);
    const old = { id: 'o1', title: 'Old', dueAt: new Date(2026, 9, 1, 10, 0).toISOString(), done: false, binned: false, priority: 'Medium' };
    const daily = wdm.entryAlertPlan(old, now).filter((x) => x.key.startsWith('daily-'));
    ck('a task open for days still has "still overdue" alerts ahead (counted from today)', daily.length >= 2 && daily.every((x) => x.at > now), JSON.stringify(daily.map((x) => x.at)));
    const dateOnly = { ...old, dueAt: new Date(2026, 9, 9).toISOString() };
    ck('a date-only task still alerts once', wdm.entryAlertPlan(dateOnly, now).length === 1);
    // Silenced today, 22:00 alert pushed to 08:00 tomorrow by quiet hours: it must survive the silence filter.
    const e = { ...old, dueAt: new Date(2026, 9, 5, 22, 0).toISOString(), lastAckDate: '2026-10-05', priority: 'Low' };
    const plan = wdm.entryAlertPlan(e, now, { quietHours: true, quietFrom: '21:00', quietTo: '08:00', quietExceptHigh: false });
    ck('an alert moved past midnight by quiet hours is not dropped by today\'s silence', plan.some((x) => x.key === 'due' && x.at.getDate() === 6), JSON.stringify(plan.map((x) => [x.key, x.at])));
  }
}
