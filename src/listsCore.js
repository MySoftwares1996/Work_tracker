/**
 * The Category / Sub Category / option-list helpers shared by the phone app and the website (Config > Entry form options, Sub categories). Pure.
 */

/** Sub Categories as the lists document keeps them: [{ id, name, fields: [{ label, options? }] }]; plain names are accepted too. */
export function normalizeSubCategories(list) {
  return (Array.isArray(list) ? list : [])
    .map((sc, i) => (typeof sc === 'string' ? { id: `sc-${i}-${sc}`, name: sc, fields: [] } : sc))
    .filter((sc) => sc && String(sc.name || '').trim())
    .map((sc) => ({
      ...sc, id: String(sc.id || `sc-${sc.name}`), name: String(sc.name), category: String(sc.category || ''),
      fields: (Array.isArray(sc.fields) ? sc.fields : []).filter((f) => f && String(f.label || '').trim()).map((f) => ({ ...f, label: String(f.label), options: Array.isArray(f.options) ? f.options.map(String) : undefined })),
    }));
}
// Without a list of its own, the phone app carries a Sub Category on duty, demand draft and the domestic / urgent / import payment categories.
const defaultCarries = (c) => /duty/i.test(c) || /demand\s*draft/i.test(c) || (/payment/i.test(c) && /(domestic|urgent|import)/i.test(c));
/** The Sub Categories offered under a category: its own, plus any with no category of their own (made before they were grouped). */
export const subCategoriesFor = (lists, cat) => (lists.subCategories || []).filter((x) => !x.category || x.category === cat);
/** A category carries a Sub Category when it has some of its own, or the lists name it (or, with no such list, the phone's default). */
export const categoryCarriesSubCategory = (lists, cat) => !!cat && subCategoriesFor(lists, cat).length > 0 && ((lists.subCategories || []).some((x) => x.category === cat) || (Array.isArray(lists.subCategoryCategories) ? lists.subCategoryCategories.includes(cat) : defaultCarries(String(cat))));
export const findSubCategory = (lists, name) => (lists.subCategories || []).find((x) => x.name === name) || null;
/** The message to show before a task is marked Completed without its Sub Category, or ''. */
export function subCategoryMissing(t, lists) {
  if (!categoryCarriesSubCategory(lists, t.category)) return '';
  if (!t.subCategory) return 'Select a Sub Category before marking this Completed.';
  const sc = findSubCategory(lists, t.subCategory);
  const missing = sc ? sc.fields.filter((f) => !String((t.subCategoryFields || {})[f.label] || '').trim()) : [];
  return missing.length ? `Fill all the Sub Category fields before marking this Completed - missing: ${missing.map((f) => String(f.label).replace(/[\s:]+$/, '')).join(', ')}.` : '';
}
/** Adds one Sub Category under a category. A name is kept once across all categories, because a task stores only the name. */
export function addSubCategory(list, name, labels = [], category = '') {
  const n = String(name || '').trim();
  if (!n || list.some((x) => x.name.toLowerCase() === n.toLowerCase())) return list;
  const fields = labels.map((l) => String(l).trim()).filter(Boolean).map((label) => ({ label }));
  return [...list, { id: `sc-${Date.now().toString(36)}-${list.length}`, name: n, category: String(category || ''), fields }];
}
/** Pasted lines -> [{ name, labels }]. A line is "Name" or "Name: Field A, Field B". */
export function parseSubCategoryLines(text) {
  return String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    const at = line.indexOf(':');
    return at < 0 ? { name: line, labels: [] } : { name: line.slice(0, at).trim(), labels: line.slice(at + 1).split(',') };
  }).filter((x) => x.name);
}
/** Adds many at once; returns the new list and how many were new. */
export function addSubCategories(list, items, category = '') {
  let out = list;
  items.forEach((it) => { out = addSubCategory(out, it.name, it.labels, category); });
  return { list: out, added: out.length - list.length };
}
/** The list of categories the lists name as carrying a Sub Category, with this one added. */
export const withCarrying = (lists, cat) => {
  const now = Array.isArray(lists.subCategoryCategories) ? lists.subCategoryCategories : (lists.categories || []).filter((c) => defaultCarries(String(c)));
  return now.includes(cat) ? now : [...now, cat];
};
/** The text of a field's choices ("TT, DD") -> ["TT", "DD"], or undefined when there are none. */
const parseOptions = (text) => { const o = String(text || '').split(',').map((x) => x.trim()).filter(Boolean); return o.length ? o : undefined; };
/** The message to show before saving an edited Sub Category, or ''. `rows` are [{ label, options: "TT, DD" }]. */
export function validateSubCategory(list, id, name, rows) {
  const n = String(name || '').trim();
  if (!n) return 'Give the Sub Category a name.';
  if (list.some((x) => x.id !== id && x.name.toLowerCase() === n.toLowerCase())) return `"${n}" already exists. A Sub Category name can be used once.`;
  const labels = rows.map((r) => String(r.label || '').trim()).filter(Boolean);
  if (new Set(labels.map((l) => l.toLowerCase())).size !== labels.length) return 'Two fields have the same name.';
  return '';
}
/** The list with one Sub Category's name and fields replaced (blank fields dropped). */
export function applySubCategoryEdit(list, id, name, rows) {
  const fields = rows.filter((r) => String(r.label || '').trim()).map((r) => { const options = parseOptions(r.options); return options ? { label: String(r.label).trim(), options } : { label: String(r.label).trim() }; });
  return list.map((x) => (x.id === id ? { ...x, name: String(name).trim(), fields } : x));
}
export const removeSubCategory = (list, id) => list.filter((x) => x.id !== id);


/** An option list after adding / removing a value (trimmed, no case-insensitive duplicates). */
export const addOption = (list, value) => {
  const v = String(value || '').trim();
  return v && !list.some((x) => x.toLowerCase() === v.toLowerCase()) ? [...list, v] : list;
};
export const removeOption = (list, value) => list.filter((x) => x !== value);

