/**
 * Which screens the Android app shows: its own phone screens (the default) or, if chosen in Settings, the new website inside the app
 * (src/screens/WebApp.js). Kept on this phone only.
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'wd-web-ui';
let webUi = false;
let loaded = false;
const listeners = new Set();
const loading = AsyncStorage.getItem(KEY).then((v) => { webUi = v === '1'; }).catch(() => {}).finally(() => { loaded = true; listeners.forEach((f) => f()); });

export const setWebUi = (on) => {
  webUi = !!on;
  AsyncStorage.setItem(KEY, webUi ? '1' : '0').catch(() => {});
  listeners.forEach((f) => f());
};

/** [webUi, setWebUi, ready] - re-renders when it changes. */
export function useWebUi() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); listeners.add(f); loading.then(f); return () => { listeners.delete(f); }; }, []);
  return [webUi, setWebUi, loaded];
}
