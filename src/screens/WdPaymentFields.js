import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Alert, Platform } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Field, Small, Label, Row, Btn, Sheet, PickerButton, Choices, useLayout } from '../ui';
import Icon from '../icons';
import { useTheme } from '../theme';
import { useStore } from '../store';
import { recordNarration, toggleFav, removeHistory } from '../narrationHistory';
import { paymentSections, findSubCategory, PAYMENT_TYPES, PAYMENT_AGAINST, buildNarrationText, narrationStyle, narrationOffersPo, subCategoryText, narrationNeedsDoc, narrationMissing } from '../workingDashboardPayments';

/**
 * A pick-one list that opens in place under its button (no second sheet over the entry form).
 * `options`: [value, label] pairs; '' clears.
 */
function InlinePick({ label, value, placeholder = 'Select', options, onChange }) {
  const [open, setOpen] = useState(false);
  const shown = (options.find(([k]) => k === value) || [])[1] || value;
  return (
    <View style={{ marginBottom: 12 }}>
      <Label>{label}</Label>
      <PickerButton text={shown || placeholder} dim={!shown} onPress={() => setOpen((v) => !v)} />
      {open && (
        <View style={{ marginTop: 6 }}>
          <Choices options={[['', '— None —'], ...options]} value={value || ''} onChange={(k) => { onChange(k); setOpen(false); }} />
        </View>
      )}
    </View>
  );
}

/** One rule field (a Sub Category's or a narration type's): a list when the rule gives options, else text. */
function RuleField({ field, value, onChange }) {
  const opts = field.options || [];
  if (opts.length) {
    const all = value && !opts.includes(value) ? [value, ...opts] : opts;
    return <InlinePick label={field.label.toUpperCase()} value={value || ''} options={all.map((o) => [o, o])} onChange={onChange} />;
  }
  return <Field label={field.label.toUpperCase()} value={value || ''} onChangeText={onChange} />;
}

function Section({ title, hint, children }) {
  const t = useTheme();
  return (
    <View style={{ padding: 12, borderRadius: 14, marginBottom: 14, backgroundColor: t.accent + '0F', borderWidth: 1, borderColor: t.accent + '33' }}>
      <Text style={{ color: t.accent, fontWeight: '800', fontSize: t.fs(13), marginBottom: hint ? 2 : 10 }}>{title}</Text>
      {!!hint && <Small style={{ marginBottom: 10 }}>{hint}</Small>}
      {children}
    </View>
  );
}

/**
 * The Tally narration builder: type, %, document no, the type's own fields, a note, the mail chain or not, a live
 * preview and Copy. Used in the entry form (once Completed) and on the web app's Narration tab (any status).
 * `nd` is the narration form, `setNd(patch)` changes it; `subText` / `mailChain` are what the narration may quote;
 * `importDetails`: the entry's Import Payment details, which a template type (Imports Payments) starts from;
 * `columns`: fields to a row (web.app's Narration tab); `lead`: cells placed after the narration type (the type always comes first).
 */
/**
 * Lays its children out `columns` to a row (each child one cell); one column is the plain stacked form.
 */
export function FieldGrid({ columns = 1, children }) {
  const cells = React.Children.toArray(children).filter(Boolean);
  if (columns <= 1) return <View>{cells}</View>;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
      {cells.map((child, i) => <View key={child.key || i} style={{ width: `${100 / columns}%`, paddingHorizontal: 6 }}>{child}</View>)}
    </View>
  );
}

/** The narration draft once type `v` is picked: an Imports-style template starts with the beneficiary and % it knows. */
export function startNarration(lists, v, nd = {}, importDetails = {}) {
  const next = (lists.narrationTypes || []).find((x) => x.name === v);
  const pd = importDetails || {};
  if (next && next.template) {
    const fv = {};
    if ((next.fields || []).some((f) => f.label === 'Beneficiary Name') && String(pd.beneficiary || '').trim()) fv['Beneficiary Name'] = String(pd.beneficiary || '').trim();
    return { typeName: v, fieldsValues: fv, percent: nd.percent || String(pd.paymentPercent || '') };
  }
  return { typeName: v, fieldsValues: {} };
}

export function NarrationForm({ nd, setNd, lists, subText = '', mailChain = '', importDetails = {}, columns = 1, lead = null }) {
  const t = useTheme();
  const { data, update } = useStore();
  const history = (data.workingDashboard && data.workingDashboard.narrationHistory) || [];
  const setHistory = (fn) => update((db) => ({ ...db, workingDashboard: { ...db.workingDashboard, narrationHistory: fn(db.workingDashboard.narrationHistory || []) } }));
  const [showAllHist, setShowAllHist] = useState(false);
  // Phone-width screens and the whole website: blank fields show as [Label] in the preview, and Copy warns first.
  const phone = !useLayout().tablet || Platform.OS === 'web';
  const nr = (lists.narrationTypes || []).find((x) => x.name === nd.typeName) || null;
  const preview = nr ? buildNarrationText(nr, {
    percent: nd.percent, docNo: nd.docNo, poNo: nd.poNo, purpose: nd.purpose, fieldsValues: nd.fieldsValues,
    subCategoryText: subText, mailChain: nd.includeMail ? mailChain : '', placeholders: phone,
  }) : '';
  const missing = phone ? narrationMissing(nr, nd) : [];
  // Copied as filled in: a blank field is left out, not pasted into Tally as [Label].
  const copy = async () => {
    const text = buildNarrationText(nr, { percent: nd.percent, docNo: nd.docNo, poNo: nd.poNo, purpose: nd.purpose, fieldsValues: nd.fieldsValues, subCategoryText: subText, mailChain: nd.includeMail ? mailChain : '' });
    await Clipboard.setStringAsync(text);
    recordNarration(text, nr && nr.name);
    Alert.alert('Copied', 'Narration copied - paste it into Tally.');
  };
  const onCopy = () => {
    if (!missing.length) { copy(); return; }
    Alert.alert('Some fields are blank', `${missing.join(', ')} ${missing.length > 1 ? 'are' : 'is'} not filled in yet. Copy the narration anyway?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Copy anyway', onPress: copy },
    ]);
  };
  return (
    <View>
    <FieldGrid columns={columns}>
    <InlinePick key="type" label="NARRATION TYPE" value={nd.typeName || ''} options={(lists.narrationTypes || []).map((x) => [x.name, x.name])}
      onChange={(v) => setNd(startNarration(lists, v, nd, importDetails))} />
    {lead}
    {!!nr && !!nr.hasPercent && <Field key="pct" label="%" keyboardType="number-pad" value={nd.percent || ''} onChangeText={(v) => setNd({ percent: v.replace(/[^0-9.]/g, '') })} placeholder="e.g. 30" />}
    {!!nr && narrationNeedsDoc(nr) && <Field key="doc" label={String(nr.docLabel || 'Document No').toUpperCase()} value={nd.docNo || ''} onChangeText={(v) => setNd({ docNo: v })} placeholder={`e.g. ${nr.docLabel || 'Document No'}`} />}
    {!!nr && narrationStyle.web && narrationOffersPo(nr) && <Field key="po" label="PO NO (optional)" value={nd.poNo || ''} onChangeText={(v) => setNd({ poNo: v })} placeholder="e.g. INPO/PP/26-27/0111" />}
    {!!nr && (nr.fields || []).map((f) => (
      <RuleField key={`f-${f.label}`} field={f} value={(nd.fieldsValues || {})[f.label]} onChange={(v) => setNd({ fieldsValues: { ...(nd.fieldsValues || {}), [f.label]: v } })} />
    ))}
    {!!nr && <Field key="note" label="NOTE (optional)" value={nd.purpose || ''} onChangeText={(v) => setNd({ purpose: v })} placeholder="Anything to add to the narration" />}
    </FieldGrid>
    {!!nr && (
      <View>
        <Pressable onPress={() => setNd({ includeMail: !nd.includeMail })} accessibilityRole="checkbox" accessibilityState={{ checked: !!nd.includeMail }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <View style={{ width: 22, height: 22, borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: nd.includeMail ? t.accent : 'transparent', borderWidth: nd.includeMail ? 0 : 2, borderColor: t.accent }}>
            {!!nd.includeMail && <Icon name="check" size={14} color={t.onAccent} stroke={3} />}
          </View>
          <Text style={{ color: t.text, fontSize: t.fs(14) }}>Include mail chain</Text>
        </Pressable>
        <Label>GENERATED NARRATION</Label>
        <Row gap={6} style={{ alignItems: 'flex-start' }}>
          <View style={{ flex: 1, padding: 10, borderRadius: 10, backgroundColor: t.surfaceAlt }}>
            <Text style={{ color: t.text, fontSize: t.fs(13.5) }} selectable>{preview}</Text>
            {!!missing.length && <Text style={{ color: t.warn, fontSize: t.fs(12), marginTop: 6, fontWeight: '700' }}>Still blank: {missing.join(', ')}</Text>}
          </View>
          <Pressable accessibilityLabel="Copy narration" onPress={onCopy}
            style={{ width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: t.tint }}>
            <Icon name="copy" size={19} color={t.tintText} stroke={1.9} />
          </Pressable>
        </Row>
      </View>
    )}
    {!!history.length && (
      <View style={{ marginTop: 14 }}>
        <Small style={{ marginBottom: 5, fontWeight: '700' }}>RECENT & FAVOURITES</Small>
        {[...history].sort((a, b) => Number(b.fav) - Number(a.fav) || b.at - a.at).slice(0, showAllHist ? 30 : 5).map((h) => (
          <Row key={h.id} gap={8} style={{ alignItems: 'center', paddingVertical: 6, borderTopWidth: 0.5, borderTopColor: t.border }}>
            <Pressable onPress={() => setHistory((l) => toggleFav(l, h.id))} hitSlop={8} accessibilityLabel={h.fav ? 'Remove from favourites' : 'Add to favourites'}><Text style={{ color: h.fav ? t.warn : t.textDim, fontSize: t.fs(18) }}>{h.fav ? '★' : '☆'}</Text></Pressable>
            <Text style={{ flex: 1, color: t.text, fontSize: t.fs(13) }} numberOfLines={2}>{h.text}</Text>
            <Pressable onPress={async () => { await Clipboard.setStringAsync(h.text); recordNarration(h.text, h.typeName); Alert.alert('Copied', 'Narration copied - paste it into Tally.'); }} hitSlop={8} accessibilityLabel="Copy this narration"><Text style={{ color: t.accent, fontSize: t.fs(16) }}>⧉</Text></Pressable>
            <Pressable onPress={() => setHistory((l) => removeHistory(l, h.id))} hitSlop={8} accessibilityLabel="Remove from history"><Text style={{ color: t.textDim, fontSize: t.fs(14) }}>✕</Text></Pressable>
          </Row>
        ))}
        {history.length > 5 && <Pressable onPress={() => setShowAllHist((v) => !v)} hitSlop={6}><Small style={{ color: t.accent, fontWeight: '700', marginTop: 6 }}>{showAllHist ? 'Show fewer' : `Show all ${Math.min(history.length, 30)}`}</Small></Pressable>}
      </View>
    )}
    </View>
  );
}

/**
 * The web app's payment parts of the entry form, shown when they apply:
 *  - Import Payment details while an Import Payment is In Progress (beneficiary, %, type, against);
 *  - the Sub Category and the fields its rule asks for, once a category that carries one is Completed;
 *  - the Tally Narration (type, %, document no, the type's own fields, a note, the mail chain or not), with a
 *    live preview and Copy, once the entry is Completed.
 * `draft.narrationDraft` holds the narration form; the screen turns it into the stored narration on save.
 */
export function PaymentFields({ draft, setDraft, lists, rememberedType = '' }) {
  const t = useTheme();
  const sec = paymentSections(draft.category, draft.status, lists, !!draft.done);
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
  const pd = draft.paymentDetails || {};
  const setPd = (patch) => setDraft((d) => ({ ...d, paymentDetails: { ...(d.paymentDetails || {}), ...patch } }));
  const sc = findSubCategory(lists, draft.subCategory);
  const scVals = draft.subCategoryFields || {};
  const nd = draft.narrationDraft || {};
  // The Sub Category's fields are in a popup (the form does not grow): opened when one is picked, by the button, or when a Completed task still lacks some.
  const [subOpen, setSubOpen] = useState(false);
  const subSnap = useRef({});
  const openSub = () => { subSnap.current = draft.subCategoryFields || {}; setSubOpen(true); };
  const subFilled = (sc?.fields || []).filter((f) => String(scVals[f.label] || '').trim()).length;
  const autoOpened = useRef('');
  useEffect(() => {
    const need = sc && sc.fields.length > subFilled && /^completed$/i.test(String(draft.status || ''));
    if (need && autoOpened.current !== `${draft.id}|${draft.subCategory}`) { autoOpened.current = `${draft.id}|${draft.subCategory}`; openSub(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per task and Sub Category.
  }, [draft.status, draft.subCategory, sec.subCategory]);
  const setNd = (patch) => setDraft((d) => ({ ...d, narrationDraft: { ...(d.narrationDraft || {}), ...patch } }));
  // The narration type last used for this category starts picked (once per category, so clearing it sticks).
  const filledFor = useRef(null);
  useEffect(() => {
    if (!sec.narration || nd.typeName || !rememberedType || filledFor.current === draft.category) return;
    filledFor.current = draft.category;
    if ((lists.narrationTypes || []).some((x) => x.name === rememberedType)) setNd(startNarration(lists, rememberedType, nd, pd));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the narration section opens or the category changes.
  }, [sec.narration, draft.category, rememberedType]);
  return (
    <View>
      {sec.importDetails && (
        <Section title="IMPORT PAYMENT" hint="Needed while an Import Payment is In Progress - the Daily Activity Report writes the remittance line from it.">
          <Field label="BENEFICIARY (in favor of)" value={pd.beneficiary || ''} onChangeText={(v) => setPd({ beneficiary: v })} placeholder="Overseas vendor name" />
          <Field label="PAYMENT %" keyboardType="number-pad" value={pd.paymentPercent || ''} onChangeText={(v) => setPd({ paymentPercent: v.replace(/[^0-9.]/g, '') })} placeholder="e.g. 30" />
          <InlinePick label="PAYMENT TYPE" value={pd.paymentType || ''} options={PAYMENT_TYPES.map((x) => [x, x])} onChange={(v) => setPd({ paymentType: v })} />
          <InlinePick label="PAYMENT AGAINST" value={pd.paymentAgainst || ''} options={PAYMENT_AGAINST.map((x) => [x, x])} onChange={(v) => setPd({ paymentAgainst: v })} />
        </Section>
      )}

      {sec.subCategory && (
        <Section title="SUB CATEGORY" hint="This category needs a Sub Category (and its fields) before it is completed.">
          <InlinePick label="SUB CATEGORY" value={draft.subCategory || ''} options={(lists.subCategories || []).map((x) => [x.name, x.name])}
            onChange={(v) => { set({ subCategory: v || null, subCategoryFields: v === draft.subCategory ? scVals : {} }); const next = findSubCategory(lists, v); if (v && v !== draft.subCategory && next && next.fields.length) { subSnap.current = {}; setSubOpen(true); } }} />
          {!(lists.subCategories || []).length && <Small style={{ marginBottom: 8 }}>No Sub Categories yet - they are set up on the web app (Config) and arrive with Realtime Sync.</Small>}
          {!!sc && sc.fields.length > 0 && (
            <Pressable onPress={openSub} accessibilityRole="button" accessibilityLabel="Sub category details" style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.accent, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, alignSelf: 'flex-start' }}>
              <Text style={{ color: '#fff', fontWeight: '800', fontSize: t.fs(13.5) }}>Sub category details</Text>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: t.fs(11.5), backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 10, paddingHorizontal: 8 }}>{subFilled} of {sc.fields.length}</Text>
            </Pressable>
          )}
          <Sheet visible={subOpen && !!sc} onClose={() => { set({ subCategoryFields: subSnap.current }); setSubOpen(false); }} title={sc ? `${sc.name} - details` : ''}>
            {!!sc && sc.fields.map((f) => (
              <RuleField key={f.label} field={f} value={scVals[f.label]} onChange={(v) => set({ subCategoryFields: { ...scVals, [f.label]: v } })} />
            ))}
            <Btn title="Done" onPress={() => setSubOpen(false)} />
          </Sheet>
        </Section>
      )}

      {sec.narration && (
        <Section title="TALLY NARRATION (optional)" hint="Pick a narration type to build the Tally entry text. The vendor leads the report line and never goes into Tally.">
          <NarrationForm nd={nd} setNd={setNd} lists={lists} subText={subCategoryText(sc, scVals)} mailChain={draft.reference} importDetails={pd} />
        </Section>
      )}
    </View>
  );
}

