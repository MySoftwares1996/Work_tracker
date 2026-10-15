import { tabAfterSwipe, isHorizontalDrag } from '../../src/swipe.js';

export async function run({ ck, section }) {
  const T = ['dashboard', 'filter', 'all'];
  section('Swipe tabs');
  ck('swipe left -> next tab', tabAfterSwipe(T, 'dashboard', -120) === 'filter');
  ck('swipe right -> previous tab', tabAfterSwipe(T, 'filter', 120) === 'dashboard');
  ck('no next tab at the end', tabAfterSwipe(T, 'all', -120) === null);
  ck('no previous tab at the start', tabAfterSwipe(T, 'dashboard', 120) === null);
  ck('a short drag does nothing', tabAfterSwipe(T, 'filter', -30) === null);
  ck('a quick flick counts even if short', tabAfterSwipe(T, 'filter', -30, 0, -0.9) === 'all');
  ck('a mostly vertical drag never switches', tabAfterSwipe(T, 'filter', -80, 140) === null);
  ck('unknown current tab is ignored', tabAfterSwipe(T, 'nope', -200) === null);
  section('Swipe tabs: when to claim the gesture');
  ck('clear horizontal drag is claimed', isHorizontalDrag(40, 5));
  ck('vertical scrolling is left alone', !isHorizontalDrag(30, 40));
  ck('tiny movement is left alone', !isHorizontalDrag(10, 0));
  ck('diagonal is left alone', !isHorizontalDrag(40, 30));
}
