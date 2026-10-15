import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { AppState } from 'react-native';
import { KEY, DEFAULT_DB, SLICES, coreOf, assemble, loadAll, deepMerge, writeStored } from './storeCore';
import { normaliseOptions } from './optionSources';
import { repairWebShapedEntries } from './cloudSync';
import { blankEntry } from './workingDashboard';
import { LoadFailed } from './ErrorBoundary';

// Pure logic lives in storeCore.js; re-exported so every existing
// `import { ... } from '../store'` keeps working unchanged.
export * from './storeCore';

const StoreCtx = createContext(null);

export function StoreProvider({ children }) {
  const [data, setData] = useState(DEFAULT_DB);
  const [ready, setReady] = useState(false);
  const writeTimer = useRef(null);
  const skipNextWrite = useRef(true);
  const lastSlices = useRef({});
  const lastCore = useRef('');
  // Set when the saved data could not be read. Nothing is written while it is,
  // or the first edit would save the empty defaults over every collection.
  const loadFailed = useRef(false);
  const [loadError, setLoadError] = useState(null);

  const [, setCrash] = useState(null);

  const load = useCallback(async () => {
    // A read can fail transiently (storage busy right after boot): try a few times before giving up.
    let res; let lastErr;
    for (let i = 0; i < 3 && !res; i++) {
      try { res = await loadAll(); } catch (e) { lastErr = e; await new Promise((r) => setTimeout(r, 400 * (i + 1))); }
    }
    if (!res) {
      console.warn('Store load failed:', lastErr?.message);
      loadFailed.current = true;
      setLoadError(lastErr?.message || 'Saved data could not be read');
      return;
    }
    loadFailed.current = false;
    setLoadError(null);
    try {
      const { core, slices, migrated, corrupt } = res;
      // A damaged entry is copied to a recovery key before anything can overwrite it.
      const damaged = Object.entries(corrupt || {});
      if (damaged.length) {
        const stamp = Date.now();
        await writeStored(damaged.map(([k, raw]) => [`MPT_CORRUPT_${k}_${stamp}`, raw])).catch(() => {});
      }
      // Repairs older data onto the single-list model; a no-op once done.
      const base = assemble(core, slices);
      // Working Dashboard entries an older version copied raw from the web app (no title, no due
      // date, open when completed) are read again from the web app's own fields.
      const wdEntries = base.workingDashboard?.entries || [];
      const repairedWd = repairWebShapedEntries(wdEntries, blankEntry());
      const assembled = normaliseOptions(repairedWd === wdEntries ? base : { ...base, workingDashboard: { ...base.workingDashboard, entries: repairedWd } });
      for (const s of SLICES) lastSlices.current[s.key] = s.read(assembled);
      setData(assembled);
      setReady(true);
      if (migrated || repairedWd !== wdEntries) {
        // Write the split layout (and any repair) once so the next load is already clean.
        await writeStored([
          [KEY, JSON.stringify(coreOf(assembled))],
          ...SLICES.map((s) => [s.key, JSON.stringify(s.read(assembled) ?? s.empty)]),
        ]).catch((e) => console.warn('Store migration write failed:', e?.message));
      }
    } catch (e) {
      // The data was read but could not be prepared: hand it to ErrorBoundary, which offers export
      // and per-collection repair, rather than carrying on with empty data that would be saved over it.
      loadFailed.current = true;
      setCrash(() => { throw e; });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  /**
   * Persist as an effect, not inside the setState updater: React may call an
   * updater more than once. Slices are compared by reference, so an edit that
   * does not touch a collection does not rewrite it.
   */
  const writeNow = useCallback(async (snapshot) => {
    if (loadFailed.current) return;
    const writes = [];
    for (const s of SLICES) {
      const cur = s.read(snapshot);
      if (cur !== lastSlices.current[s.key]) {
        writes.push([s.key, JSON.stringify(cur ?? s.empty)]);
        lastSlices.current[s.key] = cur;
      }
    }
    const coreJson = JSON.stringify(coreOf(snapshot));
    if (coreJson !== lastCore.current) {
      writes.push([KEY, coreJson]);
      lastCore.current = coreJson;
    }
    if (!writes.length) return;
    try {
      await writeStored(writes);     // a collection past ~2 MB is stored in pieces Android can read back
    } catch (e) {
      console.warn('Save failed', e?.message);
    }
  }, []);

  // The latest data, readable from the AppState handler below without re-subscribing on every edit.
  const dataRef = useRef(data);
  dataRef.current = data;

  // Edits are saved 250 ms after you stop; if the app goes to the background or is swiped away
  // inside that window the pending write would be lost, so it is flushed the moment the app leaves the screen.
  useEffect(() => {
    if (!ready) return undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') return;
      if (writeTimer.current) { clearTimeout(writeTimer.current); writeTimer.current = null; }
      writeNow(dataRef.current);
    });
    return () => sub.remove();
  }, [ready, writeNow]);

  useEffect(() => {
    if (!ready) return;
    if (skipNextWrite.current) { skipNextWrite.current = false; return; }
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => { writeNow(data); }, 250);
    return () => { if (writeTimer.current) clearTimeout(writeTimer.current); };
  }, [data, ready, writeNow]);

  const update = useCallback((updater) => {
    setData((prev) => (typeof updater === 'function' ? updater(prev) : deepMerge(prev, updater)));
  }, []);

  /**
   * `next` may be a function of the current data: a restore that waits on a dialog and on file writes
   * would otherwise apply onto the data as it was when it started, dropping steps, punches and edits
   * saved in the meantime.
   */
  const replaceAll = useCallback(async (next) => {
    if (loadFailed.current) throw new Error('Saved data could not be read, so nothing was changed. Close and reopen the app, then try again.');
    const merged = normaliseOptions(deepMerge(DEFAULT_DB, typeof next === 'function' ? next(dataRef.current) : next));
    setData(merged);
    lastCore.current = '';
    for (const s of SLICES) lastSlices.current[s.key] = undefined;
    await writeNow(merged);
    return merged;
  }, [writeNow]);

  /** Force an immediate flush - used before a backup push. */
  const flush = useCallback(async () => {
    if (writeTimer.current) clearTimeout(writeTimer.current);
    await writeNow(dataRef.current);
  }, [writeNow]);

  /**
   * Without this, `{ data, ready, update, ... }` is a brand-new object on
   * every render of this Provider - even when nothing in it actually
   * changed - and because virtually every screen and background component
   * (OfficeStatus, running on every screen) reads from this context, that
   * new reference forces the ENTIRE app to re-render every single time.
   */
  const value = React.useMemo(() => ({ data, ready, update, replaceAll, flush }), [data, ready, update, replaceAll, flush]);

  if (loadError) return <LoadFailed message={loadError} onRetry={load} />;

  return (
    <StoreCtx.Provider value={value}>
      {children}
    </StoreCtx.Provider>
  );
}

export const useStore = () => useContext(StoreCtx) || {
  data: DEFAULT_DB, ready: false, update: () => {}, replaceAll: async () => {}, flush: async () => {},
};
