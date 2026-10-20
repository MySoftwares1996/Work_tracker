import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Label } from '../ui';
import Icon from '../icons';
import { useTheme, blend } from '../theme';

/**
 * Priority as separate buttons (High / Medium / Low ...): white with a line; the chosen one takes its own tint -
 * red for High, amber for Medium, the primary tint for the rest.
 */
export function PrioritySegment({ options, value, onChange, label = 'PRIORITY' }) {
  const t = useTheme();
  const toneOf = (name) => (name === 'High' ? [t.dangerTint, blend(t.danger, 0.45, t.surface), t.dangerText] : name === 'Medium' ? [t.warnTint, blend(t.amber, 0.5, t.surface), t.warnText] : [t.tint, blend(t.primary, 0.5, t.surface), t.tintText]);
  return (
    <View style={{ marginBottom: 14 }}>
      <Label>{label}</Label>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((name) => {
          const on = String(value || '') === String(name);
          const [bg, line, ink] = toneOf(name);
          return (
            <Pressable key={name} onPress={() => onChange(name)} accessibilityRole="button" accessibilityState={{ selected: on }} accessibilityLabel={`Priority ${name}`}
              style={({ pressed }) => ({ flexGrow: 1, flexBasis: '28%', alignItems: 'center', paddingVertical: 12, borderRadius: 14, backgroundColor: on ? bg : t.surface, borderWidth: 1, borderColor: on ? line : t.fieldBorder, opacity: pressed ? 0.85 : 1 })}>
              <Text style={{ color: on ? ink : t.text, fontWeight: '800', fontSize: t.fs(13.5) }}>{name}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** A pill under MORE DETAILS that opens a popup: tinted when it already holds something, white with a line when empty. */
export function DetailChip({ icon, label, filled, onPress }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: filled ? t.tint : t.surface, borderWidth: filled ? 0 : 1, borderColor: t.fieldBorder, opacity: pressed ? 0.85 : 1 })}>
      <Icon name={icon} size={16} color={filled ? t.tintText : t.text} stroke={2} />
      <Text numberOfLines={1} style={{ color: filled ? t.tintText : t.text, fontWeight: '700', fontSize: t.fs(13), maxWidth: 220 }}>{label}</Text>
    </Pressable>
  );
}
