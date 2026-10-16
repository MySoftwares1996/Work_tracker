/**
 * Which screens the Android app shows: the new website inside the app (the default, the same screens as the website) or the older
 * phone screens. Kept on this phone only. The older screens are the way back if the website cannot load (no internet at the start).
 */
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'wd-classic-ui';
let classic = false;
let loaded = false;
const listeners = new Set();
const loading = AsyncStorage.getItem(KEY).then((v) => { classic = v === '1'; }).catch(() => {}).finally(() => { loaded = true; listeners.forEach((f) => f()); });

export const setClassicUi = (on) => {
  classic = !!on;
  AsyncStorage.setItem(KEY, classic ? '1' : '0').catch(() => {});
  listeners.forEach((f) => f());
};

/** [classic, setClassic, ready] - re-renders when it changes. */
export function useClassicUi() {
  const [, tick] = useState(0);
  useEffect(() => { const f = () => tick((n) => n + 1); listeners.add(f); loading.then(f); return () => { listeners.delete(f); }; }, []);
  return [classic, setClassicUi, loaded];
}
