/**
 * Pure store logic: defaults, merging, and the split-key persistence layout.
 *
 * Kept free of React and JSX on purpose, so this can be imported and tested
 * under plain node. store.js re-exports everything here, so callers are
 * unaffected and keep importing from '../store'.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { warnQuiet } from './quietCatch';
import { newId } from './ids';

export const KEY = 'MPT_DB_V1';

/**
 * Single source of truth for fallback values.
 *
 * Screens must read from here rather than inlining their own `|| 60`, because
 * a scattered fallback silently disagrees with DEFAULT_DB the moment either
 * one is edited.
 */
export const DEFAULTS = {
  shiftStart: '09:30',
  shiftEnd: '19:00',
  breakMinutes: 60,
  lateGraceMinutes: 15,
  geofenceRadiusM: 150,
  stepGoal: 8000,
  smsPollSeconds: 15,
  heightCm: 170,
  weightKg: 70,
  smsPollMinutes: 15,
  firstNagAfterMin: 5,
  wtSlotMinutes: 10,
  taskRepeatMinutes: 60,
};

export const DEFAULT_DB = {
  schema: 2,
  // Personal details (Settings > profile). Height and weight are steps.heightCm / steps.weightKg.
  profile: {
    displayName: '', createdAt: null, dob: null, gender: '', bloodGroup: '', phone: '', email: '',
    emergencyName: '', emergencyPhone: '', allergies: '', conditions: '',
  },
  settings: {
    followDark: true,      // follow the phone's dark mode (Config > Appearance)
    fontLevel: 2,
    office: { lat: null, lng: null, radius: DEFAULTS.geofenceRadiusM, label: 'Office' },
    // Set by the user in Work Tracker > Config. Empty means the built-in view.
    workTrackerUrl: '',
    // Default ringtone per alert group; individual tasks can override theirs.
    ringtones: { task: 'chime', attendance: 'default' },
    // Background SMS capture stays off until a native SMS reader exists.
    // The daily "review today's expenses" alert (src/expenseReview.js).
    expenseReview: { enabled: true, time: '21:00' },
    smsAuto: {
      enabled: false,
      pollMinutes: 15,
      pollSeconds: DEFAULTS.smsPollSeconds,
    },
    /**
     * Whether a lock screen guards the app. The PIN itself is never stored
     * here - only in expo-secure-store (src/appLock.js), device-only and
     * encrypted, so it never rides along in a JSON backup file.
     */
    // setupDone: the first-launch lock setup was finished (or the lock was
    // turned off afterwards on purpose), so it is not asked for again.
    appLock: { enabled: false, biometric: false, setupDone: false },
    // Home-screen widgets: with the app lock on they show a lock unless this is on.
    widgets: { showWhenLocked: false },
  },
  attendance: {
    shiftStart: DEFAULTS.shiftStart,
    shiftEnd: DEFAULTS.shiftEnd,
    breakMinutes: DEFAULTS.breakMinutes,
    // Arriving within this many minutes of shift start is not counted late.
    lateGraceMinutes: DEFAULTS.lateGraceMinutes,
    holidays: [],
    days: {},
  },
  tasks: [],
  taskTypes: ['Task', 'Event', 'Birthday'],
  expenses: {
    txns: [],
    // Fingerprints of SMS-imported transactions the user deleted, so a rescan never brings them back.
    deletedSms: [],
    mainCategories: ['Needs', 'Wants', 'Savings'],
    // Kept for anything that still reads a single flat list (filters, search);
    // always kept as the union of spendCategories + incomeCategories.
    categories: ['Food', 'Travel', 'Bills', 'Health', 'Shopping', 'Unknown', 'Salary', 'Refund', 'Cashback', 'Interest'],
    // Spend and income use their own category lists, so picking a category on
    // a Spend never offers Salary/Refund/Cashback and vice versa.
    spendCategories: ['Food', 'Travel', 'Bills', 'Health', 'Shopping', 'Unknown'],
    incomeCategories: ['Salary', 'Refund', 'Cashback', 'Interest', 'Other'],
    paymentModes: ['UPI', 'Cash', 'Debit Card', 'Credit Card', 'Bank Transfer', 'Wallet'],
    subCategoryList: [],
    tags: [],                // none until you create one
    accounts: [
      { id: 'cash', name: 'Cash', kind: 'cash', opening: 0 },
    ],
    budgets: {},
    categoryBudgets: {},
    // Budgets per Main category (Needs/Wants/Savings), keyed the same way as
    // categoryBudgets: { [monthKey]: { [mainCategory]: amount } }.
    mainCategoryBudgets: {},
  },
  water: { goalMl: 2500, glassMl: 250, log: {}, remind: { enabled: true, everyMin: 60, from: '08:00', to: '21:00', stopAtGoal: true } },
  steps: { daily: {}, hourly: {}, goal: DEFAULTS.stepGoal, useHardware: true, heightCm: DEFAULTS.heightCm, weightKg: DEFAULTS.weightKg },

  investments: {
    txns: [],
    sips: [],
    marketData: {},
    goals: [],
    assetTypes: ['Mutual Fund', 'Stock', 'ETF', 'Gold', 'Fixed Deposit', 'PPF', 'EPF'],
    assetNames: [],
  },

  calculator: { history: [] },

  /**
   * Transactions merge across every statement uploaded, deduped by date +
   * wage-month + type + amounts, so uploading a later period's passbook adds
   * to the running ledger instead of replacing it. `imports` is just the
   * upload history for transparency; `snapshots` is kept only so an old
   * install's already-saved data isn't dropped by the merge.
   */
  epfo: { member: {}, establishment: {}, transactions: [], closingBalance: null, imports: [], snapshots: [] },

  /**
   * Patient-wise hospital records: Patient -> Doctor -> {prescriptions,
   * reports, vaccinations}. Attachments are soft copies only, kept as local
   * files (see src/attachments.js), not base64 in this JSON - the single app
   * backup in Settings embeds them as base64 only inside the export file.
   */
  healthRecords: {
    patients: [], // { id, name, relation, dob, bloodGroup, doctors: [...] }
  },

  // Vital readings judged against age-based ranges (src/healthMeasures.js). "You" are implied, not in people.
  healthMeasures: { people: [], readings: [] },

  workTracker: {
    tasks: [],
    categories: ['Payments', 'Reconciliation', 'Compliance', 'Documentation', 'Query'],
    statuses: ['Pending', 'With bank', 'In progress', 'Blocked'],
    assignees: ['Me', 'Bank', 'Accounts'],
    holidays: [],
    config: { scriptUrl: '', profileName: '', autoSync: true, slotMinutes: 10 },
    nudges: { walk: { on: false, everyMin: 60 }, water: { on: false, everyMin: 60 }, from: '10:00', to: '19:00' },
    lastSyncAt: null,
    syncState: 'idle',
  },
  meta: { lastBackupAt: null },

  /**
   * A work-item register: Dashboard/Register/Done/Holidays/Bin, ported from
   * the user's own existing web app. `entries` is a high-volume collection
   * (hundreds to thousands of rows over time) - see SLICES below. Separate
   * from the older, unused `workTracker` above rather than repurposing it,
   * since that one's categories/statuses/assignees are a different shape
   * from an earlier design and may still be sitting in an old backup file.
   */
  workingDashboard: {
    entries: [],
    categories: [],
    priorities: ['High', 'Medium', 'Low'],
    statuses: ['Not Yet Started', 'In-Progress', 'Pending'],
    assignees: [],      // a new account starts with nobody under Pending with; existing accounts keep their own list
    holidays: [],
    // web.app's Links tab: { id, title, url, folder? } - follows the account (meta/tools).
    links: [],
    // Quick add (Config > Quick Add): day-first dates, what time a date alone means ('' = all day), the word that marks a bank person, the speech language.
    quickAdd: { dateOrder: 'dmy', dateOnlyTime: '', bankWord: 'bank', speechLang: 'en-IN' },
    undoHistory: [],         // the last 25 undoable changes (Config > Recent Changes)
    narrationHistory: [],    // narrations copied for Tally (src/narrationHistory.js), this device only
    templates: [],          // task templates (src/templates.js) - follow the account with the links (meta/tools)
    reportOpts: {},         // the Report's switches: headings, Sub Category fields, pending list (defaults: on, on, off), this device only
    reportMoves: {},        // the Report's moved tasks per day ({ 'YYYY-MM-DD': { taskId: group } }), this device only
    formatSetupAt: 0,       // when the categories and sub categories the report formats need were first added automatically (once per account)
    reportFormats: [],      // report formats (src/reportFormats.js) - follow the account (meta/tools); [] = the sample formats
    reportAiNotesSummary: '',      // instructions for Rewrite with AI on the weekly / monthly summary
    reportAiNotes: '',      // instructions for Rewrite with AI (Daily Report)
    toolsStamps: {},        // when each synced tool (links, templates, AI notes, meeting mode) last changed here
    toolsUpdatedAt: 0,      // when links / reportAiNotes last changed - the newer copy wins (meta/tools)
    leaveDays: [],
    fixedActivities: [],
    activityLog: [],
    timeSlotHoldMin: 10,
    alarmRingtone: 'chime',
    // When Working Dashboard alerts ring (workingDashboard.js entryAlertPlan): warnings before the due
    // time, a full-screen alarm at it, warnings before the deadline, and the times a date-only entry
    // is announced (the evening before, the morning of).
    alerts: { dueLeadMin: [60, 15], deadline: true, fullScreen: true, followUps: true, warningsRing: false, morning: '09:30', evening: '18:00' },
    reminders: {
      walk: { enabled: false, start: '11:00', end: '19:30', everyMin: 90 },
      water: { enabled: false, start: '10:00', end: '19:30', everyMin: 60 },
    },
    paymentIntro: null, // the Report points ({ category, text }), from the website's lists; null until received
    paymentIntroDirty: false, // edited on this phone and not yet sent
    // The web app's payment lists, received with Realtime Sync (null until then - see
    // workingDashboardPayments.paymentLists for the defaults): Sub Categories with their rule fields, the
    // categories that need one when completed, and the Tally narration types.
    subCategories: null,
    fileCategories: null,       // the categories that ask for an attached PDF / image (or "Not required"); follows the account's lists
    reminderCategories: null,   // the categories that ask for a next reminder date and time (null = none yet); follows the account's lists
    subCategoryCategories: null,
    narrationTypes: null,
    // Bumped whenever categories/priorities/statuses/assignees or
    // holidays/leaveDays change locally, so firebaseSync.js's push() knows
    // the meta docs need writing ("newest timestamp wins").
    listsUpdatedAt: 0,
    calendarUpdatedAt: 0,
    // Entries deleted forever on this phone, waiting to be deleted in Firestore too. Without them
    // the cloud copy came straight back on the next sync.
    deletedIds: [],
    // Every entry ever deleted forever here, kept so a sync does not re-add it.
    purgedIds: [],
  },
};

function deepMerge(base, patch) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return patch === undefined ? base : patch;
  const out = { ...base };
  for (const k of Object.keys(patch || {})) {
    const v = patch[k];
    out[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? deepMerge(base[k] ?? {}, v) : v;
  }
  return out;
}
export { deepMerge };

/**
 * High-volume collections live under their own storage keys.
 *
 * Everything used to sit in one JSON blob that was re-serialised on every
 * write, so typing a single character into an amount field rewrote the whole
 * transaction history. These collections are the ones that actually grow
 * (roughly 1.2 MB a year between them); the remaining "core" is a few KB of
 * settings, categories and config, which is cheap to write every time.
 *
 * read()  pulls a slice out of the full object
 * write() puts one back
 */
export const SLICES = [
  { key: 'MPT_TXNS_V1',     label: 'Transactions',       empty: [], read: (d) => d.expenses?.txns,     write: (d, v) => ({ ...d, expenses: { ...d.expenses, txns: v } }) },
  { key: 'MPT_ATT_DAYS_V1', label: 'Attendance days',    empty: {}, read: (d) => d.attendance?.days,   write: (d, v) => ({ ...d, attendance: { ...d.attendance, days: v } }) },
  { key: 'MPT_STEPS_HR_V1', label: 'Step history',       empty: {}, read: (d) => d.steps?.hourly,      write: (d, v) => ({ ...d, steps: { ...d.steps, hourly: v } }) },
  { key: 'MPT_WT_TASKS_V1', label: 'Work tracker tasks', empty: [], read: (d) => d.workTracker?.tasks, write: (d, v) => ({ ...d, workTracker: { ...d.workTracker, tasks: v } }) },
  { key: 'MPT_WD_ENTRIES_V1', label: 'Working Dashboard entries', empty: [], read: (d) => d.workingDashboard?.entries, write: (d, v) => ({ ...d, workingDashboard: { ...d.workingDashboard, entries: v } }) },
];

/** The object minus every slice - what gets written on an ordinary edit. */
export function coreOf(data) {
  let core = data;
  for (const s of SLICES) core = s.write(core, s.empty);
  return core;
}

/**
 * Tools that were removed from the app. Their data is dropped on load and on
 * restore, so an old install or an old backup file cannot bring them back.
 * (Tasks and EPFO both came back in later versions - only Hydration stays removed.)
 */
export const REMOVED_SECTIONS = ['hydration'];
/** Storage keys that belonged to removed tools, deleted on the next load. */
export const REMOVED_KEYS = ['MPT_HYD_LOG_V1'];

/** Working Dashboard settings that belonged to removed features (the Google Apps Script / Sheet sync). Stopped being read; dropped when stored data is loaded or restored. */
export const REMOVED_WD_FIELDS = ['cloudSyncUrl', 'lastSheetPullAt', 'reportSamplesLocal'];

export function withoutRemoved(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  for (const k of REMOVED_SECTIONS) delete out[k];
  if (out.workingDashboard && typeof out.workingDashboard === 'object') {
    out.workingDashboard = { ...out.workingDashboard };
    for (const k of REMOVED_WD_FIELDS) delete out.workingDashboard[k];
  }
  return out;
}

/** Stitches the core and the slice keys back into one object for the UI. */
export function assemble(core, slices) {
  let out = deepMerge(DEFAULT_DB, withoutRemoved(core) || {});
  for (const s of SLICES) {
    const v = slices[s.key];
    if (v !== undefined && v !== null) out = s.write(out, v);
  }
  return out;
}

/**
 * JSON.parse that cannot take the whole app down. A damaged value is kept
 * aside (`corrupt`) instead of being thrown away, because the next ordinary
 * edit would otherwise overwrite it with an empty default and lose whatever
 * could still have been recovered by hand.
 */
function safeParse(raw, key, corrupt) {
  if (raw == null) return null;
  try { return JSON.parse(raw); } catch { corrupt[key] = raw; return null; }
}

/** The core must be a plain object; anything else (a string, a number, an array) is kept aside as damaged. */
function parseCore(raw, corrupt) {
  const v = safeParse(raw, KEY, corrupt);
  if (v === null || (typeof v === 'object' && !Array.isArray(v))) return v;
  corrupt[KEY] = raw;
  return null;
}

/* ---------- large values, stored in pieces ---------- */

/**
 * Android's AsyncStorage reads each value through a 2 MB cursor window, so a
 * collection that grew past that (a few years of transactions or register
 * entries) could no longer be read at all - the app opened on "Your data
 * couldn't be opened". A value longer than this is written as numbered
 * pieces, with a small manifest under its own key naming them. Characters,
 * not bytes: 400k characters stay under 2 MB even at 4 bytes each.
 */
export const CHUNK_CHARS = 400000;
const CHUNK_MARK = '{"__chunks":';
const chunkKey = (key, gen, i) => `${key}__${gen}_${i}`;
const isChunkOf = (key) => (k) => k.startsWith(`${key}__`);
// Keys known to have pieces in storage, so an ordinary save of short values skips the stale-piece sweep.
const pieced = new Set();
const readManifest = (raw) => {
  if (typeof raw !== 'string' || !raw.startsWith(CHUNK_MARK)) return null;
  try { const m = JSON.parse(raw); return Number(m.__chunks) > 0 && m.gen ? m : null; } catch { return null; }
};

/** A short fingerprint of a damaged value, to tell "the same damaged copy as last launch" from a new one. */
export function rawSig(raw) {
  const str = String(raw ?? '');
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h * 33) ^ str.charCodeAt(i)) >>> 0;
  return `${str.length}:${h.toString(36)}`;
}

/**
 * Which recovery copies (MPT_CORRUPT_<key>_<time>) to write for the damaged values found at launch. A value that
 * stays damaged is copied once, not at every launch; at most `max` copies per key are kept (`drop` lists the older
 * ones to remove). `seen` is { key: { sig, copies } } as saved last time; the new one is returned.
 */
export function corruptCopyPlan(damaged = [], seen = {}, stamp = Date.now(), max = 3, existingKeys = []) {
  const writes = [];
  const drop = [];
  const next = { ...(seen || {}) };
  damaged.forEach(([k, raw]) => {
    const cur = (seen && seen[k]) || { sig: '', copies: [] };
    // Copies a previous app version left (no ledger entry) count too, so they are pruned as well: <prefix><digits>, oldest first.
    const prefix = `MPT_CORRUPT_${k}_`;
    const known = new Set(cur.copies || []);
    const adopted = (existingKeys || []).filter((n) => typeof n === 'string' && n.startsWith(prefix) && /^\d+$/.test(n.slice(prefix.length)) && !known.has(n))
      .sort((x, y) => Number(x.slice(prefix.length)) - Number(y.slice(prefix.length)));
    const copies = [...adopted, ...(cur.copies || [])];
    const sig = rawSig(raw);
    if (cur.sig !== sig) {
      const name = `${prefix}${stamp}`;
      writes.push([name, raw]);
      copies.push(name);
    }
    while (copies.length > max) drop.push(copies.shift());
    if (cur.sig !== sig || adopted.length || drop.length) next[k] = { sig, copies };
  });
  return { writes, drop, seen: next };
}

/** Pairs for one value: as it is when short, else the pieces and then the manifest (written last). */
export function chunkPairs(key, json, gen = Date.now().toString(36)) {
  if (typeof json !== 'string' || json.length <= CHUNK_CHARS) return [[key, json]];
  const pairs = [];
  for (let i = 0, n = 0; i < json.length; i += CHUNK_CHARS, n++) pairs.push([chunkKey(key, gen, n), json.slice(i, i + CHUNK_CHARS)]);
  pairs.push([key, JSON.stringify({ __chunks: pairs.length, gen, length: json.length })]);
  return pairs;
}

/**
 * multiGet that puts pieced values back together. Each piece is read on its
 * own, so no single read comes near the limit. A piece that is missing
 * leaves the value as an unreadable string, kept aside like any damaged one.
 */
export async function readStored(keys) {
  const pairs = await AsyncStorage.multiGet(keys);
  const out = [];
  for (const [k, raw] of pairs) {
    const m = readManifest(raw);
    if (!m) { out.push([k, raw]); continue; }
    pieced.add(k);
    const parts = [];
    for (let i = 0; i < m.__chunks; i++) parts.push(await AsyncStorage.getItem(chunkKey(k, m.gen, i)));
    out.push([k, parts.every((p) => typeof p === 'string') ? parts.join('') : `${raw} (pieces missing)`]);
  }
  return out;
}

/**
 * multiSet for values that may be long. New pieces go in before the manifest
 * that names them, and older pieces are removed only after, so a write cut
 * short leaves the previous copy readable.
 */
let writeQueue = Promise.resolve();
export function writeStored(pairs) {
  // One write at a time: a save's sweep must never see - and remove - another save's new pieces.
  const run = writeQueue.then(() => writeStoredNow(pairs));
  writeQueue = run.catch(warnQuiet('storeCore'));
  return run;
}

async function writeStoredNow(pairs) {
  const gen = Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const pieces = [];
  const heads = [];
  const keep = new Set();
  for (const [k, v] of pairs) {
    const ps = chunkPairs(k, v, gen);
    ps.slice(0, -1).forEach((p) => { pieces.push(p); keep.add(p[0]); });
    heads.push(ps[ps.length - 1]);
  }
  for (const p of pieces) await AsyncStorage.setItem(p[0], p[1]);   // one piece per write, each under the limit
  await AsyncStorage.multiSet(heads);
  const swept = pairs.map(([k]) => k).filter((k) => pieced.has(k) || heads.some(([h, v]) => h === k && readManifest(v)));
  if (!swept.length) return;
  const all = AsyncStorage.getAllKeys ? await AsyncStorage.getAllKeys().catch(() => []) : [];
  const stale = all.filter((k) => swept.some((key) => isChunkOf(key)(k)) && !keep.has(k));
  if (stale.length) await AsyncStorage.multiRemove(stale).catch(warnQuiet('storeCore'));
  swept.forEach((k) => (heads.some(([h, v]) => h === k && readManifest(v)) ? pieced.add(k) : pieced.delete(k)));
}

/** The sync bookkeeping keys: per account (ack map, server snapshot, unsent-edits copy) and the corrupt-copy ledger. */
export const SYNC_STATE_PREFIXES = ['MPT_RT_ACK_', 'MPT_RT_SNAP_', 'MPT_UNSYNCED_'];
export const CORRUPT_SEEN_KEY = 'MPT_CORRUPT_SEEN';
/** Of `allKeys`: the sync bookkeeping, and with `withCorrupt` the recovery copies (MPT_CORRUPT_*) as well. */
export function syncStateKeys(allKeys = [], { withCorrupt = true, withUnsynced = true } = {}) {
  return allKeys.filter((k) => typeof k === 'string' && (
    SYNC_STATE_PREFIXES.some((p) => k.startsWith(p) && (withUnsynced || p !== 'MPT_UNSYNCED_'))
    || (withCorrupt && (k === CORRUPT_SEEN_KEY || k.startsWith('MPT_CORRUPT_')))));
}

/**
 * Every storage key belonging to these keys, pieces included - for clearing them. Clearing the main data key (the
 * "erase everything" path) also takes the sync bookkeeping and the recovery copies, which belong to that data.
 */
export async function storedKeysOf(keys) {
  const all = AsyncStorage.getAllKeys ? await AsyncStorage.getAllKeys().catch(() => []) : [];
  const out = [...keys, ...all.filter((k) => keys.some((key) => isChunkOf(key)(k)))];
  if (keys.includes(KEY)) syncStateKeys(all).forEach((k) => { if (!out.includes(k)) out.push(k); });
  return out;
}

export async function loadAll() {
  const pairs = await readStored([KEY, ...SLICES.map((s) => s.key), ...REMOVED_KEYS]);
  const map = Object.fromEntries(pairs);
  const corrupt = {};
  const core = map[KEY] ? parseCore(map[KEY], corrupt) : null;

  const slices = {};
  let migrated = false;
  // Rewriting the core (migrated) is what drops a removed tool's data from it.
  if (core && (REMOVED_SECTIONS.some((k) => k in core) || (core.workingDashboard && REMOVED_WD_FIELDS.some((k) => k in core.workingDashboard)))) migrated = true;
  if (REMOVED_KEYS.some((k) => map[k] != null)) {
    await AsyncStorage.multiRemove(REMOVED_KEYS).catch(warnQuiet('storeCore'));
  }
  for (const s of SLICES) {
    const parsed = map[s.key] ? safeParse(map[s.key], s.key, corrupt) : null;
    if (parsed !== null) {
      slices[s.key] = parsed;
    } else if (map[s.key]) {
      continue;                       // present but damaged: never "migrate" the core's empty placeholder over it
    } else if (core) {
      // Older install: the slice is still inside the main blob. Lift it out.
      const inline = s.read(core);
      if (inline !== undefined && inline !== null) { slices[s.key] = inline; migrated = true; }
    }
  }
  return { core, slices, migrated, corrupt };
}

export const uid = () => newId();

