import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useStore } from './store';
import { watchAuthState, listen as listenRealtime, push as pushRealtime, pushPresence, pushTools, saveDeviceToken } from './firebaseSync';
import { toolsFromRemote, toolsValue } from './links';
import { mergeRemoteEntries, applyRemovedIds, listsOnReceive, webActiveUntil } from './firebaseSyncCore';
import { setWebActiveUntil, setWebPresenceCheck, stopAlarmRinging } from './tracker';
import { DEFAULT_ALERTS, isSnoozed, isSilencedToday } from './workingDashboard';
import { fromWebDocOver, mergeHolidays } from './cloudSync';
import { blankEntry, withCompletedAt, normalizeCalendar, normalizeHolidays, normalizeLeaveDays } from './workingDashboard';
import { setRealtimeStatus, useRealtimeStatus } from './realtimeStatus';
import { forAccount } from './account';
import { planFormatSetup, effectiveFormats } from './reportFormats';
import { paymentLists } from './workingDashboardPayments';
import { warnQuiet } from './quietCatch';

const PUSH_DELAY_MS = 700;        // after the last change: one tap on Done reaches the web app in about a second
const RETRY_MS = 15000;           // a push that failed (no signal) is tried again

/**
 * Realtime Sync for the Working Dashboard, running for as long as the app is open - not only while the Working
 * Dashboard screen is on show. It used to live inside that screen, so a task completed anywhere else (the Past Due
 * Alert, the home screen, an alarm's Done button) was never sent to the web app until the screen was opened, and
 * the web app's changes were not received while another screen was open. Renders nothing.
 */
export default function RealtimeSync() {
  const { data, update, ready } = useStore();
  const wd = data.workingDashboard || {};
  const wdRef = useRef(wd);
  wdRef.current = wd;
  const userRef = useRef(null);
  const pushRef = useRef(() => {});
  const metaSeen = useRef({ tools: false, lists: false });      // the account's lists and tools documents have both arrived
  const [metaTick, setMetaTick] = useState(0);

  const updateWd = (fn) => update((db) => ({ ...db, workingDashboard: fn(db.workingDashboard || {}) }));

  // Who is signed in.
  useEffect(() => watchAuthState((u) => { userRef.current = u; setRealtimeStatus({ user: u, authKnown: true, listenError: '', pushError: '' }); pushRef.current(); }), []);
  const status = useRealtimeStatus();

  // The data on this device follows the signed-in account (account.js): someone else signing in on the same phone
  // or browser starts from their own data, and the previous account's tasks are never sent into theirs. Nothing is
  // received or sent until the device's data is this account's.
  const signedUid = status.user?.uid || null;
  useEffect(() => {
    if (!ready || !signedUid || wd.accountUid === signedUid) return;
    updateWd((w) => forAccount(w, signedUid, status.user?.email || ''));
  }, [ready, signedUid, wd.accountUid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bump the lists' timestamp when they really change, so the push knows to write them.
  const listsSnapshot = JSON.stringify([wd.categories, wd.priorities, wd.statuses, wd.assignees]);
  const prevLists = useRef(listsSnapshot);
  useEffect(() => {
    // Loading the saved data is not an edit: it must not make this device's lists the newest.
    if (!ready) { prevLists.current = listsSnapshot; return; }
    if (prevLists.current === listsSnapshot) return;
    prevLists.current = listsSnapshot;
    updateWd((w) => ({ ...w, listsUpdatedAt: Date.now() }));
  }, [listsSnapshot, ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Once per account, automatically: every Category and Sub Category the report formats need is created if it is missing (nothing existing is
  // changed), as on the website; formatSetupAt stops it running again, so a category deleted later stays deleted.
  useEffect(() => {
    if (!ready || !signedUid || wd.accountUid !== signedUid || wd.formatSetupAt || !metaSeen.current.tools || !metaSeen.current.lists) return undefined;
    // A moment later, so the lists that just arrived are in wd when the plan is made.
    const timer = setTimeout(() => {
      const w = wdRef.current;
      if (w.formatSetupAt) return;
      const plan = planFormatSetup({ categories: w.categories, subCategories: paymentLists(w, w.categories).subCategories, subCategoryCategories: w.subCategoryCategories }, effectiveFormats(w.reportFormats));
      updateWd((x) => ({ ...x, formatSetupAt: Date.now(), ...(plan.categories.length || plan.subCategories.length ? { categories: plan.lists.categories, subCategories: plan.lists.subCategories, subCategoryCategories: plan.lists.subCategoryCategories, listsUpdatedAt: Date.now() } : null), toolsUpdatedAt: Date.now() }));
    }, 2000);
    return () => clearTimeout(timer);
  }, [metaTick, ready, signedUid, wd.accountUid, wd.formatSetupAt]); // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * The web app's "in use" note: tells the phone's alarm code until when to stay quiet (Config > Alerts >
   * "Ring on the phone only when the web app is not in use"). Re-sent when the switch changes, and refreshed
   * every minute so the window ends on time even if no new note arrives.
   */
  const presenceRef = useRef(null);
  const phoneWhenWebIdle = ({ ...DEFAULT_ALERTS, ...(wd.alerts || {}) }).phoneWhenWebIdle !== false;
  const phoneRuleRef = useRef(phoneWhenWebIdle);
  phoneRuleRef.current = phoneWhenWebIdle;
  const sendPresence = () => {
    const until = phoneRuleRef.current ? webActiveUntil(presenceRef.current, Date.now()) : 0;
    setRealtimeStatus({ webInUseUntil: until, webSeenAt: Number(presenceRef.current?.webActiveAt) || 0 });
    setWebActiveUntil(until).catch(() => {});
  };
  useEffect(() => { sendPresence(); setWebPresenceCheck(phoneWhenWebIdle).catch(() => {}); }, [phoneWhenWebIdle]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const i = setInterval(sendPresence, 60000); return () => clearInterval(i); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /*
   * web.app only: tells the phone the web app is in use. While this tab is open and has had a click, key press, touch
   * or scroll in the last 15 minutes, a note is written every minute; the phone keeps its task alerts silent while the
   * note is fresh (3 minutes) and rings again as soon as it is not - the tab closed, the computer asleep or idle.
   */
  useEffect(() => {
    if (Platform.OS !== 'web' || !ready || !signedUid || wd.accountUid !== signedUid || typeof globalThis.addEventListener !== 'function') return undefined;
    const IDLE = 15 * 60000;
    let lastInput = Date.now();
    let lastSent = 0;
    const send = (force) => {
      const now = Date.now();
      if (now - lastInput > IDLE) return;                       // idle: no note, the phone's copy expires by itself
      if (!force && now - lastSent < 50000) return;
      lastSent = now;
      pushPresence(signedUid, { webActiveAt: now, lastInputAt: lastInput }).catch(warnQuiet('pushPresence'));
    };
    const onInput = () => { const idleBefore = Date.now() - lastInput > 60000; lastInput = Date.now(); if (idleBefore) send(true); };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'];
    events.forEach((ev) => globalThis.addEventListener(ev, onInput, { passive: true }));
    const onHide = () => { pushPresence(signedUid, { webActiveAt: 0, lastInputAt: 0 }).catch(warnQuiet('pushPresence')); };
    globalThis.addEventListener('pagehide', onHide);
    send(true);
    const timer = setInterval(() => send(false), 60000);
    return () => {
      clearInterval(timer);
      events.forEach((ev) => globalThis.removeEventListener(ev, onInput));
      globalThis.removeEventListener('pagehide', onHide);
    };
  }, [ready, signedUid, wd.accountUid]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Applies what Firestore sent to the data as it is now (not a copy taken earlier); newest wins. */
  const applyRemote = (patch) => {
    if (patch.presence) { presenceRef.current = patch.presence; sendPresence(); return; }
    if (patch.tools) metaSeen.current.tools = true;
    if (patch.paymentLists || patch.lists) metaSeen.current.lists = true;
    if (patch.tools || patch.paymentLists || patch.lists) setMetaTick((n) => n + 1);
    if (patch.tools) {
      // Per item: only what is newer in the account is taken; this device's newer items stay and are sent back below.
      const got = toolsFromRemote(patch.tools, wdRef.current.toolsStamps, wdRef.current);
      if (got) {
        toolsSent.current = Math.max(0, ...Object.values(got.stamps).map(Number));
        updateWd((w) => {
          const { holdUntil, ...rest } = got.patch;
          const next = { ...w, ...rest, toolsStamps: got.stamps, toolsUpdatedAt: Math.max(0, ...Object.values(got.stamps).map(Number)) };
          if (holdUntil !== undefined) next.alerts = { ...(w.alerts || {}), holdUntil };
          return next;
        });
      }
      return;
    }
    if (patch.newAccount) { pushRef.current(); return; }      // a new account: write its lists now (firebaseSync.js)
    const w0 = wdRef.current;
    const mergedLists = patch.lists ? listsOnReceive(patch.lists, [w0.categories, w0.priorities, w0.statuses, w0.assignees], patch.listsUpdatedAt, w0.listsUpdatedAt) : null;
    if (mergedLists) prevLists.current = JSON.stringify(mergedLists);      // not a local edit: do not push it straight back
    const cal = patch.calendar ? normalizeCalendar(patch.calendar) : null;
    updateWd((w) => {
      let next = w;
      if (patch.remote) {
        const blank = blankEntry();
        const have = new Map((w.entries || []).map((e) => [String(e.id), e]));
        const incoming = patch.remote.incoming.map((d) => fromWebDocOver(have.get(String(d.id)), d, blank)).filter(Boolean).map(withCompletedAt);
        // Done, binned, snoozed or silenced on the web app: an alarm ringing on the phone for it stops now
        // (its booked alerts are re-planned when the entries change).
        const now = new Date();
        incoming.forEach((e) => { if (e.done || e.binned || isSnoozed(e, now) || isSilencedToday(e, now)) stopAlarmRinging(`wd:${e.id}:`).catch(() => {}); });
        const kept = applyRemovedIds(w.entries || [], (patch.remote.removedIds || []).map(String)).entries;
        next = { ...next, entries: mergeRemoteEntries(kept, incoming, w.deletedIds || []).entries };
      }
      if (mergedLists) next = { ...next, categories: mergedLists[0], priorities: mergedLists[1], statuses: mergedLists[2], assignees: mergedLists[3] };
      // The web app's payment lists (Sub Categories, Tally narration types, the report's payment lines): the web
      // app is where they are edited, so its copy replaces the phone's.
      const pl = patch.paymentLists || {};
      // (unless this phone changed them after the arriving copy was written - then its own copy is sent next)
      const phoneNewer = Number(w.listsUpdatedAt) > Number(patch.listsUpdatedAt || 0);
      if (!phoneNewer) ['subCategories', 'subCategoryCategories', 'narrationTypes', 'reminderCategories'].forEach((k) => { if (Array.isArray(pl[k])) next = { ...next, [k]: pl[k] }; });
      if (Array.isArray(pl.darPaymentIntro) && pl.darPaymentIntro.some((x) => String(x || '').trim())) next = { ...next, paymentIntro: pl.darPaymentIntro.map((x) => String(x || '')) };
      if (cal) next = { ...next, holidays: mergeHolidays(cal.holidays, normalizeHolidays(w.holidays)).holidays, leaveDays: normalizeLeaveDays([...cal.leaveDays, ...normalizeLeaveDays(w.leaveDays)]) };
      return next;
    });
  };

  // Receive: the web app's changes arrive live, whichever screen is open.
  const uid = signedUid && wd.accountUid === signedUid ? signedUid : null;
  // A listener that fails (the sign-in token expired, a lost connection that gave up) is dead for good: it is started
  // again after a short wait, so the phone and the website never stop receiving each other's changes.
  const [listenTry, setListenTry] = useState(0);
  const retryListen = useRef(null);
  useEffect(() => () => clearTimeout(retryListen.current), []);
  useEffect(() => {
    if (!ready || !uid) return undefined;
    setRealtimeStatus({ listenError: '' });
    return listenRealtime(uid, {
      getEntries: () => wdRef.current.entries || [],
      getTombstones: () => wdRef.current.deletedIds || [],
      onRemoteChange: applyRemote,
      onError: (e) => {
        setRealtimeStatus({ listenError: e?.message || 'Realtime Sync lost its connection.' });
        clearTimeout(retryListen.current);
        retryListen.current = setTimeout(() => setListenTry((n) => n + 1), 20000);
      },
    });
  }, [ready, uid, listenTry]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phone: the push token is saved to the account, so the server can wake this phone when a task changes (instant sync).
  useEffect(() => {
    if (Platform.OS === 'web' || !ready || !uid) return undefined;
    let sub = null;
    (async () => {
      try {
        const Notifications = await import('expo-notifications');
        const tok = await Notifications.getDevicePushTokenAsync();
        if (tok && tok.data) await saveDeviceToken(uid, String(tok.data));
        sub = Notifications.addPushTokenListener((t) => { if (t && t.data) saveDeviceToken(uid, String(t.data)).catch(() => {}); });
      } catch { /* no Google services / offline: the 15-minute refresh still works */ }
    })();
    return () => { if (sub && sub.remove) sub.remove(); };
  }, [ready, uid]);

  // Links, templates, the AI instruction boxes and Meeting mode follow the account: sent when edited here (not when they just arrived).
  const toolsSent = useRef(0);
  const toolsKey = JSON.stringify([toolsValue(wd), wd.toolsStamps]);
  useEffect(() => {
    const newest = Math.max(0, ...Object.values(wd.toolsStamps || {}).map(Number));
    if (!ready || !uid || wd.accountUid !== uid || !newest || newest <= toolsSent.current) return undefined;
    const timer = setTimeout(() => {
      toolsSent.current = newest;
      pushTools(uid, { ...toolsValue(wd), stamps: wd.toolsStamps || {}, ts: newest }).catch(() => { toolsSent.current = 0; });
    }, 1500);
    return () => clearTimeout(timer);
  }, [ready, uid, wd.accountUid, toolsKey]); // eslint-disable-line react-hooks/exhaustive-deps


  // Send: whatever changed on this phone, shortly after the change; retried if it did not get through.
  const retryTimer = useRef(null);
  pushRef.current = () => {
    const u = userRef.current;
    const w = wdRef.current;
    if (!u || !ready || w.accountUid !== u.uid) return Promise.resolve();
    return pushRealtime(u.uid, {
      entries: w.entries || [],
      lists: [w.categories, w.priorities, w.statuses, w.assignees],
      // The payment lists the phone edits (Report formats > Add to my lists, Next reminder): only those it has, so it never clears the web app's.
      extraLists: Object.fromEntries(['subCategories', 'subCategoryCategories', 'narrationTypes', 'reminderCategories'].filter((k) => Array.isArray(w[k])).map((k) => [k, w[k]])),
      listsUpdatedAt: w.listsUpdatedAt || 0,
      deletedIds: w.deletedIds || [],
    }).then((res) => {
      clearTimeout(retryTimer.current);
      setRealtimeStatus({ pushError: '', lastPushAt: Date.now() });
      if (res && res.deleted && res.deleted.length) updateWd((x) => ({ ...x, deletedIds: (x.deletedIds || []).filter((id) => !res.deleted.includes(id)) }));
    }).catch((e) => {
      setRealtimeStatus({ pushError: e?.message || 'Could not reach the web app - will try again.' });
      clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => pushRef.current(), RETRY_MS);
    });
  };
  useEffect(() => {
    if (!ready || !uid) return undefined;
    const timer = setTimeout(() => pushRef.current(), PUSH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [ready, uid, wd.entries, wd.categories, wd.priorities, wd.statuses, wd.assignees, wd.subCategories, wd.subCategoryCategories, wd.reminderCategories, wd.listsUpdatedAt, wd.deletedIds]);

  // Leaving the app (or coming back) is also a moment to send anything not yet sent.
  useEffect(() => {
    const sub = AppState.addEventListener('change', () => { pushRef.current(); });
    return () => { sub.remove(); clearTimeout(retryTimer.current); };
  }, []);

  return null;
}
