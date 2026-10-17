import { lastWorkingDays, monthEndOptions } from '../../src/monthEnd.js';

export async function run({ ck, section }) {
  section('Month end: the last working days of the month');
  // October 2026 ends on a Saturday (31st); Sunday 25th is the weekly off.
  const none = () => false;
  ck('-1 is the last day, -2 the one before (both working days)', lastWorkingDays(2026, 9, none, 2).map((x) => x.key).join() === '2026-10-31,2026-10-30');
  ck('a Sunday month end is skipped (31 Jan 2027 is a Sunday)', lastWorkingDays(2027, 0, none, 2).map((x) => x.key).join() === '2027-01-30,2027-01-29');
  ck('a holiday or leave day is skipped', lastWorkingDays(2026, 9, (k) => k === '2026-10-31' || k === '2026-10-29', 2).map((x) => x.key).join() === '2026-10-30,2026-10-28');
  ck('numbered from 1', lastWorkingDays(2026, 9, none, 3).map((x) => x.n).join() === '1,2,3');
  const mid = monthEndOptions(new Date(2026, 9, 17), none, 2);
  ck('mid-month shows this month', mid.length === 2 && mid[0].key === '2026-10-31' && /^Month end -1 · /.test(mid[0].label));
  const after = monthEndOptions(new Date(2026, 9, 31, 20), none, 2);
  ck('on the last day it still shows today', after[0].key === '2026-10-31');
  const gone = monthEndOptions(new Date(2026, 10, 1), (k) => false, 2);
  ck('a new month shows its own month end', gone[0].key === '2026-11-30');
  const passed = monthEndOptions(new Date(2026, 9, 31), (k) => k === '2026-10-31', 2);
  ck('when every month-end day has passed, next month is shown', monthEndOptions(new Date(2026, 9, 31, 12), (k) => k <= '2026-10-31', 2)[0].key === '2026-11-30' && passed.length === 2);
}
