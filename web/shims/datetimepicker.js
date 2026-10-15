/**
 * @react-native-community/datetimepicker in the browser: the browser's own date / time picker, behind the
 * same props and onChange(event, date) the app's fields already use (src/ui.js). It opens straight away, as
 * the Android dialog does; Cancel (or Esc) reports "dismissed".
 */
import React from 'react';
import { View, Pressable, Text } from 'react-native';
import { useTheme } from '../../src/theme';

const p2 = (n) => String(n).padStart(2, '0');
const toInput = (d, mode) => (mode === 'time'
  ? `${p2(d.getHours())}:${p2(d.getMinutes())}`
  : `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`);

function fromInput(str, mode, base) {
  const next = new Date(base);
  if (mode === 'time') {
    const [h, m] = str.split(':').map(Number);
    next.setHours(h || 0, m || 0, 0, 0);
  } else {
    const [y, mo, d] = str.split('-').map(Number);
    next.setFullYear(y, (mo || 1) - 1, d || 1);
  }
  return next;
}

export default function DateTimePicker({ value, mode = 'date', minimumDate, maximumDate, onChange }) {
  const t = useTheme();
  const kind = mode === 'time' ? 'time' : 'date';
  const base = value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date();
  const ref = React.useRef(null);
  const done = React.useRef(false);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    try { el.showPicker?.(); } catch { /* the field stays open to type in */ }
  }, []);

  const finish = (event, date) => {
    if (done.current) return;
    done.current = true;
    onChange?.(event, date);
  };

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
      {React.createElement('input', {
        ref,
        type: kind,
        defaultValue: toInput(base, kind),
        min: kind === 'date' && minimumDate ? toInput(minimumDate, 'date') : undefined,
        max: kind === 'date' && maximumDate ? toInput(maximumDate, 'date') : undefined,
        onChange: (e) => {
          if (!e.target.value) return;
          const picked = fromInput(e.target.value, kind, base);
          finish({ type: 'set', nativeEvent: { timestamp: picked.getTime() } }, picked);
        },
        onKeyDown: (e) => { if (e.key === 'Escape') finish({ type: 'dismissed' }); },
        style: {
          flex: 1, fontSize: 16, padding: kind === 'time' ? '8px 16px' : 8, borderRadius: kind === 'time' ? 999 : 8, border: `1px solid ${t.border}`,
          background: t.surfaceAlt, color: t.text, colorScheme: t.dark ? 'dark' : 'light',
        },
      })}
      <Pressable onPress={() => finish({ type: 'dismissed' })} style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
        <Text style={{ color: t.accent, fontWeight: '700' }}>Cancel</Text>
      </Pressable>
    </View>
  );
}

export const DateTimePickerAndroid = { open() {}, dismiss() {} };
