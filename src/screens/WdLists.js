import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { Card, Small, Btn, Field, Row } from '../ui';
import { useTheme } from '../theme';
import Icon from '../icons';
import { listAutoBackups, readAutoBackup } from '../autoBackupFiles';
import { backupLists, restoreFromBackup, subCategoriesFromTasks, optionsFromTasks } from '../listsRestore';
import { addOption, removeOption, addSubCategory, addSubCategories, parseSubCategoryLines, applySubCategoryEdit, validateSubCategory, removeSubCategory, withCarrying } from '../listsCore';

const DONE_STATUS = /^(completed?|done|closed)$/i;
// The phone keeps the fourth list as `assignees`; the website calls it pendingWith.
export const LIST_META = [['categories', 'Categories'], ['priorities', 'Priorities'], ['statuses', 'Statuses'], ['assignees', 'Pending with']];

function Chip({ label, on, onPress, onRemove, small }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, backgroundColor: on ? t.primaryDark : t.surface, borderWidth: 1, borderColor: on ? t.primaryDark : t.border }}>
      <Text style={{ color: on ? '#fff' : t.text, fontWeight: '700', fontSize: t.fs(13) }}>{label}</Text>
      {!!small && <Text style={{ color: on ? '#fff' : t.textDim, fontSize: t.fs(11) }}>{small}</Text>}
      {!!onRemove && <Pressable onPress={onRemove} hitSlop={8} accessibilityLabel={`Delete ${label}`}><Icon name="close" size={13} color={on ? '#fff' : t.danger} stroke={2.6} /></Pressable>}
    </Pressable>
  );
}

/** Config > Entry form options: add and delete the Categories, Priorities, Statuses and Pending with options. `save(patch)` writes lists and stamps them. */
export function ListsEditor({ wd, save }) {
  const [text, setText] = useState({});
  return (
    <View>
      <Small style={{ marginBottom: 10 }}>Add or delete the options used in the entry form. They are shared with the website. Tasks already using a deleted option keep it.</Small>
      {LIST_META.map(([key, label]) => {
        const list = wd[key] || [];
        const add = () => { const next = addOption(list, text[key]); setText((x) => ({ ...x, [key]: '' })); if (next !== list) save({ [key]: next }); };
        const remove = (v) => {
          if (key === 'statuses' && DONE_STATUS.test(v)) return Alert.alert('Cannot delete', `"${v}" is what marks a task as done.`);
          if ((key === 'priorities' || key === 'statuses') && list.length <= 1) return Alert.alert('Keep one', `Keep at least one ${label.toLowerCase().replace(/ies$/, 'y').replace(/es$|s$/, '')}.`);
          Alert.alert(`Delete "${v}"?`, `Removed from ${label}. Tasks using it keep it.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => save({ [key]: removeOption(list, v) }) }]);
        };
        return (
          <Card key={key} style={{ marginBottom: 12 }}>
            <Text style={{ fontWeight: '800', marginBottom: 8 }}>{label}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
              {list.map((v) => <Chip key={v} label={v} onRemove={() => remove(v)} />)}
              {!list.length && <Small>None yet</Small>}
            </View>
            <Row gap={8}>
              <Field style={{ flex: 1, marginBottom: 0 }} value={text[key] || ''} onChangeText={(v) => setText((x) => ({ ...x, [key]: v }))} placeholder={`Add to ${label}...`} onSubmitEditing={add} />
              <Btn title="Add" disabled={!(text[key] || '').trim()} onPress={add} />
            </Row>
          </Card>
        );
      })}
    </View>
  );
}

/** Config > Next reminder: the categories that ask for a next reminder date and time. */
export function ReminderCategories({ wd, save }) {
  const t = useTheme();
  const cur = Array.isArray(wd.reminderCategories) ? wd.reminderCategories : [];
  return (
    <View>
      <Small style={{ marginBottom: 10 }}>Choose the categories that ask for a next reminder date and time in the entry form. The other categories do not show it. An alert rings at that time.</Small>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(wd.categories || []).map((c) => { const on = cur.includes(c); return <Chip key={c} label={c} on={on} onPress={() => save({ reminderCategories: on ? cur.filter((x) => x !== c) : [...cur, c] })} />; })}
      </View>
      {!(wd.categories || []).length && <Small style={{ color: t.textDim }}>Add categories first (Entry form options).</Small>}
    </View>
  );
}

function SubEditor({ sc, subs, onSave, onCancel }) {
  const t = useTheme();
  const [name, setName] = useState(sc.name);
  const [rows, setRows] = useState(() => (sc.fields || []).map((f, i) => ({ key: `r${i}`, label: f.label, options: (f.options || []).join(', ') })));
  const [error, setError] = useState('');
  const setRow = (key, patch) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  return (
    <View style={{ marginTop: 8 }}>
      <Field label="SUB CATEGORY NAME" value={name} onChangeText={setName} />
      <Small style={{ marginBottom: 6, fontWeight: '800', letterSpacing: 0.8 }}>FIELDS TO FILL IN</Small>
      {rows.map((r) => (
        <Row key={r.key} gap={6} style={{ alignItems: 'flex-start' }}>
          <Field style={{ flex: 1 }} value={r.label} onChangeText={(v) => setRow(r.key, { label: v })} placeholder="Field name" />
          <Field style={{ flex: 1 }} value={r.options} onChangeText={(v) => setRow(r.key, { options: v })} placeholder="Choices, comma separated" />
          <Btn kind="soft" title="Remove" onPress={() => setRows((x) => x.filter((y) => y.key !== r.key))} />
        </Row>
      ))}
      {!rows.length && <Small style={{ marginBottom: 8 }}>No fields yet.</Small>}
      <Btn kind="soft" title="+ Add field" onPress={() => setRows((x) => [...x, { key: `r${Date.now()}${x.length}`, label: '', options: '' }])} style={{ alignSelf: 'flex-start', marginBottom: 8 }} />
      <Small style={{ marginBottom: 8 }}>Tasks already saved keep what they typed under the old field or Sub Category name.</Small>
      {!!error && <Small style={{ color: t.danger, marginBottom: 8 }}>{error}</Small>}
      <Row gap={8}>
        <Btn title="Save changes" onPress={() => { const msg = validateSubCategory(subs, sc.id, name, rows); if (msg) setError(msg); else onSave(name, rows); }} />
        <Btn kind="soft" title="Cancel" onPress={onCancel} />
      </Row>
    </View>
  );
}

/**
 * Config > Sub categories > Restore: puts the Sub Categories, narration types (and missing report formats) back from one of the phone's
 * old daily backups, exactly as they were then; or, with no backup, rebuilds the Sub Categories the tasks use. Saved as a phone edit, so it
 * reaches the website too.
 */
export function RestoreLists({ wd, entries, save, setTools }) {
  const t = useTheme();
  const [backups, setBackups] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => {
    let live = true;
    (async () => {
      const out = [];
      for (const name of await listAutoBackups()) {
        const json = await readAutoBackup(name);
        if (json) out.push({ name, label: name.replace(/^auto-|\.json$/g, ''), lists: backupLists(json) });
      }
      if (live) setBackups(out);
    })();
    return () => { live = false; };
  }, []);
  const fromTasks = subCategoriesFromTasks(entries, wd.subCategories);
  // The phone keeps Pending with as `assignees`; the restore works in the website's names.
  const nowLists = { ...wd, pendingWith: wd.assignees };
  const usedOptions = optionsFromTasks(entries, nowLists);
  const usedCount = Object.values(usedOptions).reduce((n, l) => n + l.length, 0);
  const toPhone = ({ pendingWith, ...rest }) => ({ ...rest, ...(pendingWith ? { assignees: pendingWith } : null) });
  const restore = (b) => {
    const plan = restoreFromBackup(nowLists, b.lists);
    Alert.alert(`Restore from ${b.label}?`, `Your categories, priorities, ${plan.counts.statuses} statuses, ${plan.counts.pendingWith} Pending with names, ${plan.counts.subCategories} Sub Categories and ${plan.counts.narrationTypes} narration types are put back as they were on ${b.label}${plan.counts.formats ? `, and ${plan.counts.formats} missing report formats` : ''}. Nothing you have now is deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Restore', onPress: () => {
        save(toPhone(plan.lists));
        if (plan.reportFormats) setTools((w) => ({ ...w, reportFormats: plan.reportFormats }));
        setMsg(`Restored from ${b.label}: ${plan.counts.newOptions} statuses / names / categories, ${plan.counts.newSubCategories} Sub Categories and ${plan.counts.newNarrationTypes} narration types were missing and are back. They are sent to the website too.`);
      } },
    ]);
  };
  if (backups === null) return null;
  const useful = backups.filter((b) => b.lists.subCategories.length || b.lists.narrationTypes.length || b.lists.statuses.length || b.lists.pendingWith.length);
  return (
    <Card style={{ marginBottom: 14, gap: 8 }}>
      <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(15) }}>Restore lists, Sub Categories and narrations</Text>
      {useful.length ? (
        <>
          <Small>This phone kept a daily backup until 17 Oct. Pick a day to put its Statuses, Pending with, categories, priorities, Sub Categories and narration types back exactly as they were.</Small>
          {useful.map((b) => (
            <Row key={b.name} style={{ alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: t.text, fontWeight: '700' }}>{b.label}</Text>
                <Small>{b.lists.statuses.length} statuses · {b.lists.pendingWith.length} Pending with · {b.lists.subCategories.length} Sub Categories · {b.lists.narrationTypes.length} narration types</Small>
              </View>
              <Btn kind="soft" title="Restore" onPress={() => restore(b)} style={{ paddingHorizontal: 18 }} />
            </Row>
          ))}
        </>
      ) : <Small>No backup with these lists was found on this phone.</Small>}
      {usedCount > 0 && (
        <>
          <Small style={{ marginTop: 4 }}>Your tasks use {usedCount} option{usedCount === 1 ? '' : 's'} missing from the lists{usedOptions.statuses.length ? ` - statuses: ${usedOptions.statuses.join(', ')}` : ''}{usedOptions.pendingWith.length ? ` - Pending with: ${usedOptions.pendingWith.join(', ')}` : ''}{usedOptions.categories.length ? ` - categories: ${usedOptions.categories.join(', ')}` : ''}.</Small>
          <Btn kind="neutral" title={`Add back ${usedCount} from my tasks`} style={{ alignSelf: 'flex-start' }} onPress={() => {
            save({ categories: [...(wd.categories || []), ...usedOptions.categories], priorities: [...(wd.priorities || []), ...usedOptions.priorities], statuses: [...(wd.statuses || []), ...usedOptions.statuses], assignees: [...(wd.assignees || []), ...usedOptions.pendingWith] });
            setMsg(`${usedCount} options your tasks use are back in the lists.`);
          }} />
        </>
      )}
      {fromTasks.length > 0 && (
        <>
          <Small style={{ marginTop: 4 }}>{fromTasks.length} Sub Categor{fromTasks.length === 1 ? 'y is' : 'ies are'} used by your tasks but missing from the list. They can be rebuilt with the field names the tasks filled in (choice lists are not known).</Small>
          <Btn kind="neutral" title={`Rebuild ${fromTasks.length} from my tasks`} style={{ alignSelf: 'flex-start' }} onPress={() => {
            save({ subCategories: [...(Array.isArray(wd.subCategories) ? wd.subCategories : []), ...fromTasks], subCategoryCategories: [...new Set([...(wd.subCategoryCategories || []), ...fromTasks.map((x) => x.category).filter(Boolean)])] });
            setMsg(`${fromTasks.length} Sub Categories rebuilt from your tasks.`);
          }} />
        </>
      )}
      {!!msg && <Small style={{ color: t.accent }}>{msg}</Small>}
    </Card>
  );
}

/** Config > Sub categories: under each category, its Sub Categories and their fields (the website's Sub categories topic). */
export function SubCategories({ wd, lists, save }) {
  const t = useTheme();
  const subs = lists.subCategories;
  const [draft, setDraft] = useState({});
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState('');
  const get = (c) => draft[c] || { name: '', fields: '', many: '' };
  const set = (c, patch) => setDraft((d) => ({ ...d, [c]: { ...get(c), ...patch } }));
  const write = (next, cat) => save({ subCategories: next, subCategoryCategories: withCarrying({ categories: wd.categories, subCategoryCategories: lists.subCategoryCategories }, cat) });
  const general = subs.filter((x) => !x.category);
  return (
    <View>
      <Small style={{ marginBottom: 10 }}>Sub Categories live under a category (Payments &gt; Domestic Payment...). A name can be used once. Add several at once, one per line: "Name: Field A, Field B".</Small>
      {!!msg && <Small style={{ marginBottom: 8, color: t.accent }}>{msg}</Small>}
      {[...(wd.categories || [])].map((cat) => {
        const own = subs.filter((x) => x.category === cat);
        const d = get(cat);
        return (
          <Card key={cat} style={{ marginBottom: 12 }}>
            <Text style={{ fontWeight: '800' }}>{cat} <Text style={{ color: t.textDim, fontWeight: '600', fontSize: t.fs(12) }}>{own.length ? `${own.length} Sub Categor${own.length > 1 ? 'ies' : 'y'}` : 'none yet'}</Text></Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 8 }}>
              {own.map((sc) => <Chip key={sc.id} label={sc.name} small={sc.fields.length ? `${sc.fields.length} field${sc.fields.length > 1 ? 's' : ''}` : ''} on={editing === sc.id} onPress={() => setEditing(editing === sc.id ? '' : sc.id)}
                onRemove={() => Alert.alert(`Delete "${sc.name}"?`, 'Tasks using it keep it.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Delete', style: 'destructive', onPress: () => save({ subCategories: removeSubCategory(subs, sc.id) }) }])} />)}
            </View>
            {own.filter((x) => x.id === editing).map((sc) => <SubEditor key={sc.id} sc={sc} subs={subs} onCancel={() => setEditing('')} onSave={(name, rows) => { save({ subCategories: applySubCategoryEdit(subs, sc.id, name, rows) }); setEditing(''); }} />)}
            <Field value={d.name} onChangeText={(v) => set(cat, { name: v })} placeholder={`New Sub Category under ${cat}`} />
            <Field value={d.fields} onChangeText={(v) => set(cat, { fields: v })} placeholder="Fields to fill in (comma separated, optional)" />
            <Btn title="Add" disabled={!d.name.trim()} style={{ alignSelf: 'flex-start', marginBottom: 10 }} onPress={() => {
              const next = addSubCategory(subs, d.name, d.fields.split(','), cat);
              if (next === subs) { setMsg(`"${d.name.trim()}" already exists. A Sub Category name can be used once.`); return; }
              setMsg(''); write(next, cat); set(cat, { name: '', fields: '' });
            }} />
            <Field multiline value={d.many} onChangeText={(v) => set(cat, { many: v })} placeholder={'Add several at once, one per line:\nDomestic Payment: Vendor Name, Invoice No\nUrgent Payment'} />
            <Btn kind="soft" title="Add these" disabled={!d.many.trim()} style={{ alignSelf: 'flex-start' }} onPress={() => {
              const { list, added } = addSubCategories(subs, parseSubCategoryLines(d.many), cat);
              setMsg(added ? `${added} added under ${cat}.` : 'Nothing new to add (the names already exist).');
              if (added) { write(list, cat); set(cat, { many: '' }); }
            }} />
          </Card>
        );
      })}
      {general.length > 0 && (
        <Card><Text style={{ fontWeight: '800' }}>Not under a category</Text><Small style={{ marginVertical: 6 }}>Offered under every category.</Small>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{general.map((sc) => <Chip key={sc.id} label={sc.name} />)}</View></Card>
      )}
    </View>
  );
}
