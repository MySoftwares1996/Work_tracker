import React from 'react';
import { View, Text } from 'react-native';
import { EmptyState, Small, Btn } from '../ui';
import { useTheme } from '../theme';
import { fmtDate } from './wdCards';

// The Bin tab (both platforms): tasks binned from their form, each with Restore. Split out of WorkingDashboard.js unchanged.
export default function WdBinTab({ binnedEntries, act }) {
  const t = useTheme();
  return (
    <View>
      {!binnedEntries.length && <EmptyState icon="trash" title="The Bin is empty" text="A task you bin from its form stays here until you restore it." />}
      {binnedEntries.map((entry) => (
        <View key={entry.id} style={{ marginBottom: 12, borderRadius: t.radius, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, paddingVertical: 14, paddingHorizontal: 16, gap: 10 }}>
          <Text style={{ color: t.text, fontWeight: '700', fontSize: t.fs(15), lineHeight: t.fs(20) }} numberOfLines={2}>{entry.title}</Text>
          <Small>{[entry.priority, entry.category, entry.dueAt ? `Due ${fmtDate(entry.dueAt)}` : ''].filter(Boolean).join(' · ')}</Small>
          <Btn kind="soft" title="Restore" onPress={() => act(entry, 'restore')} />
        </View>
      ))}
    </View>
  );
}
