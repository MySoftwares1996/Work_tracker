/**
 * "This week" card for the phone Home: three short stat lines and up to three slipping tasks (snoozed 3+ times or 7+ days overdue).
 * The logic is src/weeklyReview.js (shared with the website); this is only the Ledger presentation.
 */
import React, { useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTheme } from '../theme';
import { display } from '../fonts';
import { weeklyReview, slipReason } from '../weeklyReview';

const SHOWN = 3;

export default function WdWeeklyReview({ entries, holidays, leaveDays, onOpen, now }) {
  const t = useTheme();
  const r = useMemo(() => weeklyReview(entries, now || new Date(), { holidays, leaveDays }), [entries, holidays, leaveDays, now]);
  if (r.empty) return null;
  const line = (label, value, tone) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingVertical: 1 }}>
      <Text style={{ color: t.text, fontWeight: '600', fontSize: t.fs(14) }}>{label}</Text>
      <Text style={{ color: tone && value ? tone : t.text, fontFamily: display(), fontWeight: '600', fontSize: t.fs(20) }}>{value}</Text>
    </View>
  );
  return (
    <View accessibilityLabel="This week" style={{ paddingVertical: 14, paddingHorizontal: 16, borderRadius: t.radius, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border }}>
      <Text style={{ color: t.textDim, fontWeight: '800', fontSize: t.fs(11), letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 6 }}>This week</Text>
      {line('Done since Monday', r.doneThisWeek, t.primary)}
      {line('Due in the next 7 days', r.dueSoon.count)}
      {line('Overdue', r.overdue, t.danger)}
      {!!r.slipping.length && (
        <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.border }}>
          <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(13.5), marginBottom: 4 }}>Slipping{r.slipping.length > SHOWN ? ` (${r.slipping.length})` : ''}</Text>
          {r.slipping.slice(0, SHOWN).map((s) => (
            <Pressable key={s.entry.id} onPress={() => onOpen && onOpen(s.entry)} accessibilityRole="button" accessibilityLabel={`${s.entry.title}, ${slipReason(s)}`} style={({ pressed }) => ({ paddingVertical: 6, opacity: pressed ? 0.6 : 1 })}>
              <Text style={{ color: t.text, fontWeight: '600', fontSize: t.fs(14) }} numberOfLines={1}>{s.entry.title || 'Untitled'}</Text>
              <Text style={{ color: t.danger, fontSize: t.fs(12) }}>{slipReason(s)}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
