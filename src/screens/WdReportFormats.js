import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { Card, Small, Btn, Field } from '../ui';
import { useTheme } from '../theme';
import { effectiveFormats, findFormat, placeholdersOf, renderTemplate, planFormatSetup, removedFormat, normName, SAMPLE_FORMATS } from '../reportFormats';
import { paymentLists } from '../workingDashboardPayments';

/**
 * More > Report formats: the line the Daily report writes for a task, per Sub Category, with {Field name} marks filled from the task
 * (the website's Config > Report formats). `setTools` saves with a stamp so the newer copy wins on every device; `setLists` writes the lists.
 */
export default function WdReportFormats({ wd, entries, setTools, setLists }) {
  const t = useTheme();
  const saved = Array.isArray(wd.reportFormats) ? wd.reportFormats : [];
  const custom = saved.length > 0;
  const formats = useMemo(() => effectiveFormats(saved), [wd.reportFormats]);   // eslint-disable-line react-hooks/exhaustive-deps
  const subs = paymentLists(wd, wd.categories).subCategories;
  const [open, setOpen] = useState('');
  const [draft, setDraft] = useState('');
  const [find, setFind] = useState('');
  const rows = [
    ...subs.map((sc) => ({ key: `s-${sc.id || sc.name}`, sc, name: sc.name, category: sc.category || '', format: findFormat(formats, sc.name) })),
    ...formats.filter((f) => !subs.some((sc) => findFormat([f], sc.name))).map((f) => ({ key: `f-${f.id}`, sc: null, name: f.subCategory, category: f.category, format: f })),
  ].filter((r) => !find.trim() || `${r.name} ${r.category}`.toLowerCase().includes(find.trim().toLowerCase()));
  const setup = planFormatSetup({ categories: wd.categories, subCategories: subs, subCategoryCategories: wd.subCategoryCategories }, formats);
  const everyFormat = () => (custom ? saved : SAMPLE_FORMATS.map((f, i) => ({ id: f.id || `rf-s${i}`, ...f })));
  const saveFormats = (next) => setTools((w) => ({ ...w, reportFormats: next }));
  const save = (row, text) => {
    const subName = row.format ? row.format.subCategory : row.name;
    const category = row.category || (row.format && row.format.category) || '';
    // The format being replaced, and any earlier "removed" marker for this Sub Category, go; the rest stay.
    const list = everyFormat().filter((f) => !(row.format && f.id === row.format.id) && !(f.removed && normName(f.subCategory) === normName(subName)));
    // An empty text removes the format: a marker is saved so a sample format of this Sub Category is not brought back.
    saveFormats(text.trim() ? [...list, { id: row.format ? row.format.id : `rf-${Date.now().toString(36)}`, category, subCategory: subName, template: text.trim() }] : [...list, removedFormat(subName, category)]);
  };
  const sample = (row) => {
    const e = entries.filter((x) => !x.binned && x.subCategory && findFormat([{ subCategory: x.subCategory, template: 'x' }], row.name)).sort((a, b) => String(b.dueAt || '').localeCompare(String(a.dueAt || '')))[0];
    return e ? e : null;
  };
  return (
    <View>
      <Small style={{ marginBottom: 10 }}>The line the Daily report writes for a task in each Sub Category. Put a task's own value in {'{braces}'} - e.g. Being amount paid against Invoice No. {'{Invoice No}'}, amounting to ₹{'{Amount}'}. A missing value shows as [mark]. The sample formats from your Tally narration sheet are used until you change one.</Small>
      <Card style={{ marginBottom: 12 }}>
        {setup.categories.length || setup.subCategories.length ? (
          <View>
            <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(14) }}>{setup.categories.length} categor{setup.categories.length === 1 ? 'y' : 'ies'} and {setup.subCategories.length} sub categor{setup.subCategories.length === 1 ? 'y' : 'ies'} from the formats are not in your lists yet.</Text>
            <Small style={{ marginVertical: 6 }}>Only what is missing is created; nothing you already have is changed.</Small>
            <Btn title="Add them to my lists" onPress={() => { setLists(setup.lists); Alert.alert('Added', 'The categories and sub categories were added.'); }} />
          </View>
        ) : <Small>✓ Every category and sub category in the formats is already in your lists.</Small>}
      </Card>
      <Field value={find} onChangeText={setFind} placeholder="🔍 Search sub categories..." />
      {rows.map((row) => {
        const on = open === row.key;
        const e = on ? sample(row) : null;
        const preview = on && draft.trim() ? renderTemplate(draft, e || { subCategoryFields: {}, keyPoints: [], title: '' }).text : '';
        return (
          <Card key={row.key} style={{ marginBottom: 10 }}>
            <Pressable onPress={() => { setOpen(on ? '' : row.key); setDraft(row.format ? row.format.template : ''); }} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(15) }}>{row.name}</Text>
                <Small>{row.category || 'No category'}</Small>
              </View>
              <Text style={{ color: row.format ? t.ok : t.textDim, fontWeight: '800', fontSize: t.fs(12) }}>{row.format ? 'Format set' : 'No format'}</Text>
            </Pressable>
            {on && (
              <View style={{ marginTop: 10 }}>
                <Field multiline value={draft} onChangeText={setDraft} placeholder="e.g. Being amount paid against Invoice No. {Invoice No}, amounting to ₹{Amount}." />
                {!!row.sc && row.sc.fields.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    {row.sc.fields.map((f) => (
                      <Pressable key={f.label} onPress={() => setDraft((d) => `${d}${d && !/\s$/.test(d) ? ' ' : ''}{${f.label}}`)} style={{ borderRadius: 12, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: t.surfaceAlt }}>
                        <Text style={{ color: t.accent, fontWeight: '800', fontSize: t.fs(12) }}>+ {f.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                )}
                {!!preview && <Small style={{ marginBottom: 10 }}>{e ? 'With your latest task: ' : 'Preview: '}{preview}</Small>}
                {!!draft.trim() && placeholdersOf(draft).length === 0 && <Small style={{ marginBottom: 10 }}>No {'{mark}'} yet - every task would get this exact sentence.</Small>}
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  <Btn title="Save format" onPress={() => { save(row, draft); setOpen(''); }} />
                  {!!row.format && <Btn kind="soft" title="Remove format" onPress={() => { save(row, ''); setOpen(''); }} />}
                </View>
              </View>
            )}
          </Card>
        );
      })}
      {!rows.length && <Small>Add Sub categories first (Config), then give each a format.</Small>}
      {custom && <Btn kind="ghost" title="Use the sample formats again" onPress={() => Alert.alert('Use the sample formats?', 'Your own formats are removed.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Use samples', onPress: () => saveFormats([]) }])} />}
    </View>
  );
}
