import React from 'react';
import { View, Text } from 'react-native';
import { Card, Small, Btn } from '../ui';
import { useTheme } from '../theme';
import { fmtDate } from './wdCards';

// The Bin tab (both platforms): tasks binned from their form, each with Restore. Split out of WorkingDashboard.js unchanged.
export default function WdBinTab({ binnedEntries, act }) {
  const t = useTheme();
  return (
    <View>
      {!binnedEntries.length && <Card><Small>The Bin is empty. A task you bin from its form stays here until you restore it.</Small></Card>}
      {binnedEntries.map((entry) => (
        <View key={entry.id} style={{ marginBottom: 10, borderRadius: t.radius, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, padding: 14, gap: 10, ...t.shadow }}>
          <Text style={{ color: t.text, fontWeight: '700', fontSize: t.fs(15), lineHeight: t.fs(20) }} numberOfLines={2}>{entry.title}</Text>
          <Small>{[entry.priority, entry.category, entry.dueAt ? `Due ${fmtDate(entry.dueAt)}` : ''].filter(Boolean).join(' · ')}</Small>
          <Btn title="Restore" onPress={() => act(entry, 'restore')} />
        </View>
      ))}
    </View>
  );
}
