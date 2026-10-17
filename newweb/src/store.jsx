import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { collection, doc, getDocsFromServer, getFirestore, initializeFirestore, onSnapshot, setDoc, writeBatch } from 'firebase/firestore';
import { firebaseApp } from './firebase';
import { readReportFormats, planFormatSetup, effectiveFormats } from './reportFormats';
import { DEFAULT_LISTS, fromDoc, nextOccurrence, readCalendar, readLinks, readLists, readTemplates, toDoc, isOpen, writeListsValue, logWork } from './data';
import { demoTasks } from './demo';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);
export const DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');

const NOTE_MS = 4000;

/** Firebase's own wording says little; a refused read or write almost always means the security rules are not published yet. */
export function friendlyError(e) {
  const msg = e?.message || String(e);
  if (e?.code === 'permission-denied' || /insufficient permissions/i.test(msg)) {
    return 'Firebase is refusing access to your data. Publish the security rules in the Firebase console: Firestore Database > Rules > paste the rules from firestore.rules in the repository > Publish. Then reload this page.';
  }
  return msg;
}

/** The shared actions, written once for both the live and the demo store. `commit` saves one task. */
function makeActions(commit, getTasks, notify) {
  // A status moved on (In Progress, Waiting...) is a day worked on: it goes into the task's work log, which the Daily report is written from.
  const save = (t) => {
    const old = (getTasks() || []).find((x) => x.id === t.id);
    commit(!t.done && (!old || old.status !== t.status) ? logWork(t, t.status) : t);
  };
  return {
    save,
    complete(t, dar = true) {
      commit({ ...logWork(t, 'Completed'), done: true, completedAt: new Date(), dar });
      if (t.recurrence && t.recurrence !== "Doesn't repeat") {
        const next = nextOccurrence(t, getTasks());
        if (next) { commit(next); notify(`Next ${t.recurrence.toLowerCase()} task added`); }
        else if (!['Daily', 'Weekdays', 'Weekly', 'Monthly'].includes(t.recurrence)) notify('This repeat type is not repeated by this app');
      }
    },
    reopen: (t) => commit({ ...t, done: false, completedAt: null, status: 'Pending' }),
    bin: (t) => commit({ ...t, binned: true, binnedAt: new Date() }),
    restore: (t) => commit({ ...t, binned: false, binnedAt: null }),
    purge: (t) => commit({ ...t, binned: true, purged: true }),
  };
}

function Toast({ note }) {
  return note ? <div className="toast" role="status">{note}</div> : null;
}

// One Firestore instance. Auto-detecting long polling keeps the first load quick on phone networks / proxies where the
// default streaming connection stalls (the first screen then stayed at zero until a refresh).
let firestoreDb;
const dbOf = () => {
  if (firestoreDb) return firestoreDb;
  try { firestoreDb = initializeFirestore(firebaseApp(), { experimentalAutoDetectLongPolling: true }); } catch { firestoreDb = getFirestore(firebaseApp()); }
  return firestoreDb;
};

export function LiveStore({ children }) {
  const [user, setUser] = useState(undefined);       // undefined = still checking, null = signed out
  const [taskMap, setTaskMap] = useState({});
  const [lists, setLists] = useState(DEFAULT_LISTS);
  const rawLists = useRef(null);
  const [calendar, setCalendar] = useState({ holidays: [], leaveDays: [] });
  const [links, setLinks] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [formats, setFormats] = useState([]);              // the saved report formats (empty = the sample formats are used)
  const allFormats = useMemo(() => effectiveFormats(formats), [formats]);
  const [metaReady, setMetaReady] = useState(false);      // the lists and tools have arrived from the server
  const [setupDone, setSetupDone] = useState(false);      // the one-time automatic setup of the formats' categories ran for this account
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [synced, setSynced] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);     // the first server snapshot has arrived; after that, going offline never replaces the screen
  const [slow, setSlow] = useState(false);              // no answer from the server after 12 s (offline?)
  const [lastSyncAt, setLastSyncAt] = useState(0);       // when data last arrived from the server (shown on the sync dot)
  const tasksRef = useRef([]);

  useEffect(() => onAuthStateChanged(getAuth(firebaseApp()), (u) => {
    setUser(u); setSynced(false); setHasLoaded(false);
    if (!u) { setTaskMap({}); setLists(DEFAULT_LISTS); rawLists.current = null; setCalendar({ holidays: [], leaveDays: [] }); setLinks([]); setTemplates([]); setFormats([]); setSetupDone(false); }
  }), []);
  useEffect(() => {
    if (!user) return undefined;
    const db = dbOf();
    const onErr = (e) => setError(friendlyError(e));
    const applyMeta = (id, d) => {
      if (id === 'lists') { rawLists.current = d.lists ?? null; setLists(readLists(d.lists)); }
      if (id === 'calendar') setCalendar(readCalendar(d));
      if (id === 'tools') { setLinks(readLinks(d)); setTemplates(readTemplates(d)); setFormats(readReportFormats(d)); setSetupDone(!!d.formatSetupAt); }
    };
    const un1 = onSnapshot(collection(db, 'users', user.uid, 'tasks'), (snap) => {
      setTaskMap((m) => {
        const next = { ...m };
        snap.docChanges().forEach((ch) => { if (ch.type === 'removed') delete next[ch.doc.id]; else next[ch.doc.id] = fromDoc(ch.doc.id, ch.doc.data()); });
        return next;
      });
      setSynced(!snap.metadata.fromCache);
      if (!snap.metadata.fromCache) { setLastSyncAt(Date.now()); setHasLoaded(true); }
    }, onErr);
    const un2 = onSnapshot(collection(db, 'users', user.uid, 'meta'), (snap) => {
      snap.docChanges().forEach((ch) => { if (ch.type !== 'removed') applyMeta(ch.doc.id, ch.doc.data() || {}); });
      if (!snap.metadata.fromCache) setMetaReady(true);
    }, onErr);
    // Device to device: the live listeners can stall (a sleeping laptop, a network change). When this tab is shown again, comes back
    // online, or is clicked after a while, the server is asked directly and anything newer is taken - so an edit made on another
    // computer or on the phone is here at once, not only after a refresh.
    let busy = false;
    let last = 0;
    const refresh = async (force) => {
      if (busy || document.hidden || Date.now() - last < (force ? 4000 : 30000)) return;
      busy = true; last = Date.now();
      try {
        const [tasks, metas] = await Promise.all([getDocsFromServer(collection(db, 'users', user.uid, 'tasks')), getDocsFromServer(collection(db, 'users', user.uid, 'meta'))]);
        setTaskMap((m) => {
          const next = { ...m };
          tasks.docs.forEach((x) => {
            const fresh = fromDoc(x.id, x.data());
            const have = next[x.id];
            if (!have || (fresh.updatedAt || 0) >= (have.updatedAt || 0)) next[x.id] = fresh;
          });
          return next;
        });
        metas.docs.forEach((x) => applyMeta(x.id, x.data() || {}));
        setLastSyncAt(Date.now());
      } catch { /* offline: the live listener catches up when the network returns */ }
      busy = false;
    };
    // Coming back to the tab at most every 30 s re-reads everything; coming back online does it at once.
    const onShow = () => { if (!document.hidden) refresh(false); };
    const onFocus = () => refresh(false);
    const onOnline = () => refresh(true);
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    return () => { un1(); un2(); document.removeEventListener('visibilitychange', onShow); window.removeEventListener('focus', onFocus); window.removeEventListener('online', onOnline); };
  }, [user]);

  useEffect(() => {
    setSlow(false);
    if (!user || hasLoaded) return undefined;
    const id = setTimeout(() => setSlow(true), 12000);
    return () => clearTimeout(id);
  }, [user, hasLoaded]);

  // The "in use" note the phone reads (users/<you>/meta/presence): written every minute while this tab is open and was used in
  // the last 15 minutes, and cleared when it closes. While it is fresh the phone only shows a notification; otherwise it rings.
  useEffect(() => {
    if (!user) return undefined;
    const ref = doc(dbOf(), 'users', user.uid, 'meta', 'presence');
    const IDLE = 15 * 60000;
    let lastInput = Date.now();
    let lastSent = 0;
    const put = (webActiveAt, lastInputAt) => setDoc(ref, { webActiveAt, lastInputAt }, { merge: true }).catch(() => {});
    const send = (force) => {
      const now = Date.now();
      if (now - lastInput > IDLE) return;
      if (!force && now - lastSent < 50000) return;
      lastSent = now;
      put(now, lastInput);
    };
    const onInput = () => { const idleBefore = Date.now() - lastInput > 60000; lastInput = Date.now(); if (idleBefore) send(true); };
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'mousemove'];
    events.forEach((ev) => window.addEventListener(ev, onInput, { passive: true }));
    const onHide = () => put(0, 0);
    window.addEventListener('pagehide', onHide);
    send(true);
    const timer = setInterval(() => send(false), 60000);
    return () => {
      clearInterval(timer);
      events.forEach((ev) => window.removeEventListener(ev, onInput));
      window.removeEventListener('pagehide', onHide);
      put(0, 0);
    };
  }, [user]);

  const persistLists = useCallback((next) => {
    if (!user) return;
    setLists(next);
    setDoc(doc(dbOf(), 'users', user.uid, 'meta', 'lists'), { lists: writeListsValue(rawLists.current, next), ts: Date.now() }, { merge: true })
      .then(() => { rawLists.current = writeListsValue(rawLists.current, next); })
      .catch((e) => setError(friendlyError(e)));
  }, [user]);

  // Once per account, automatically: every Category and Sub Category the report formats need is created if it is missing (nothing existing is
  // changed). The flag (meta/tools.formatSetupAt) stops it running again, so a category deleted later stays deleted; Config > Report formats
  // has the button for doing it again.
  const setupRan = useRef(false);
  useEffect(() => {
    if (!user || !metaReady || setupDone || setupRan.current) return;
    setupRan.current = true;
    const plan = planFormatSetup(lists, allFormats);
    if (plan.categories.length || plan.subCategories.length) {
      persistLists(plan.lists);
      setNote(`Added ${plan.categories.length} categor${plan.categories.length === 1 ? 'y' : 'ies'} and ${plan.subCategories.length} sub categor${plan.subCategories.length === 1 ? 'y' : 'ies'} from your report formats`);
      setTimeout(() => setNote(''), NOTE_MS * 2);
    }
    setDoc(doc(dbOf(), 'users', user.uid, 'meta', 'tools'), { formatSetupAt: Date.now() }, { merge: true }).catch(() => {});
    setSetupDone(true);
  }, [user, metaReady, setupDone, lists, formats, persistLists]);
  useEffect(() => { setupRan.current = false; setMetaReady(false); }, [user]);

  const tasks = useMemo(() => Object.values(taskMap).filter((t) => !t.purged), [taskMap]);
  tasksRef.current = tasks;

  const noteTimer = useRef(null);
  const flash = useCallback((m) => { setNote(m); clearTimeout(noteTimer.current); noteTimer.current = setTimeout(() => setNote(''), NOTE_MS); }, []);
  const actions = useMemo(() => {
    const commit = (t) => {
      if (!user) return;
      setError('');
      setDoc(doc(dbOf(), 'users', user.uid, 'tasks', String(t.id)), toDoc(t), { merge: true }).catch((e) => setError(friendlyError(e)));
    };
    return makeActions(commit, () => tasksRef.current, flash);
  }, [user, flash]);

  const value = useMemo(() => ({
    demo: false, user, tasks, lists, calendar, links, templates, reportFormats: allFormats, savedFormats: formats, reportFormatsCustom: formats.length > 0,
    saveReportFormats: (next) => {
      if (!user) return;
      const now = Date.now();
      setFormats(next);
      setDoc(doc(dbOf(), 'users', user.uid, 'meta', 'tools'), { reportFormats: next, stamps: { reportFormats: now }, ts: now }, { merge: true }).catch((e) => setError(friendlyError(e)));
    },
    error, synced, hasLoaded, slow, lastSyncAt, actions, notify: flash,
    // Written with its own stamp in meta/tools, the way the phone stamps it, so the newest edit wins on both.
    saveTemplates: (next) => {
      if (!user) return;
      const now = Date.now();
      setTemplates(next);
      setDoc(doc(dbOf(), 'users', user.uid, 'meta', 'tools'), { templates: next, stamps: { templates: now }, ts: now }, { merge: true }).catch((e) => setError(friendlyError(e)));
    },
    // Options added or removed here reach the phone and the old website too (meta/lists, newest write wins).
    saveLists: persistLists,
    // Writes an import plan (importBackup.js): the tasks in batches, then the lists and the calendar. Merged, so nothing else is cleared.
    importPlan: async (plan) => {
      if (!user) throw new Error('Sign in first.');
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('You are offline. Connect to the internet and try the import again.');
      const db = dbOf();
      // Commits wait for the server, so offline they never finish: give up after a while with a clear message instead of hanging.
      const timeout = (p) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('The server did not answer in time, so the import may be incomplete. Check your internet connection and run the import again (tasks already there are skipped or overwritten safely).')), 45000))]);
      for (let i = 0; i < plan.tasks.length; i += 400) {
        const batch = writeBatch(db);
        plan.tasks.slice(i, i + 400).forEach((x) => batch.set(doc(db, 'users', user.uid, 'tasks', x.id), x.doc, { merge: true }));
        await timeout(batch.commit());
      }
      const merged = { ...plan.lists };
      await timeout(setDoc(doc(db, 'users', user.uid, 'meta', 'lists'), { lists: writeListsValue(rawLists.current, merged), ts: Date.now() }, { merge: true }));
      rawLists.current = writeListsValue(rawLists.current, merged);
      setLists((l) => ({ ...l, ...merged }));
      if (Object.keys(plan.calendar).length) await timeout(setDoc(doc(db, 'users', user.uid, 'meta', 'calendar'), { ...plan.calendar, ts: Date.now() }, { merge: true }));
    },
    signIn: async () => { setError(''); try { await signInWithPopup(getAuth(firebaseApp()), new GoogleAuthProvider()); } catch (e) { setError(e?.code === 'auth/unauthorized-domain' ? `This web address is not allowed to sign in yet. Firebase console -> Authentication -> Settings -> Authorized domains -> add ${location.hostname}.` : (e?.message || String(e))); } },
    signOut: () => signOut(getAuth(firebaseApp())),
  }), [user, tasks, lists, calendar, links, templates, formats, error, synced, hasLoaded, slow, lastSyncAt, actions, persistLists]);

  return <Ctx.Provider value={value}>{children}<Toast note={note} /></Ctx.Provider>;
}

export function DemoStore({ children }) {
  const [tasks, setTasks] = useState(demoTasks);
  const [lists, setLists] = useState({
    ...DEFAULT_LISTS,
    subCategories: [
      { id: 'p1', name: 'Domestic Payment', category: 'Payments', fields: [{ label: 'Vendor Name' }, { label: 'Invoice No' }] },
      { id: 'p2', name: 'Urgent Payment', category: 'Payments', fields: [{ label: 'Vendor Name' }] },
      { id: 'p3', name: 'Import Payment', category: 'Payments', fields: [{ label: 'Bill of Entry' }, { label: 'Mode', options: ['TT', 'LC'] }] },
      { id: 'p4', name: 'Customs Duty', category: 'Payments', fields: [{ label: 'BE No' }] },
      { id: 'p6', name: 'Invoice Payment', category: 'Payments', fields: [{ label: 'Name of vendor' }, { label: 'Invoice No' }] },
      { id: 'p5', name: 'Demand Draft', category: 'Payments', fields: [] },
      { id: 'b1', name: "Urgent Bank Follow Up's", category: 'Follow-up', fields: [{ label: "Banker's Reply's:" }] },
      { id: 'a1', name: 'Statutory Audit', category: 'Audit', fields: [] },
      { id: 'a2', name: 'Internal Audit', category: 'Audit', fields: [] },
    ],
    subCategoryCategories: ['Payments', 'Audit'],
    reminderCategories: ['Payments', 'Follow-up'],
  });
  const [note, setNote] = useState('');
  const ref = useRef(tasks);
  ref.current = tasks;
  const noteTimer = useRef(null);
  const flash = useCallback((m) => { setNote(m); clearTimeout(noteTimer.current); noteTimer.current = setTimeout(() => setNote(''), NOTE_MS); }, []);
  const actions = useMemo(() => {
    const commit = (t) => setTasks((list) => (list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t]));
    return makeActions(commit, () => ref.current, flash);
  }, [flash]);
  const visible = useMemo(() => tasks.filter((t) => !t.purged), [tasks]);
  const calendar = useMemo(() => ({ holidays: [{ date: '2026-10-20', name: 'Sample holiday' }], leaveDays: [] }), []);
  const [templates, setTemplates] = useState([]);
  const [formats, setFormats] = useState([]);
  const allFormats = useMemo(() => effectiveFormats(formats), [formats]);
  const links = useMemo(() => [{ id: '1', title: 'Firebase console', url: 'https://console.firebase.google.com', folder: 'Work' }, { id: '2', title: 'Gmail', url: 'https://mail.google.com', folder: '' }], []);
  const value = useMemo(() => ({
    demo: true, notify: flash, user: { displayName: 'Demo user', email: 'demo@example.com' }, tasks: visible, lists, saveLists: setLists, calendar, links, templates, saveTemplates: setTemplates, reportFormats: allFormats, savedFormats: formats, reportFormatsCustom: formats.length > 0, saveReportFormats: setFormats, error: '', synced: true, hasLoaded: true, actions,
    importPlan: async (plan) => { plan.tasks.forEach((x) => actions.save(fromDoc(x.id, x.doc))); setLists((l) => ({ ...l, ...plan.lists })); },
    signIn: () => {}, signOut: () => { location.search = ''; },
  }), [visible, lists, calendar, links, templates, formats, actions]);
  return <Ctx.Provider value={value}>{children}<Toast note={note} /></Ctx.Provider>;
}

export { isOpen };
