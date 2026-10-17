/**
 * Google Sign-In + Firestore realtime sync - the same `users/{uid}/tasks` +
 * `users/{uid}/meta/{lists,calendar}` shape the web app's `rt` object
 * already uses in the "work-tracker-3b728" Firebase project, so a
 * phone and the web app can share entries live. The Apps Script/Sheets
 * sync (src/cloudSync.js) stays in independently, the same backup role it
 * has on the web app.
 *
 * Every Firestore/auth call lives here, kept separate from
 * firebaseSyncCore.js's pure merge/ack logic so that part stays unit
 * tested without a network or a signed-in device.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApp } from '@react-native-firebase/app';
import { getAuth, onAuthStateChanged, signInWithCredential, signOut as fbSignOut, GoogleAuthProvider } from '@react-native-firebase/auth';
import { getFirestore, collection, doc, onSnapshot, getDocs, writeBatch } from '@react-native-firebase/firestore';
import * as firestoreApi from '@react-native-firebase/firestore';      // arrayUnion: not every build (the web shim) has it, so it is read off the namespace
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { dirtyEntries, ackAfterPush, ackAfterSnapshot, mergeRemoteEntries, applyRemovedIds, isMetaDirty, decodeLists, encodeLists, decodeCalendar, mergeListsForPush, ackKey, snapKey, docHashes, diffWebDoc, createMutator, raceTimeout } from './firebaseSyncCore';
import { toWebTask } from './cloudSync';

// This project's own Firebase Android app (work-tracker-3b728), the
// "Web" OAuth client Google Sign-In needs regardless of platform.
const WEB_CLIENT_ID = '872088776442-j180sk5pe8ubl9igmd0k28a02t7n1g2n.apps.googleusercontent.com';

let configured = false;
function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });
  configured = true;
}

export async function signInWithGoogle() {
  ensureConfigured();
  await GoogleSignin.hasPlayServices();
  const res = await GoogleSignin.signIn();
  if (!isSuccessResponse(res)) throw new Error('Sign-in was cancelled.');
  if (!res.data.idToken) throw new Error('Google did not return an ID token - check the Web client ID in Firebase matches this app.');
  const credential = GoogleAuthProvider.credential(res.data.idToken);
  const userCredential = await signInWithCredential(getAuth(getApp()), credential);
  return userCredential.user;
}

/**
 * A Google access token with `scopes` for the signed-in person (e.g. Gmail for Fetch Mail). Google asks them once
 * to allow the extra access; after that it is given without asking.
 */
export async function getGoogleAccessToken(scopes = []) {
  ensureConfigured();
  if (!GoogleSignin.getCurrentUser()) {
    const res = await GoogleSignin.signInSilently();
    if (res?.type !== 'success') throw new Error('Sign in with Google first (Config → Realtime Sync).');
  }
  const granted = GoogleSignin.getCurrentUser()?.scopes || [];
  if (!scopes.every((x) => granted.includes(x))) {
    const res = await GoogleSignin.addScopes({ scopes });
    if (!res) throw new Error('Access was not allowed.');
  }
  const { accessToken } = await GoogleSignin.getTokens();
  if (!accessToken) throw new Error('Google did not return an access token.');
  return accessToken;
}

export async function signOutOfGoogle() {
  try { await fbSignOut(getAuth(getApp())); } catch { /* already signed out */ }
  try { await GoogleSignin.signOut(); } catch { /* nothing to sign out of */ }
}

/** Fires once immediately with the current user (or null), then on every sign-in/out. */
export function watchAuthState(cb) {
  ensureConfigured();
  return onAuthStateChanged(getAuth(getApp()), cb);
}

// Firestore's own ceiling is 500 writes per batch; stay under it.
const BATCH_LIMIT = 400;
const chunksOf = (list, size) => {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
};

// A write that cannot reach the server (no signal) never settles: Firestore keeps it queued and sends it later. The
// caller is told "offline" after this long, and tries again; the queued write is not cancelled (setting it twice is harmless).
const COMMIT_TIMEOUT_MS = 15000;
const commit = (batch) => raceTimeout(batch.commit(), COMMIT_TIMEOUT_MS, 'offline - will retry');

// How the web app stores its lists document, and what it last held - learned from what it sent.
const metaFormats = { lists: null };
// listsMissing: the account has no lists document at all - a new account, set up on its first sign-in.
const remoteMeta = { lists: null, listsMissing: false };
export const __setMetaFormats = (f, lists = null, listsMissing = false) => { Object.assign(metaFormats, f); remoteMeta.lists = lists; remoteMeta.listsMissing = listsMissing; };     // tests
async function loadAck(uid) {
  try { return JSON.parse(await AsyncStorage.getItem(ackKey(uid))) || {}; } catch { return {}; }
}
async function saveAck(uid, ack) {
  try { await AsyncStorage.setItem(ackKey(uid), JSON.stringify(ack)); } catch { /* retried on the next push/snapshot */ }
}
async function loadSnap(uid) {
  try { return JSON.parse(await AsyncStorage.getItem(snapKey(uid))) || {}; } catch { return {}; }
}
async function saveSnap(uid, snap) {
  try { await AsyncStorage.setItem(snapKey(uid), JSON.stringify(snap)); } catch { /* the next push sends the whole entry again */ }
}
// The acknowledgement map and the per-entry snapshot (what the server holds, field by field) have several writers:
// the live listener, the background pull and every push. Each change is reloaded, applied and saved in turn, so one
// writer never saves over another's update.
const mutateAck = createMutator(loadAck, saveAck);
const mutateSnap = createMutator(loadSnap, saveSnap);
/** Remembers the server's copy of these documents (and forgets removed ones), for the next push's field diff. */
const rememberDocs = (uid, docs, removedIds = []) => mutateSnap(uid, (s) => {
  const next = { ...s };
  docs.forEach((d) => { if (d && d.id !== undefined && d.id !== null) next[String(d.id)] = docHashes(d); });
  removedIds.forEach((id) => { delete next[String(id)]; });
  return next;
}).catch(() => {});

/**
 * Subscribes to one signed-in user's Firestore data. `getEntries()` returns
 * the current local entries array (read fresh on every snapshot, not
 * captured once); `onRemoteChange(patch)` is called with whichever of
 * `{ remote: { incoming, removedIds } }`, `{ lists, listsUpdatedAt }` or `{ calendar }`,
 * to merge into the store. Returns an unsubscribe function.
 */
export function listen(uid, { getEntries, getTombstones = () => [], onRemoteChange, onError }) {
  // What was learned about the previous account's lists document does not carry over to this one.
  remoteMeta.lists = null;
  remoteMeta.listsMissing = false;
  metaFormats.lists = null;
  const db = getFirestore(getApp());
  const tasksCol = collection(db, 'users', uid, 'tasks');
  const metaCol = collection(db, 'users', uid, 'meta');

  const unsubTasks = onSnapshot(tasksCol, { includeMetadataChanges: true }, (snap) => {
    const incoming = [];
    const removedIds = [];
    snap.docChanges().forEach((ch) => {
      if (ch.type === 'removed') { if (!ch.doc.metadata.hasPendingWrites) removedIds.push(ch.doc.id); return; }
      const raw = ch.doc.data();
      if (!raw) return;
      const d = raw.id ? raw : { ...raw, id: ch.doc.id };
      if (d.purged === true) { removedIds.push(String(d.id)); return; }    // deleted forever on the web app
      incoming.push(d);
    });
    if (!incoming.length && !removedIds.length) return;
    const current = getEntries();
    const afterRemoval = applyRemovedIds(current, removedIds);
    const merged = mergeRemoteEntries(afterRemoval.entries, incoming, getTombstones());
    mutateAck(uid, (a) => ackAfterSnapshot(a, incoming, merged.entries)).catch(() => {});
    rememberDocs(uid, incoming, removedIds);
    // Hand over what arrived, not a finished list: the caller merges it into the entries as they are
    // when it is applied, so an edit made in the meantime is not overwritten by a stale copy.
    onRemoteChange({ remote: { incoming, removedIds } });
  }, (e) => { if (onError) onError(e); });

  const unsubMeta = onSnapshot(metaCol, (snap) => {
    snap.docChanges().forEach((ch) => {
      if (ch.type === 'removed') return;
      const d = ch.doc.data() || {};
      if (ch.doc.id === 'lists' && d.lists) {
        const { lists, format, extra } = decodeLists(d.lists);
        if (format) metaFormats.lists = format;
        if (lists) { remoteMeta.lists = lists; onRemoteChange({ lists, listsUpdatedAt: d.ts, paymentLists: extra }); }
        else if (extra && Object.keys(extra).length) onRemoteChange({ paymentLists: extra });
      }
      if (ch.doc.id === 'calendar') {
        // The web app writes { holidays, leaveDays, customCalendars, ts } at the top of the document; an older
        // shape kept them under `calendar`. Only that older shape was read, so the web app's holidays and
        // leave days never reached the phone.
        if (d.calendar) {
          const { calendar } = decodeCalendar(d.calendar);
          if (calendar) onRemoteChange({ calendar, calendarUpdatedAt: d.ts });
        } else if (Array.isArray(d.holidays)) {
          onRemoteChange({ calendar: { holidays: d.holidays, leaveDays: d.leaveDays || [] }, calendarUpdatedAt: d.ts });
        }
      }
      if (ch.doc.id === 'tools') onRemoteChange({ tools: d });             // web tools: links, AI report instructions
      if (ch.doc.id === 'presence') onRemoteChange({ presence: d });       // the web app's "in use" note
    });
    // A new account (first sign-in): no lists document yet. Its lists are written from this device's (the default
    // categories, priorities, statuses and people), so it starts ready on every device. Only once the server has
    // answered - an empty cache says nothing about the account.
    if (snap.metadata && !snap.metadata.fromCache && Array.isArray(snap.docs) && !snap.docs.some((x) => x.id === 'lists') && !remoteMeta.lists) {
      remoteMeta.lists = [[], [], [], []];
      metaFormats.lists = metaFormats.lists || 'named';
      remoteMeta.listsMissing = true;
      onRemoteChange({ newAccount: true });
    }
  }, (e) => { if (onError) onError(e); });

  return () => { unsubTasks(); unsubMeta(); };
}

/**
 * The web app's "in use" note, read by the phone (see webActiveUntil in firebaseSyncCore.js): { webActiveAt, lastInputAt }
 * in ms. While it is fresh the phone keeps its task alerts silent; web.app writes it as long as it is open and used.
 */
export async function pushPresence(uid, note) {
  if (!uid) return false;
  const db = getFirestore(getApp());
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid, 'meta', 'presence'), { webActiveAt: Number(note?.webActiveAt) || 0, lastInputAt: Number(note?.lastInputAt) || 0 }, { merge: true });
  await commit(batch);
  return true;
}

/**
 * This phone's push token (users/<uid>/meta/devices { tokens }), so the server function in functions/index.js can wake it
 * when a task changes (instant sync, docs/INSTANT_SYNC.md). Read-add-write: tokens of the account's other phones stay.
 */
export async function saveDeviceToken(uid, token) {
  if (!uid || !token) return false;
  const db = getFirestore(getApp());
  const union = firestoreApi.arrayUnion;
  if (typeof union === 'function') {
    // Added on the server side: another phone registering at the same moment keeps its token.
    const b = writeBatch(db);
    b.set(doc(db, 'users', uid, 'meta', 'devices'), { tokens: union(token), updatedAt: Date.now() }, { merge: true });
    await commit(b);
    return true;
  }
  const snap = await getDocs(collection(db, 'users', uid, 'meta'));
  const cur = snap.docs.find((d) => d.id === 'devices');
  const tokens = Array.isArray(cur && cur.data() && cur.data().tokens) ? cur.data().tokens : [];
  if (tokens.includes(token)) return true;
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid, 'meta', 'devices'), { tokens: [...tokens, token].slice(-8), updatedAt: Date.now() }, { merge: true });
  await commit(batch);
  return true;
}

/** web.app's Links and the AI report instructions, written to meta/tools so every device of the account has them. */
export async function pushTools(uid, { stamps = {}, ts = Date.now(), ...values }) {
  if (!uid) return false;
  const db = getFirestore(getApp());
  const batch = writeBatch(db);
  batch.set(doc(db, 'users', uid, 'meta', 'tools'), { ...values, stamps, ts }, { merge: true });
  await commit(batch);
  return true;
}

/**
 * One read of the signed-in account's tasks, for the background alert refresh: with the app closed no live listener
 * runs, so an edit made on the web app would otherwise reach the phone only when the app is next opened - and the
 * phone's booked alerts (and their Done buttons) would still be the old ones. Returns { incoming, removedIds } for the
 * caller to merge into the entries as they are then, or null when nobody (or another account) is signed in.
 * The acknowledgement is updated as for a live snapshot, so what was only received is not sent back.
 */
export async function pullTasksIfSignedIn(accountUid, localEntries = [], tombstones = []) {
  ensureConfigured();
  const user = getAuth(getApp()).currentUser;
  if (!user || !accountUid || user.uid !== accountUid) return null;
  const snap = await getDocs(collection(getFirestore(getApp()), 'users', user.uid, 'tasks'));
  const incoming = [];
  const removedIds = [];
  snap.docs.forEach((d) => {
    const raw = d.data();
    if (!raw) return;
    const doc2 = raw.id ? raw : { ...raw, id: d.id };
    if (doc2.purged === true) removedIds.push(String(doc2.id)); else incoming.push(doc2);
  });
  const merged = mergeRemoteEntries(applyRemovedIds(localEntries, removedIds).entries, incoming, tombstones);
  await mutateAck(user.uid, (a) => ackAfterSnapshot(a, incoming, merged.entries));
  await rememberDocs(user.uid, incoming, removedIds);
  return { incoming, removedIds };
}

/**
 * Pushes whatever changed locally since the last successful push. Cheap to
 * call often (e.g. after every local edit, debounced by the caller) - it's
 * a no-op when nothing is dirty.
 */
/**
 * Sends changed entries straight away when someone is signed in - for actions taken with the app closed. Only when
 * the stored data is that account's (`accountUid`, account.js): never into another account's space.
 */
export async function pushIfSignedIn(entries = [], accountUid = null) {
  const user = getAuth(getApp()).currentUser;
  if (!user || user.uid !== accountUid) return false;
  await push(user.uid, { entries });
  return true;
}

export async function push(uid, { entries = [], lists, extraLists, listsUpdatedAt = 0, deletedIds = [] }) {
  const ack = await loadAck(uid);
  const dirty = dirtyEntries(entries, ack);
  // Lists are written only once the web app's lists document has been read this session (its format
  // and contents), and then as they are on this device, so an option deleted here is deleted there too. Holidays / leave days are read from the web app but not
  // written back: its holiday records have their own shape, and a phone copy written over them could
  // lose or duplicate holidays there.
  const listsValue = lists !== undefined && remoteMeta.lists && (remoteMeta.listsMissing || isMetaDirty(listsUpdatedAt, ack.__lists))
    ? encodeLists(mergeListsForPush(lists, []), metaFormats.lists, extraLists) : undefined;
  const listsDirty = listsValue !== undefined;
  if (!dirty.length && !deletedIds.length && !listsDirty) return { deleted: [] };

  const db = getFirestore(getApp());
  // Firestore refuses a batch of more than 500 writes, so a first sign-in with a big register
  // (every entry dirty) failed on every push and never synced. Written in chunks instead, each
  // acked as soon as it lands so a failure part-way only re-sends what did not make it.
  let next = { ...ack };
  for (const part of chunksOf(dirty, BATCH_LIMIT)) {
    const batch = writeBatch(db);
    // In the web app's own field names, merged so its fields the phone does not know are kept.
    part.forEach((e) => batch.set(doc(db, 'users', uid, 'tasks', String(e.id)), JSON.parse(JSON.stringify(toWebTask(e))), { merge: true }));
    await batch.commit();
    next = ackAfterPush(next, part);
    await saveAck(uid, next);
  }
  for (const part of chunksOf(deletedIds, BATCH_LIMIT)) {
    const batch = writeBatch(db);
    part.forEach((id) => batch.delete(doc(db, 'users', uid, 'tasks', String(id))));
    await batch.commit();
  }
  if (listsDirty) {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', uid, 'meta', 'lists'), { lists: listsValue, ts: listsUpdatedAt || Date.now() }, { merge: true });
    if (remoteMeta.listsMissing) {
      // Who the account is and when it started using the tool - for the owner's own reference.
      const user = getAuth(getApp()).currentUser;
      batch.set(doc(db, 'users', uid, 'meta', 'profile'), { email: user?.email || '', name: user?.displayName || '', createdAt: Date.now(), app: 'Working Dashboard' }, { merge: true });
    }
    await batch.commit();
    remoteMeta.listsMissing = false;
    next.__lists = listsUpdatedAt;
    await saveAck(uid, next);
  }
  return { deleted: deletedIds };       // the caller can now forget these tombstones
}
