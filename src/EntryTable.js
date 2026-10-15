/**
 * web.app (wide screens): the Register / Completed list as a table, like a Finder list view. Click a row to open it;
 * the header stays on screen while the page scrolls.
 */
import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTheme } from './theme';
import { useLayout } from './ui';

const prioColor = (t, p) => (p === 'High' ? t.danger : p === 'Low' ? t.ok : t.warn);
const day = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const date = d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  return d.getHours() || d.getMinutes() ? `${date} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : date;
};

/** columns: [{ key, label, flex, render?(entry) }] - the default set suits open entries. */
export default function EntryTable({ entries, onOpen, mode = 'open', completedAt }) {
  const t = useTheme();
  const compact = !useLayout().tablet;      // phone width: the task and one date, so the title keeps room
  const cols = compact
    ? (mode === 'done' ? [['Task', 3, (e) => e.title], ['Completed', 1.3, (e) => day(completedAt ? completedAt(e) : e.completedAt)]] : [['Task', 3, (e) => e.title], ['Due', 1.3, (e) => day(e.dueAt)]])
    : mode === 'done'
    ? [['Task', 4, (e) => e.title], ['Category', 2, (e) => e.category], ['Pending with', 1.5, (e) => e.pendingWith], ['Completed', 1.6, (e) => day(completedAt ? completedAt(e) : e.completedAt)], ['Report', 1, (e) => (e.dar === false ? 'Done only' : 'DAR')]]
    : [['Task', 4, (e) => e.title], ['Category', 2, (e) => e.category], ['Status', 1.5, (e) => e.status], ['Pending with', 1.5, (e) => e.pendingWith], ['Due', 1.6, (e) => day(e.dueAt)]];
  return (
    <View style={{ backgroundColor: t.surface, borderRadius: t.radius, ...t.shadow }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 9, paddingHorizontal: 16, backgroundColor: t.surfaceAlt, borderBottomWidth: 0.5, borderBottomColor: t.border, borderTopLeftRadius: t.radius, borderTopRightRadius: t.radius, position: 'sticky', top: 0, zIndex: 1 }}>
        <View style={{ width: 22 }} />
        {cols.map(([label, flex]) => (
          <Text key={label} style={{ flex, color: t.textDim, fontWeight: '700', fontSize: t.fs(11.5), letterSpacing: 0.3, textTransform: 'uppercase' }}>{label}</Text>
        ))}
      </View>
      {entries.map((e, i) => {
        const overdue = mode === 'open' && e.dueAt && new Date(e.dueAt).getTime() < Date.now();
        return (
          <Pressable key={e.id} onPress={() => onOpen(e)} accessibilityRole="button" accessibilityLabel={e.title}
            style={({ hovered }) => ({ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, ...(i === entries.length - 1 ? { borderBottomLeftRadius: t.radius, borderBottomRightRadius: t.radius } : null), backgroundColor: hovered ? t.accent + '14' : i % 2 ? t.surfaceAlt + '66' : 'transparent' })}>
            <View style={{ width: 22 }}><View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: mode === 'done' ? t.ok : prioColor(t, e.priority) }} /></View>
            {cols.map(([label, flex, get], ci) => (
              <Text key={label} numberOfLines={1} style={{ flex, paddingRight: 10, color: ci === 0 ? t.text : label === 'Due' && overdue ? t.danger : t.textDim, fontWeight: ci === 0 || (label === 'Due' && overdue) ? '600' : '400', fontSize: t.fs(13.5) }}>{get(e) || '—'}</Text>
            ))}
          </Pressable>
        );
      })}
    </View>
  );
}
