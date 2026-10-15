import React, { useEffect, useState } from 'react';
import { Modal, View, Text, Pressable, TextInput } from 'react-native';
import { useTheme } from './theme';

/**
 * The time picker, the same on the phone and the website: a small popup with the hour and minute boxes, AM / PM,
 * and a round clock face (hours first, then minutes in steps of five - the exact minute can be typed under the
 * keyboard button). Cancel / OK. Used by every time field (src/ui.js).
 */
const SIZE = 200;                 // the clock face
const R = 76;                     // where the numbers sit
const NUM = 30;                   // a number's circle
const p2 = (n) => String(n).padStart(2, '0');

export default function TimePickerModal({ visible, value, onCancel, onOk }) {
  const t = useTheme();
  const start = value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date();
  const [hour, setHour] = useState(start.getHours() % 12 || 12);
  const [minute, setMinute] = useState(start.getMinutes());
  const [pm, setPm] = useState(start.getHours() >= 12);
  const [step, setStep] = useState('hour');        // 'hour' | 'minute'
  const [typing, setTyping] = useState(false);
  const [hText, setHText] = useState('');
  const [mText, setMText] = useState('');

  useEffect(() => {
    if (!visible) return;
    const d = value instanceof Date && !Number.isNaN(value.getTime()) ? value : new Date();
    setHour(d.getHours() % 12 || 12); setMinute(d.getMinutes()); setPm(d.getHours() >= 12); setStep('hour'); setTyping(false);
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!visible) return null;
  const accent = t.accent;
  const place = (i, count) => { const a = (i / count) * 2 * Math.PI; return { x: SIZE / 2 + R * Math.sin(a) - NUM / 2, y: SIZE / 2 - R * Math.cos(a) - NUM / 2 }; };
  const nums = step === 'hour' ? Array.from({ length: 12 }, (_, i) => (i === 0 ? 12 : i)) : Array.from({ length: 12 }, (_, i) => i * 5);
  const selectedIndex = step === 'hour' ? hour % 12 : Math.round(minute / 5) % 12;
  const exact = step === 'minute' && minute % 5 !== 0;
  const deg = step === 'hour' ? (hour % 12) * 30 : minute * 6;
  const pick = (n) => {
    if (step === 'hour') { setHour(n); setStep('minute'); } else setMinute(n);
  };
  const ok = () => {
    let h = hour; let m = minute;
    if (typing) {
      const th = parseInt(hText, 10); const tm = parseInt(mText, 10);
      if (Number.isFinite(th)) h = Math.min(12, Math.max(1, th));
      if (Number.isFinite(tm)) m = Math.min(59, Math.max(0, tm));
    }
    const d = new Date(start);
    d.setHours((h % 12) + (pm ? 12 : 0), m, 0, 0);
    onOk(d);
  };
  const box = (text, on, onPress) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ width: 62, height: 52, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? accent + '22' : t.surfaceAlt }}>
      <Text style={{ fontSize: 30, color: on ? accent : t.text }}>{text}</Text>
    </Pressable>
  );
  const input = (val, setVal, ph) => (
    <TextInput value={val} onChangeText={(v) => setVal(v.replace(/[^0-9]/g, '').slice(0, 2))} placeholder={ph} placeholderTextColor={t.textDim} keyboardType="number-pad" maxLength={2}
      style={{ width: 62, height: 52, borderRadius: 10, textAlign: 'center', fontSize: 28, color: t.text, backgroundColor: t.surfaceAlt, borderWidth: 2, borderColor: accent }} />
  );
  return (
    <Modal transparent visible animationType="fade" onRequestClose={onCancel}>
      <Pressable onPress={onCancel} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <Pressable onPress={() => {}} style={{ width: 280, maxWidth: '100%', borderRadius: 20, backgroundColor: t.surface, padding: 18 }}>
          <Text style={{ color: t.textDim, fontSize: 11, letterSpacing: 1, marginBottom: 10 }}>SELECT TIME</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 12 }}>
            {typing ? input(hText, setHText, p2(hour)) : box(p2(hour), step === 'hour', () => setStep('hour'))}
            <Text style={{ fontSize: 28, color: t.text }}>:</Text>
            {typing ? input(mText, setMText, p2(minute)) : box(p2(minute), step === 'minute', () => setStep('minute'))}
            <View style={{ marginLeft: 6, borderRadius: 8, borderWidth: 1, borderColor: t.border, overflow: 'hidden' }}>
              {[['AM', false], ['PM', true]].map(([label, isPm]) => (
                <Pressable key={label} onPress={() => setPm(isPm)} accessibilityRole="button" style={{ paddingVertical: 9, paddingHorizontal: 11, backgroundColor: pm === isPm ? accent + '22' : 'transparent' }}>
                  <Text style={{ color: pm === isPm ? accent : t.textDim, fontWeight: '700', fontSize: 13 }}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>
          {!typing && (
            <View style={{ width: SIZE, height: SIZE, borderRadius: SIZE / 2, backgroundColor: t.surfaceAlt, alignSelf: 'center' }}>
              <View pointerEvents="none" style={{ position: 'absolute', left: SIZE / 2 - 1, top: SIZE / 2 - R, width: 2, height: 2 * R, transform: [{ rotate: `${deg}deg` }] }}>
                <View style={{ height: R, backgroundColor: accent }} />
              </View>
              <View pointerEvents="none" style={{ position: 'absolute', left: SIZE / 2 - 3, top: SIZE / 2 - 3, width: 6, height: 6, borderRadius: 3, backgroundColor: accent }} />
              {nums.map((n, i) => {
                const { x, y } = place(i, 12);
                const on = i === selectedIndex && !exact;
                return (
                  <Pressable key={n} onPress={() => pick(n)} accessibilityRole="button" accessibilityLabel={`${n}`}
                    style={{ position: 'absolute', left: x, top: y, width: NUM, height: NUM, borderRadius: NUM / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? accent : 'transparent' }}>
                    <Text style={{ color: on ? '#fff' : t.text, fontSize: 14 }}>{step === 'minute' ? p2(n) : n}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
            <Pressable onPress={() => { setTyping((v) => !v); setHText(''); setMText(''); }} accessibilityRole="button" accessibilityLabel="Type the time" hitSlop={8}>
              <Text style={{ fontSize: 20, color: t.textDim }}>{typing ? '🕒' : '⌨'}</Text>
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 22 }}>
              <Pressable onPress={onCancel} accessibilityRole="button" hitSlop={8}><Text style={{ color: accent, fontWeight: '700', fontSize: 14 }}>CANCEL</Text></Pressable>
              <Pressable onPress={ok} accessibilityRole="button" hitSlop={8}><Text style={{ color: accent, fontWeight: '700', fontSize: 14 }}>OK</Text></Pressable>
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
