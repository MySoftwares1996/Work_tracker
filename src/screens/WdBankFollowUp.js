import React from 'react';
import { View, Text, Pressable, Alert } from 'react-native';
import { Field, Small, DateTimeField, Row, useLayout } from '../ui';
import { useTheme } from '../theme';
import { bankFollowUps, fmtFollowDate, followUpWho, withQuickRemark, DEFAULT_QUICK_REMARKS } from '../bankFollowUp';

/**
 * A bank follow-up task's follow-ups so far (newest first), then today's: the banker's remarks / update and the
 * next follow-up date they gave. Used by the card's 📞 button and by the entry form ("Both": phone-width screens).
 * `draft` = { remarks, next }; `onChange(patch)`.
 */
export function BankFollowUpForm({ entry, draft, onChange, title = 'BANK FOLLOW-UPS', quickRemarks, onQuickRemarks }) {
  const t = useTheme();
  const log = bankFollowUps(entry).slice().reverse();
  // "Both" (phone-width screens): who the follow-up was with - the bank and the banker's name.
  const phone = !useLayout().tablet;
  return (
    <View style={{ padding: 12, borderRadius: 14, marginBottom: 14, backgroundColor: t.accent + '0F', borderWidth: 1, borderColor: t.accent + '33' }}>
      <Text style={{ color: t.accent, fontWeight: '800', fontSize: t.fs(13), marginBottom: 2 }}>{title}</Text>
      <Small style={{ marginBottom: 10 }}>Each day's follow-up and the banker's update go into that day's Daily Activity Report. The task stays open and is due again on the next follow-up date.</Small>
      {phone && (
        <Row gap={10}>
          <View style={{ flex: 1 }}><Field label="BANK" value={draft.bank || ''} onChangeText={(v) => onChange({ bank: v })} placeholder="e.g. SBI" /></View>
          <View style={{ flex: 1 }}><Field label="BANKER NAME" value={draft.banker || ''} onChangeText={(v) => onChange({ banker: v })} placeholder="e.g. Mr. Rao" /></View>
        </Row>
      )}
      {/* "Both" (phone-width screens): one-tap remarks. Long-press one to remove it; "＋ Save" keeps what is typed as a new one. */}
      {phone && !!onQuickRemarks && (() => {
        const list = Array.isArray(quickRemarks) ? quickRemarks : DEFAULT_QUICK_REMARKS;
        const typed = String(draft.remarks || '').trim();
        const canSave = typed && typed.length <= 60 && !list.some((x) => x.toLowerCase() === typed.toLowerCase());
        const pill = (label, onPress, onLongPress, key, strong) => (
          <Pressable key={key} onPress={onPress} onLongPress={onLongPress} accessibilityRole="button" accessibilityLabel={label}
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: strong ? t.accent + '1F' : t.surfaceAlt, borderWidth: 1, borderColor: strong ? t.accent + '55' : t.border }}>
            <Text style={{ color: strong ? t.accent : t.text, fontSize: t.fs(12.5), fontWeight: strong ? '700' : '500' }}>{label}</Text>
          </Pressable>
        );
        return (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
            {list.map((r, i) => pill(r, () => onChange({ remarks: withQuickRemark(draft.remarks, r) }), () => Alert.alert('Remove quick remark?', r, [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Remove', style: 'destructive', onPress: () => onQuickRemarks(list.filter((x) => x !== r)) },
            ]), `q-${i}`))}
            {canSave && pill('＋ Save as quick remark', () => onQuickRemarks([...list, typed]), undefined, 'save', true)}
          </View>
        );
      })()}
      <Field label="TODAY'S BANKER REMARKS / UPDATE" multiline value={draft.remarks || ''} onChangeText={(v) => onChange({ remarks: v })} placeholder="What the banker said" />
      <DateTimeField label="NEXT FOLLOW-UP (as informed by the banker)" value={draft.next} onChange={(v) => onChange({ next: v })} />
      {!!log.length && <Small style={{ marginTop: 4, marginBottom: 6, fontWeight: '700' }}>FOLLOW-UPS SO FAR ({log.length})</Small>}
      {log.map((f, i) => (
        <View key={`${f.at || f.d}-${i}`} style={{ paddingVertical: 7, borderTopWidth: i ? 1 : 0, borderTopColor: t.border }}>
          <Text style={{ color: t.text, fontWeight: '700', fontSize: t.fs(13) }}>{fmtFollowDate(f.at || `${f.d}T12:00:00`)}{followUpWho(f) ? ` · ${followUpWho(f)}` : ''}{f.next ? `  →  next ${fmtFollowDate(f.next)}` : ''}</Text>
          {!!f.remarks && <Text style={{ color: t.textDim, fontSize: t.fs(13), marginTop: 2 }}>{f.remarks}</Text>}
        </View>
      ))}
    </View>
  );
}
