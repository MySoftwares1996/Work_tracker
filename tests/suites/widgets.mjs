import { widgetsHidden, workSummaryWidgetData, workTodayWidgetData, workNextWidgetData, WIDGET_NAMES } from '../../src/widgetData.js';

export async function run({ ck, section }) {

  section('Widgets: lock');
  ck('no lock: details shown', !widgetsHidden({ settings: { appLock: { enabled: false } } }));
  ck('lock on: hidden by default', widgetsHidden({ settings: { appLock: { enabled: true } } }));
  ck('lock on, chosen to show: shown', !widgetsHidden({ settings: { appLock: { enabled: true }, widgets: { showWhenLocked: true } } }));
  ck('three widgets: summary, today and next up', WIDGET_NAMES.join() === 'WorkSummaryWidget,WorkTodayWidget,WorkNextWidget');

  section('Widgets: Working Dashboard');
  const wnow = new Date(2026, 9, 5, 11, 0);
  const W = (id, title, dueAt, extra = {}) => ({ id, title, dueAt: dueAt && dueAt.toISOString(), priority: 'Medium', ...extra });
  const wdb = { workingDashboard: { entries: [
    W('o1', 'Send GST mail', new Date(2026, 9, 3)),                                  // overdue (date-only, 2 days ago)
    W('o2', 'BRS', new Date(2026, 9, 5, 9, 0), { priority: 'High' }),               // overdue (timed, earlier today)
    W('t1', 'Pay vendor', new Date(2026, 9, 5, 15, 30)),                            // due later today
    W('t2', 'Cash voucher', new Date(2026, 9, 5)),                                  // date-only today
    W('f1', 'Audit', new Date(2026, 9, 8, 10, 0), { deadlineAt: new Date(2026, 9, 9, 17, 0).toISOString() }),
    W('d1', 'Done one', new Date(2026, 9, 5, 12, 0), { done: true }),
    W('n1', 'No date', null),
  ] } };
  const sum = workSummaryWidgetData(wdb, wnow);
  ck('summary counts overdue, due today and open', sum.overdue === 2 && sum.today === 2 && sum.open === 6 && sum.headline === '2 overdue');
  ck('summary names the next thing due', /^Next: Pay vendor/.test(sum.nextLine));
  const today = workTodayWidgetData(wdb, wnow);
  ck('today list: overdue first (oldest first), then today\'s', today.rows.map((r) => r.id).join() === 'o1,o2,t2,t1' && today.rows[0].late && !today.rows[3].late);
  ck('high priority is marked, and the headline counts both', today.rows[1].high && today.headline === '2 today · 2 overdue');
  ck('a long list says how many more', workTodayWidgetData(wdb, wnow, 3).more === 1);
  const next = workNextWidgetData(wdb, wnow);
  ck('next up is the next timed entry, with time left', next.title === 'Pay vendor' && /in 4 hr 30 min/.test(next.when));
  ck('next up shows the nearest deadline', /Audit/.test(next.deadline));
  ck('an empty dashboard says all clear', workSummaryWidgetData({}, wnow).headline === 'All clear 🎉' && !workNextWidgetData({}, wnow).has);
}
