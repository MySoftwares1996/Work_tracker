import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Card, Small, Row } from '../ui';
import Icon from '../icons';
import { useTheme } from '../theme';
import { calendarWeeks, toDateKey, isNonWorkingDay } from '../workingDashboard';
import { isBankFollowUpCategory } from '../bankFollowUp';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const BUSY = 5;     // a day with this many tasks or more is marked busy

/**
 * web.app: a month calendar of the open tasks by due date - a crowded day stands out before it arrives. A day with
 * BUSY or more tasks is amber, past days still holding tasks are red, days off are greyed. Click a day for its list.
 */
export default function WdCalendar({ entries, holidays = [], leaveDays = [], onOpen }) {
  const t = useTheme();
  const now = new Date();
  const [shift, setShift] = useState(0);                // months from this one
  const [pick, setPick] = useState(toDateKey(now));
  const view = new Date(now.getFullYear(), now.getMonth() + shift, 1, 12);
  const weeks = useMemo(() => calendarWeeks(entries, view.getFullYear(), view.getMonth()), [entries, view.getFullYear(), view.getMonth()]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = toDateKey(now);
  const picked = weeks.flat().find((d) => d.key === pick);
  const navBtn = (label, onPress, a11y) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11y} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 12, backgroundColor: t.surfaceAlt }}>
      <Text style={{ color: t.text, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
  return (
    <Card style={{ marginTop: 14 }}>
      <Row style={{ alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Icon name="calendar" size={17} color={t.textDim} stroke={1.9} />
        <Small style={{ flex: 1, fontWeight: '800', letterSpacing: 0.8, textTransform: 'uppercase' }}>Calendar · {MONTHS[view.getMonth()]} {view.getFullYear()}</Small>
        {navBtn('‹', () => setShift((n) => n - 1), 'Previous month')}
        {shift !== 0 && navBtn('Today', () => { setShift(0); setPick(today); }, 'This month')}
        {navBtn('›', () => setShift((n) => n + 1), 'Next month')}
      </Row>
      <View style={{ flexDirection: 'row' }}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <Text key={d} style={{ flex: 1, textAlign: 'center', color: t.textDim, fontSize: t.fs(12), fontWeight: '700', marginBottom: 4 }}>{d}</Text>)}
      </View>
      {weeks.map((week) => (
        <View key={week[0].key} style={{ flexDirection: 'row' }}>
          {week.map((d) => {
            const n = d.tasks.length;
            const past = d.key < today;
            const off = isNonWorkingDay(d.key, holidays, leaveDays);
            const tone = n && past ? t.danger : n >= BUSY ? t.warn : n ? t.accent : null;
            const on = d.key === pick;
            return (
              <Pressable key={d.key} onPress={() => setPick(d.key)} accessibilityRole="button" accessibilityLabel={`${d.key}: ${n} task${n === 1 ? '' : 's'}`}
                style={{ flex: 1, minHeight: 56, margin: 2, padding: 6, borderRadius: 10, opacity: d.inMonth ? 1 : 0.4,
                  backgroundColor: on ? t.tint : off ? t.surfaceAlt : 'transparent', borderWidth: d.key === today ? 2 : 1, borderColor: d.key === today ? t.primary : t.border }}>
                <Text style={{ color: off ? t.textDim : t.text, fontWeight: '700', fontSize: t.fs(13) }}>{d.day}</Text>
                {!!n && (
                  <View style={{ alignSelf: 'flex-start', marginTop: 4, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 999, backgroundColor: tone + '22' }}>
                    <Text style={{ color: tone, fontWeight: '800', fontSize: t.fs(12) }}>{n}</Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
      <Small style={{ marginTop: 6 }}>Amber: {BUSY}+ tasks due · Red: past days with tasks still open · Grey: Sundays, holidays and leave</Small>
      {!!picked && (
        <View style={{ marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: t.border }}>
          <Text style={{ color: t.text, fontWeight: '800', marginBottom: 6 }}>
            {new Date(`${picked.key}T12:00:00`).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })} · {picked.tasks.length} task{picked.tasks.length === 1 ? '' : 's'}
          </Text>
          {!picked.tasks.length && <Small>Nothing due.</Small>}
          {picked.tasks.map((e) => (
            <Pressable key={e.id} onPress={() => onOpen(e)} accessibilityRole="button" style={{ flexDirection: 'row', gap: 8, paddingVertical: 6 }}>
              <Text style={{ width: 70, color: t.textDim, fontSize: t.fs(13) }}>{new Date(e.dueAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
              <Text style={{ flex: 1, color: t.text, fontSize: t.fs(13.5) }} numberOfLines={1}>{e.title}</Text>
              <Text style={{ color: t.textDim, fontSize: t.fs(12.5) }} numberOfLines={1}>{e.category || ''}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </Card>
  );
}
