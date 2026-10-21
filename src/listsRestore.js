/**
 * Putting the entry form lists (categories, priorities, statuses, pending with), the Sub Categories, the narration types, the
 * Next-reminder categories and the report formats back
 * from one of the phone's old daily backups (<documents>/auto-backup/auto-YYYY-MM-DD.json, written until the auto backup was
 * removed on 17 Oct 2026), or - with no backup - rebuilding the Sub Categories from the tasks that use them. Pure, so it is tested.
 */
const arr = (v) => (Array.isArray(v) ? v : []);
const norm = (s) => String(s ?? '').trim().toLowerCase();
const nameOf = (x) => (typeof x === 'string' ? x : x && x.name);

/** What a backup file (parsed) holds of these lists. */
export function backupLists(json) {
  const w = (json && json.data && json.data.workingDashboard) || {};
  return {
    savedAt: (json && json.exportedAt) || '',
    categories: arr(w.categories),
    priorities: arr(w.priorities),
    statuses: arr(w.statuses),
    pendingWith: arr(w.assignees).length ? arr(w.assignees) : arr(w.pendingWith),       // the phone calls it assignees, the website pendingWith
    subCategories: arr(w.subCategories).filter((x) => norm(nameOf(x))),
    subCategoryCategories: arr(w.subCategoryCategories),
    narrationTypes: arr(w.narrationTypes).filter((x) => norm(nameOf(x))),
    reminderCategories: arr(w.reminderCategories),
    reportFormats: arr(w.reportFormats).filter((f) => f && f.subCategory),
  };
}

/** The backup's items first, exactly as they were; then the ones there now that the backup does not have. */
const byName = (now, back) => [...back, ...now.filter((x) => !back.some((b) => norm(nameOf(b)) === norm(nameOf(x))))];
const union = (a, b) => { const out = []; const seen = new Set(); [...a, ...b].forEach((v) => { const k = norm(v); if (k && !seen.has(k)) { seen.add(k); out.push(v); } }); return out; };

/**
 * The patch that puts a backup's lists back. A Sub Category or narration type with the same name as one there now is put back as the
 * backup has it (its fields, its category); the ones only there now are kept; nothing is removed. Report formats only fill in the ones
 * missing now (formats edited since stay). { lists, reportFormats (or null), counts }.
 */
export function restoreFromBackup(now = {}, backup = {}) {
  const b = { subCategories: [], subCategoryCategories: [], narrationTypes: [], reminderCategories: [], categories: [], priorities: [], statuses: [], pendingWith: [], reportFormats: [], ...backup };
  const nowFormats = arr(now.reportFormats);
  const missingFormats = b.reportFormats.filter((f) => !nowFormats.some((x) => norm(x.subCategory) === norm(f.subCategory)));
  const has = (list, x) => arr(list).some((y) => norm(nameOf(y)) === norm(nameOf(x)));
  return {
    lists: {
      categories: union(b.categories, arr(now.categories)),
      priorities: union(b.priorities, arr(now.priorities)),
      statuses: union(b.statuses, arr(now.statuses)),
      pendingWith: union(b.pendingWith, arr(now.pendingWith)),
      subCategories: byName(arr(now.subCategories), b.subCategories),
      subCategoryCategories: union(b.subCategoryCategories, arr(now.subCategoryCategories)),
      narrationTypes: byName(arr(now.narrationTypes), b.narrationTypes),
      reminderCategories: union(arr(now.reminderCategories), b.reminderCategories),
    },
    reportFormats: missingFormats.length ? [...nowFormats, ...missingFormats] : null,
    counts: {
      subCategories: b.subCategories.length,
      narrationTypes: b.narrationTypes.length,
      newSubCategories: b.subCategories.filter((x) => !has(now.subCategories, x)).length,
      newNarrationTypes: b.narrationTypes.filter((x) => !has(now.narrationTypes, x)).length,
      formats: missingFormats.length,
      statuses: b.statuses.length,
      pendingWith: b.pendingWith.length,
      newOptions: ['categories', 'priorities', 'statuses', 'pendingWith'].reduce((n, k) => n + b[k].filter((v) => !arr(now[k]).some((x) => norm(x) === norm(v))).length, 0),
    },
  };
}

/**
 * With no backup: the Sub Categories the tasks use and the lists do not have, each under the category most of its tasks have, with the
 * field names those tasks filled in (a field's list of choices cannot be known from the tasks). Returns the new ones only.
 */
export function subCategoriesFromTasks(entries = [], have = []) {
  const found = new Map();
  for (const e of arr(entries)) {
    const name = String((e && e.subCategory) || '').trim();
    if (!name || arr(have).some((x) => norm(nameOf(x)) === norm(name))) continue;
    const k = norm(name);
    const cur = found.get(k) || { name, cats: {}, fields: [] };
    if (e.category) cur.cats[e.category] = (cur.cats[e.category] || 0) + 1;
    Object.keys((e.subCategoryFields && typeof e.subCategoryFields === 'object') ? e.subCategoryFields : {}).forEach((f) => { if (f.trim() && !cur.fields.some((x) => norm(x) === norm(f))) cur.fields.push(f.trim()); });
    found.set(k, cur);
  }
  return [...found.values()].map((x, i) => {
    const category = Object.entries(x.cats).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    return { id: `sc-r${Date.now().toString(36)}-${i}`, name: x.name, ...(category ? { category } : null), fields: x.fields.map((label) => ({ label })) };
  });
}

/**
 * The options the tasks use that the lists are missing: { categories, priorities, statuses, pendingWith } (only the missing ones,
 * in the order first used). `now` holds the lists as they are, pending with as `pendingWith`.
 */
export function optionsFromTasks(entries = [], now = {}) {
  const out = { categories: [], priorities: [], statuses: [], pendingWith: [] };
  const fields = { categories: 'category', priorities: 'priority', statuses: 'status', pendingWith: 'pendingWith' };
  for (const e of arr(entries)) {
    if (!e) continue;
    Object.entries(fields).forEach(([k, f]) => {
      const v = String(e[f] ?? '').trim();
      if (v && !arr(now[k]).some((x) => norm(x) === norm(v)) && !out[k].some((x) => norm(x) === norm(v))) out[k].push(v);
    });
  }
  return out;
}
