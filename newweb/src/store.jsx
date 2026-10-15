import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { collection, doc, getFirestore, onSnapshot, setDoc } from 'firebase/firestore';
import { firebaseApp } from './firebase';
import { DEFAULT_LISTS, fromDoc, nextOccurrence, readCalendar, readLinks, readLists, toDoc, isOpen } from './data';
import { demoTasks } from './demo';

const Ctx = createContext(null);
export const useStore = () => useContext(Ctx);
export const DEMO = typeof location !== 'undefined' && new URLSearchParams(location.search).has('demo');

const NOTE_MS = 4000;

/** The shared actions, written once for both the live and the demo store. `commit` saves one task. */
function makeActions(commit, getTasks, notify) {
  const save = (t) => commit(t);
  return {
    save,
    complete(t, dar = true) {
      commit({ ...t, done: true, completedAt: new Date(), dar });
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

export function LiveStore({ children }) {
  const [user, setUser] = useState(undefined);       // undefined = still checking, null = signed out
  const [taskMap, setTaskMap] = useState({});
  const [lists, setLists] = useState(DEFAULT_LISTS);
  const [calendar, setCalendar] = useState({ holidays: [], leaveDays: [] });
  const [links, setLinks] = useState([]);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [synced, setSynced] = useState(false);
  const tasksRef = useRef([]);

  useEffect(() => onAuthStateChanged(getAuth(firebaseApp()), (u) => { setUser(u); if (!u) { setTaskMap({}); setSynced(false); } }), []);

  useEffect(() => {
    if (!user) return undefined;
    const db = getFirestore(firebaseApp());
    const onErr = (e) => setError(e?.message || String(e));
    const un1 = onSnapshot(collection(db, 'users', user.uid, 'tasks'), (snap) => {
      setTaskMap((m) => {
        const next = { ...m };
        snap.docChanges().forEach((ch) => { if (ch.type === 'removed') delete next[ch.doc.id]; else next[ch.doc.id] = fromDoc(ch.doc.id, ch.doc.data()); });
        return next;
      });
      setSynced(!snap.metadata.fromCache);
    }, onErr);
    const un2 = onSnapshot(collection(db, 'users', user.uid, 'meta'), (snap) => {
      snap.docChanges().forEach((ch) => {
        if (ch.type === 'removed') return;
        const d = ch.doc.data() || {};
        if (ch.doc.id === 'lists') setLists(readLists(d.lists));
        if (ch.doc.id === 'calendar') setCalendar(readCalendar(d));
        if (ch.doc.id === 'tools') setLinks(readLinks(d));
      });
    }, onErr);
    return () => { un1(); un2(); };
  }, [user]);

  const tasks = useMemo(() => Object.values(taskMap).filter((t) => !t.purged), [taskMap]);
  tasksRef.current = tasks;

  const flash = useCallback((m) => { setNote(m); setTimeout(() => setNote(''), NOTE_MS); }, []);
  const actions = useMemo(() => {
    const commit = (t) => {
      if (!user) return;
      setError('');
      setDoc(doc(getFirestore(firebaseApp()), 'users', user.uid, 'tasks', String(t.id)), toDoc(t), { merge: true }).catch((e) => setError(e?.message || String(e)));
    };
    return makeActions(commit, () => tasksRef.current, flash);
  }, [user, flash]);

  const value = useMemo(() => ({
    demo: false, user, tasks, lists, calendar, links, error, synced, actions,
    signIn: async () => { setError(''); try { await signInWithPopup(getAuth(firebaseApp()), new GoogleAuthProvider()); } catch (e) { setError(e?.code === 'auth/unauthorized-domain' ? `This web address is not allowed to sign in yet. Firebase console -> Authentication -> Settings -> Authorized domains -> add ${location.hostname}.` : (e?.message || String(e))); } },
    signOut: () => signOut(getAuth(firebaseApp())),
  }), [user, tasks, lists, calendar, links, error, synced, actions]);

  return <Ctx.Provider value={value}>{children}<Toast note={note} /></Ctx.Provider>;
}

export function DemoStore({ children }) {
  const [tasks, setTasks] = useState(demoTasks);
  const [note, setNote] = useState('');
  const ref = useRef(tasks);
  ref.current = tasks;
  const flash = useCallback((m) => { setNote(m); setTimeout(() => setNote(''), NOTE_MS); }, []);
  const actions = useMemo(() => {
    const commit = (t) => setTasks((list) => (list.some((x) => x.id === t.id) ? list.map((x) => (x.id === t.id ? t : x)) : [...list, t]));
    return makeActions(commit, () => ref.current, flash);
  }, [flash]);
  const visible = useMemo(() => tasks.filter((t) => !t.purged), [tasks]);
  const calendar = useMemo(() => ({ holidays: [{ date: '2026-10-20', name: 'Sample holiday' }], leaveDays: [] }), []);
  const links = useMemo(() => [{ id: '1', title: 'Firebase console', url: 'https://console.firebase.google.com', folder: 'Work' }, { id: '2', title: 'Gmail', url: 'https://mail.google.com', folder: '' }], []);
  const value = useMemo(() => ({
    demo: true, user: { displayName: 'Demo user', email: 'demo@example.com' }, tasks: visible, lists: DEFAULT_LISTS, calendar, links, error: '', synced: true, actions,
    signIn: () => {}, signOut: () => { location.search = ''; },
  }), [visible, calendar, links, actions]);
  return <Ctx.Provider value={value}>{children}<Toast note={note} /></Ctx.Provider>;
}

export { isOpen };
