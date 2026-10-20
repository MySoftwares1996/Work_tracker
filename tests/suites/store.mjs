import AsyncStorage from '@react-native-async-storage/async-storage';
import { SLICES, coreOf, assemble, loadAll, KEY, DEFAULT_DB, writeStored, readStored, chunkPairs, CHUNK_CHARS, storedKeysOf } from '../../src/storeCore.js';

export async function run({ ck, section }) {
  const legacy = {
    ...DEFAULT_DB,
    expenses: { ...DEFAULT_DB.expenses, txns: [{ id: 'a' }, { id: 'b' }] },
    attendance: { ...DEFAULT_DB.attendance, days: { '2026-09-19': { in: 'x' } } },
    steps: { ...DEFAULT_DB.steps, hourly: { '2026-09-19': { 9: 500 } } },
    tasks: [{ id: 'task1' }],
    taskTypes: ['Task'],
    epfo: { transactions: [{ id: 'e1' }] },
    // A removed tool: an old install still carries this.
    hydration: { log: { '2026-09-19': { total: 1500 } } },
    workTracker: { ...DEFAULT_DB.workTracker, tasks: [{ id: 't1' }] },
    profile: { displayName: 'Tester', createdAt: null },
  };
  await AsyncStorage.setItem(KEY, JSON.stringify(legacy));
  await AsyncStorage.setItem('MPT_HYD_LOG_V1', JSON.stringify({ '2026-09-19': { total: 1500 } }));

  section('Storage: migration from the single-blob layout');
  const { core, slices, migrated } = await loadAll();
  ck('migration detected', migrated === true);
  const asm = assemble(core, slices);
  ck('transactions survive', asm.expenses.txns.length === 2);
  ck('attendance days survive', !!asm.attendance.days['2026-09-19']);
  ck('step hours survive', asm.steps.hourly['2026-09-19'][9] === 500);
  ck('tasks survive (no longer a removed tool)', asm.tasks.length === 1 && asm.taskTypes.includes('Task'));
  ck('EPFO survives (no longer a removed tool)', asm.epfo.transactions.length === 1 && asm.epfo.transactions[0].id === 'e1');
  ck('hydration remains the only removed tool', !('hydration' in asm));
  ck('removed tool storage key deleted', (await AsyncStorage.getItem('MPT_HYD_LOG_V1')) == null);
  ck('work tasks survive', asm.workTracker.tasks.length === 1);
  ck('core fields survive', asm.profile.displayName === 'Tester');

  section('Storage: core excludes the bulk');
  const core2 = coreOf(asm);
  ck('txns stripped from core', core2.expenses.txns.length === 0);
  ck('days stripped from core', Object.keys(core2.attendance.days).length === 0);
  ck('settings still in core', !!core2.settings);
  ck('core smaller than full db', JSON.stringify(core2).length < JSON.stringify(asm).length);

  section('Storage: second load needs no migration');
  await AsyncStorage.multiSet([[KEY, JSON.stringify(core2)], ...SLICES.map((s) => [s.key, JSON.stringify(s.read(asm) ?? s.empty)])]);
  const second = await loadAll();
  ck('no re-migration', second.migrated === false);
  const asm2 = assemble(second.core, second.slices);
  ck('round trip identical', JSON.stringify(asm2.expenses.txns) === JSON.stringify(asm.expenses.txns));

  section('Storage: a damaged value does not wipe everything');
  await AsyncStorage.multiSet([[KEY, JSON.stringify(core2)], ...SLICES.map((s2) => [s2.key, JSON.stringify(s2.read(asm) ?? s2.empty)])]);
  await AsyncStorage.setItem('MPT_TXNS_V1', '{not json');
  const hurt = await loadAll();
  ck('loading still succeeds when one slice is damaged', hurt.core && hurt.slices['MPT_ATT_DAYS_V1'] && !hurt.slices['MPT_TXNS_V1']);
  ck('the damaged text is handed back so it can be kept', hurt.corrupt['MPT_TXNS_V1'] === '{not json');
  await AsyncStorage.setItem(KEY, 'also {broken');
  const hurtCore = await loadAll();
  ck('a damaged core is reported, not thrown', hurtCore.core === null && hurtCore.corrupt[KEY] === 'also {broken');
  await AsyncStorage.multiSet([[KEY, JSON.stringify(core2)], ...SLICES.map((s2) => [s2.key, JSON.stringify(s2.read(asm) ?? s2.empty)])]);
}

export async function runExtra({ ck, section }) {
  section('Storage: a core that is valid JSON but not an object is treated as damaged');
  for (const raw of ['"just a string"', '42', '[1,2]']) {
    await AsyncStorage.setItem(KEY, raw);
    let res; let threw = null;
    try { res = await loadAll(); } catch (e) { threw = e; }
    ck(`core ${raw} loads without throwing and is kept aside`, !threw && res.core === null && res.corrupt[KEY] === raw, threw && threw.message);
  }
  await AsyncStorage.removeItem(KEY);

  section('Storage: a collection past Android\'s 2 MB read limit is stored in pieces');
  ck('a short value is stored as it is', chunkPairs('K', '[1]').length === 1);
  const txns = Array.from({ length: 9000 }, (_, i) => ({ id: `t${i}`, amount: i, party: `Payee number ${i} with a long enough name`, at: '2026-10-01T10:00:00.000Z', note: 'x'.repeat(60) }));
  const big = JSON.stringify(txns);
  await writeStored([[KEY, JSON.stringify({ profile: { displayName: 'A' } })], ['MPT_TXNS_V1', big]]);
  const keys = Object.keys((await AsyncStorage.getAllKeys()).reduce((o, k) => ({ ...o, [k]: 1 }), {}));
  const pieces = keys.filter((k) => k.startsWith('MPT_TXNS_V1__'));
  ck('it is split into pieces each under the limit', big.length > CHUNK_CHARS && pieces.length === Math.ceil(big.length / CHUNK_CHARS)
    && (await Promise.all(pieces.map((k) => AsyncStorage.getItem(k)))).every((v) => v.length <= CHUNK_CHARS));
  const back = await loadAll();
  ck('and loads back whole', Array.isArray(back.slices.MPT_TXNS_V1) && back.slices.MPT_TXNS_V1.length === 9000 && back.slices.MPT_TXNS_V1[8999].id === 't8999' && !Object.keys(back.corrupt).length);
  await writeStored([['MPT_TXNS_V1', JSON.stringify([...txns, { id: 'new' }])]]);
  const after = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith('MPT_TXNS_V1__'));
  ck('a later save replaces the old pieces rather than piling up', after.length === pieces.length && !after.some((k) => pieces.includes(k)));
  ck('...and reads the new copy', (await loadAll()).slices.MPT_TXNS_V1.length === 9001);
  await Promise.all([writeStored([['MPT_TXNS_V1', big]]), writeStored([['MPT_TXNS_V1', JSON.stringify([...txns, { id: 'b' }])]])]);
  ck('two saves at once never remove each other\'s pieces', (await loadAll()).slices.MPT_TXNS_V1?.length === 9001);
  await writeStored([['MPT_TXNS_V1', '[]']]);
  ck('shrinking it back removes every piece', !(await AsyncStorage.getAllKeys()).some((k) => k.startsWith('MPT_TXNS_V1__')) && (await AsyncStorage.getItem('MPT_TXNS_V1')) === '[]');
  await writeStored([['MPT_TXNS_V1', big]]);
  const lost = (await AsyncStorage.getAllKeys()).find((k) => k.startsWith('MPT_TXNS_V1__'));
  await AsyncStorage.removeItem(lost);
  const broken = await loadAll();
  ck('a missing piece is kept aside as damaged, never read as empty', broken.corrupt.MPT_TXNS_V1 !== undefined && broken.slices.MPT_TXNS_V1 === undefined);
  ck('clearing a key also finds its pieces', (await storedKeysOf(['MPT_TXNS_V1'])).length > 1);
  ck('readStored passes short values through', (await readStored([KEY]))[0][1].includes('displayName'));
  await AsyncStorage.multiRemove(await storedKeysOf([KEY, ...SLICES.map((s) => s.key)]));
}
