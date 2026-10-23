import { useState } from 'react';
import { useStore } from '../store';
import Icon from '../icons';
import { DONE_STATUS, applySubCategoryEdit, validateSubCategory, addSubCategories, addSubCategory, parseSubCategoryLines, withCarrying, removeSubCategory, addOption, newId, removeOption } from '../data';

export const LIST_META = [['categories', 'Categories'], ['priorities', 'Priorities'], ['statuses', 'Statuses'], ['pendingWith', 'Pending with'], ['darPaymentIntro', 'Report points']];

/** Add and delete the options of one list (Category, Priority, Status, Pending with). onAdd gets the new value, so a form can pick it. */
export function ListManager({ listKey, label, lists, onAdd }) {
  const { saveLists } = useStore();
  const [text, setText] = useState('');
  const list = lists[listKey] || [];
  const add = (e) => {
    e?.preventDefault();
    const next = addOption(list, text);
    if (next === list) { setText(''); return; }
    saveLists({ ...lists, [listKey]: next });
    if (onAdd) onAdd(next[next.length - 1]);
    setText('');
  };
  const remove = (v) => {
    if (listKey === 'statuses' && DONE_STATUS.test(v)) { alert(`"${v}" is what marks a task as done, so it cannot be deleted.`); return; }
    if ((listKey === 'priorities' || listKey === 'statuses') && list.length <= 1) { alert(`Keep at least one ${label.toLowerCase().replace(/es$|s$/, '')}.`); return; }
    if (confirm(`Delete "${v}" from ${label}? Tasks using it keep it.`)) saveLists({ ...lists, [listKey]: removeOption(list, v) });
  };
  return (
    <div className="manager">
      <div className="chips">
        {list.map((v) => <span key={v} className="chip removable">{v}<button type="button" onClick={() => remove(v)} aria-label={`Delete ${v}`}><Icon name="x" size={11} strokeWidth={2.6} /></button></span>)}
        {!list.length && <span className="muted">None yet</span>}
      </div>
      <div className="add-row">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add(e)} placeholder={`Add to ${label}...`} aria-label={`Add to ${label}`} />
        <button type="button" className="btn primary" onClick={add} disabled={!text.trim()}>Add</button>
      </div>
    </div>
  );
}

/**
 * Sub Categories live under a category (Payments > Domestic Payment, Urgent Payment...). One group per category, each with its own
 * Sub Categories and an add box; "only" shows just one category's group (the entry form). Several can be pasted at once,
 * one per line, as "Name" or "Name: Field A, Field B".
 */
export function SubCategoryManager({ lists, only }) {
  const { saveLists } = useStore();
  const [draft, setDraft] = useState({});       // per category: { name, fields, many }
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState('');       // id of the Sub Category being edited
  const subs = lists.subCategories || [];
  const cats = only ? [only] : lists.categories;
  const get = (c) => draft[c] || { name: '', fields: '', many: '' };
  const set = (c, patch) => setDraft((d) => ({ ...d, [c]: { ...get(c), ...patch } }));
  const save = (next, cat) => saveLists({ ...lists, subCategories: next, subCategoryCategories: withCarrying(lists, cat) });
  const add = (cat) => {
    const d = get(cat);
    const next = addSubCategory(subs, d.name, d.fields.split(','), cat);
    if (next === subs) { setMsg(d.name.trim() ? `"${d.name.trim()}" already exists. A Sub Category name can be used once.` : ''); return; }
    setMsg(''); save(next, cat); set(cat, { name: '', fields: '' });
  };
  const addMany = (cat) => {
    const { list, added } = addSubCategories(subs, parseSubCategoryLines(get(cat).many), cat);
    setMsg(added ? `${added} added under ${cat}.` : 'Nothing new to add (the names already exist).');
    if (added) { save(list, cat); set(cat, { many: '' }); }
  };
  const remove = (sc) => { if (confirm(`Delete the Sub Category "${sc.name}"? Tasks using it keep it.`)) saveLists({ ...lists, subCategories: removeSubCategory(subs, sc.id) }); };
  const chip = (sc) => <span key={sc.id} className="chip removable" title={sc.fields.map((f) => f.label).join(', ')}>{sc.name}{sc.fields.length > 0 && <small>{sc.fields.length} field{sc.fields.length > 1 ? 's' : ''}</small>}<button type="button" className="edit-btn" onClick={() => setEditing(editing === sc.id ? '' : sc.id)} aria-label={`Edit ${sc.name}`} title="Edit the name and fields"><Icon name="pencil" size={11} strokeWidth={2.4} /></button><button type="button" onClick={() => remove(sc)} aria-label={`Delete ${sc.name}`}><Icon name="x" size={11} strokeWidth={2.6} /></button></span>;
  const general = subs.filter((x) => !x.category);
  if (only === '') return <p className="muted">Choose a Category first. Sub Categories are kept under a category.</p>;
  return (
    <div className="manager">
      {msg && <p className="muted" role="status">{msg}</p>}
      {cats.map((cat) => {
        const own = subs.filter((x) => x.category === cat);
        const d = get(cat);
        return (
          <div key={cat} className="cat-group">
            <h3 className="cat-title">{cat} <small>{own.length ? `${own.length} Sub Categor${own.length > 1 ? 'ies' : 'y'}` : 'none yet'}</small></h3>
            <div className="chips">{own.map(chip)}</div>
            {own.filter((x) => x.id === editing).map((sc) => <SubCategoryEditor key={sc.id} sc={sc} subs={subs} onCancel={() => setEditing('')} onSave={(name, rows) => { saveLists({ ...lists, subCategories: applySubCategoryEdit(subs, sc.id, name, rows) }); setEditing(''); setMsg(`${name.trim()} saved.`); }} />)}
            <div className="add-row">
              <input value={d.name} onChange={(e) => set(cat, { name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add(cat)} placeholder={`New Sub Category under ${cat}`} aria-label={`New Sub Category under ${cat}`} />
              <input value={d.fields} onChange={(e) => set(cat, { fields: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add(cat)} placeholder="Fields to fill in (comma separated, optional)" aria-label={`Fields of the new Sub Category under ${cat}`} />
              <button type="button" className="btn primary" onClick={() => add(cat)} disabled={!d.name.trim()}>Add</button>
            </div>
            <details className="many">
              <summary>Add several at once</summary>
              <textarea rows={4} value={d.many} onChange={(e) => set(cat, { many: e.target.value })} placeholder={'One per line, for example:\nDomestic Payment: Vendor Name, Invoice No\nUrgent Payment\nImport Payment: Bill of Entry'} aria-label={`Several Sub Categories under ${cat}`} />
              <button type="button" className="btn" onClick={() => addMany(cat)} disabled={!d.many.trim()}>Add these</button>
            </details>
          </div>
        );
      })}
      {!only && general.length > 0 && (
        <div className="cat-group"><h3 className="cat-title">Not under a category <small>from the phone app or the old website, offered under every category</small></h3><div className="chips">{general.map(chip)}</div>{general.filter((x) => x.id === editing).map((sc) => <SubCategoryEditor key={sc.id} sc={sc} subs={subs} onCancel={() => setEditing('')} onSave={(name, rows) => { saveLists({ ...lists, subCategories: applySubCategoryEdit(subs, sc.id, name, rows) }); setEditing(''); setMsg(`${name.trim()} saved.`); }} />)}</div>
      )}
    </div>
  );
}

/** Edit one Sub Category: its name, and its fields - rename, delete, add, and give a field fixed choices ("TT, DD"). */
function SubCategoryEditor({ sc, subs, onSave, onCancel }) {
  const [name, setName] = useState(sc.name);
  const [rows, setRows] = useState(() => sc.fields.map((f) => ({ key: newId(), label: f.label, options: (f.options || []).join(', ') })));
  const [error, setError] = useState('');
  const setRow = (key, patch) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const save = () => {
    const msg = validateSubCategory(subs, sc.id, name, rows);
    if (msg) { setError(msg); return; }
    onSave(name, rows);
  };
  return (
    <div className="sc-editor" role="group" aria-label={`Edit ${sc.name}`}>
      <label className="field">Sub Category name<input value={name} onChange={(e) => setName(e.target.value)} aria-label="Sub Category name" /></label>
      <div className="field">Fields to fill in
        {rows.map((r) => (
          <div key={r.key} className="field-row">
            <input value={r.label} onChange={(e) => setRow(r.key, { label: e.target.value })} placeholder="Field name" aria-label="Field name" />
            <input value={r.options} onChange={(e) => setRow(r.key, { options: e.target.value })} placeholder="Choices, comma separated (optional)" aria-label="Choices for this field" />
            <button type="button" className="icon-btn" onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))} aria-label={`Delete field ${r.label || ''}`}><Icon name="x" size={16} /></button>
          </div>
        ))}
        {!rows.length && <span className="muted">No fields yet.</span>}
        <div><button type="button" className="btn" onClick={() => setRows((x) => [...x, { key: newId(), label: '', options: '' }])}>+ Add field</button></div>
      </div>
      <p className="muted">Tasks already saved keep what they typed under the old field or Sub Category name.</p>
      {error && <p className="banner err" role="alert">{error}</p>}
      <div className="add-row"><button type="button" className="btn primary" onClick={save}>Save changes</button><button type="button" className="btn" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}
