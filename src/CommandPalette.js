/**
 * web.app only: a Spotlight-style quick finder (Cmd/Ctrl + K). Type to jump to a tab or open an entry (title, mail chain,
 * banker, person); Up / Down choose, Enter opens, Esc closes.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, Modal, Platform } from 'react-native';

const WEB = Platform.OS === 'web';
import { useTheme } from './theme';

const norm = (v) => String(v || '').toLowerCase();

export default function CommandPalette({ visible, onClose, tabs, entries, onGoTab, onOpenEntry, onQuickAdd }) {
  const t = useTheme();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  useEffect(() => { if (visible) { setQ(''); setSel(0); setTimeout(() => input.current && input.current.focus(), 60); } }, [visible]);

  const results = useMemo(() => {
    const k = norm(q).trim();
    const tabRows = tabs.filter((x) => !k || norm(x.label).includes(k)).map((x) => ({ key: `t-${x.key}`, kind: 'Go to', icon: '↗', title: x.label, run: () => onGoTab(x.key) }));
    const entryRows = k
      ? entries.filter((e) => !e.binned && norm(`${e.title} ${e.reference || ''} ${e.pendingWith || ''} ${e.category || ''}`).includes(k)).slice(0, 8)
        .map((e) => ({ key: `e-${e.id}`, kind: e.done ? 'Completed' : 'Entry', icon: e.done ? '✓' : '•', title: e.title, sub: [e.category, e.status, e.reference].filter(Boolean).join(' · '), run: () => onOpenEntry(e) }))
      : [];
    const add = k && onQuickAdd ? [{ key: 'quick', kind: 'New task', icon: '➕', title: `Create: ${q.trim()}`, sub: 'Opens the form filled in from the sentence', run: () => onQuickAdd(q.trim()) }] : [];
    return [...entryRows, ...tabRows, ...add];
  }, [q, tabs, entries]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (r) => { if (!r) return; onClose(); setTimeout(r.run, 30); };
  const onKeyPress = (ev) => {
    const key = ev.nativeEvent.key;
    if (key === 'ArrowDown') { ev.preventDefault && ev.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    else if (key === 'ArrowUp') { ev.preventDefault && ev.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (key === 'Escape') onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} accessibilityLabel="Close" style={{ flex: 1, alignItems: 'center', paddingTop: '12%', backgroundColor: 'rgba(0,0,0,0.28)', ...(WEB ? { backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' } : null) }}>
        <Pressable onPress={() => {}} style={{ width: '92%', maxWidth: 640, borderRadius: 16, overflow: 'hidden', backgroundColor: WEB ? t.bar : t.surface, ...t.shadow, ...(WEB ? { backdropFilter: 'blur(40px) saturate(180%)', WebkitBackdropFilter: 'blur(40px) saturate(180%)', boxShadow: `0 0 0 0.5px ${t.sideEdge}, 0 30px 80px rgba(0,0,0,0.35)`, animation: 'wdPop .22s cubic-bezier(.2,.9,.3,1.2)' } : null) }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: t.sideEdge }}>
            <Text style={{ fontSize: t.fs(20), color: t.textDim }}>⌕</Text>
            <TextInput ref={input} value={q} onChangeText={(v) => { setQ(v); setSel(0); }} onKeyPress={onKeyPress} onSubmitEditing={() => go(results[sel])} returnKeyType="go" placeholder="Search entries, or jump to a tab…" placeholderTextColor={t.textDim}
              style={{ flex: 1, color: t.text, fontSize: t.fs(18), padding: 0, ...(WEB ? { outlineStyle: 'none' } : null) }} />
            {WEB && <Text style={{ color: t.textDim, fontSize: t.fs(12), borderWidth: 0.5, borderColor: t.sideEdge, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 }}>esc</Text>}
          </View>
          <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ padding: 8 }}>
            {!results.length && <Text style={{ color: t.textDim, padding: 14 }}>Nothing found.</Text>}
            {results.map((r, i) => (
              <Pressable key={r.key} onPress={() => go(r)} onHoverIn={() => setSel(i)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 9, backgroundColor: i === sel ? t.accent : 'transparent' }}>
                <Text style={{ width: 20, textAlign: 'center', color: i === sel ? '#fff' : t.accent, fontWeight: '800' }}>{r.icon}</Text>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ color: i === sel ? '#fff' : t.text, fontWeight: '600', fontSize: t.fs(14.5) }}>{r.title}</Text>
                  {!!r.sub && <Text numberOfLines={1} style={{ color: i === sel ? 'rgba(255,255,255,0.8)' : t.textDim, fontSize: t.fs(12) }}>{r.sub}</Text>}
                </View>
                <Text style={{ color: i === sel ? 'rgba(255,255,255,0.8)' : t.textDim, fontSize: t.fs(11.5) }}>{r.kind}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
