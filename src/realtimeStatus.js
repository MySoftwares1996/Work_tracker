import { useEffect, useState } from 'react';

/** What Realtime Sync is doing, shared between the always-on sync (RealtimeSync.js) and the screens that show it. */
// authKnown: Firebase has said who is signed in (or that no one is) since the app started.
let state = { user: null, authKnown: false, listenError: '', pushError: '', lastPushAt: 0 };
const subs = new Set();

export function setRealtimeStatus(patch) {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
}
export const subscribeRealtimeStatus = (f) => { subs.add(f); return () => subs.delete(f); };

export function useRealtimeStatus() {
  const [, tick] = useState(0);
  useEffect(() => subscribeRealtimeStatus(() => tick((n) => n + 1)), []);
  return state;
}
