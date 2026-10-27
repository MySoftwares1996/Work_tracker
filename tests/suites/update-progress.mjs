import { fmtClock, estimateRemainingMs, fmtLeft } from '../../src/updateProgress.js';

export async function run({ ck, section }) {
  section('Update bar: the clock and the time left');
  ck('clock shows minutes and seconds', fmtClock(7000) === '0:07' && fmtClock(65000) === '1:05' && fmtClock(-5) === '0:00');
  ck('no estimate too early', estimateRemainingMs(0.02, 5000) === null && estimateRemainingMs(0.5, 800) === null && estimateRemainingMs(undefined, 9000) === null);
  ck('half done after 4 s leaves about 4 s', estimateRemainingMs(0.5, 4000) === 4000);
  ck('a quarter done after 3 s leaves 9 s', estimateRemainingMs(0.25, 3000) === 9000);
  ck('finished leaves nothing', estimateRemainingMs(1, 9000) === 0);
  ck('wording', fmtLeft(null) === '' && fmtLeft(1000) === 'almost done' && fmtLeft(8200) === 'about 9 s left' && fmtLeft(61000) === 'about 2 min left');
  section('App updates: the restart is offered in the dialog itself');
  const fsx = (await import('fs')).readFileSync;
  const more = fsx('src/screens/WdMoreTab.js', 'utf8');
  const dash = fsx('src/screens/WorkingDashboard.js', 'utf8');
  ck('More > Check for an update now offers "Restart now" when a version was downloaded', more.includes("{ text: 'Restart now', onPress: restartApp }") && more.includes('r.downloaded'));
  ck('the Refresh button in the app bar offers it too', dash.includes("{ text: 'Restart now', onPress: restartApp }") && dash.includes('newVersion = r.downloaded'));
  ck('an update downloaded earlier and still waiting counts as ready', fsx('src/updateStatus.native.js', 'utf8').includes('Updates.isUpdatePending'));
}
