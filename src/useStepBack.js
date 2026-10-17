import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { backTab, isLeaving, markLeaving } from './stepBackCore';

export { backTab, markLeaving };

/**
 * Back inside a tool: from a page (a person, a list) it closes that page; from any tab other than the first it
 * goes to the first tab; from the first tab it leaves the tool. At most two presses - it used to step back
 * through every tab visited. The Home button (App.js) leaves at once.
 *
 * Both hooks listen for 'beforeRemove', which react-navigation fires for every way of leaving a screen.
 */

/**
 * A tab state: [tab, setTab]. Back from another tab returns to the first one (`initial`).
 * `onRestore(tab)` runs when Back changes the tab, for screens that reset something on a tab change.
 */
export function useTabHistory(initial, onRestore) {
  const navigation = useNavigation();
  const [tab, setTabState] = useState(initial);
  const current = useRef(initial);
  const first = useRef(initial);
  const restore = useRef(onRestore);
  restore.current = onRestore;

  const setTab = useCallback((next) => {
    current.current = next;
    setTabState(next);
  }, []);

  useEffect(() => navigation.addListener('beforeRemove', (e) => {
    if (isLeaving()) return;
    const to = backTab(current.current, first.current);
    if (to == null) return;                          // first tab: leave the tool as usual
    e.preventDefault();
    current.current = to;
    setTabState(to);
    restore.current?.(to);
  }), [navigation]);

  // The Working Dashboard is this app's first screen: Android's Back there closes the app without a
  // 'beforeRemove', so the step back to the first tab is caught here too.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!navigation.isFocused() || navigation.canGoBack()) return false;
      const to = backTab(current.current, first.current);
      if (to == null) return false;
      current.current = to;
      setTabState(to);
      restore.current?.(to);
      return true;
    });
    return () => sub.remove();
  }, [navigation]);

  return [tab, setTab];
}


