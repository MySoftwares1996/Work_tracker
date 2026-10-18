import React from 'react';
import { View, Text, Alert, Pressable } from 'react-native';
import { Small, P, Row, SearchField, PickerButton, Choices } from '../ui';
import Icon from '../icons';
import { useTheme } from '../theme';
import { toDateKey, nextWorkingDay, holidayBlocks, isOfficeClosed } from '../workingDashboard';
import { RoundBtn, CardGrid } from './wdCards';
import WdCalendar from './WdCalendar';

// The Holidays tab (phone layout and web). Split out of WorkingDashboard.js unchanged; the search / filter state stays in the parent so it survives a tab switch.
export default function WdHolidaysTab({ entries, holidayList, leaveList, openEditEntry, openNewHoliday, setHolidaySheet, removeHoliday, holQuery, setHolQuery, holCalendar, setHolCalendar, holCalendarOpen, setHolCalendarOpen, holAlertsOnly, setHolAlertsOnly }) {
  const t = useTheme();
  // "Both" (the APK and the website on a phone): the web app's Holidays tab in one column - search, a holiday
  // calendar filter and "Alerts-on only", the continuous holidays, then a card per holiday (upcoming first).
  const PALETTE = [t.accent, t.ok, t.warn, t.purple, t.accent2, t.pink, t.indigo, t.danger].filter(Boolean);     // one colour per holiday calendar
  const calendars = ['USD Holiday', 'Indian Bank Holiday', ...holidayList.map((h) => h.tag).filter(Boolean)].filter((x, i, a) => a.indexOf(x) === i);
  const colourOf = (tag) => PALETTE[Math.max(0, calendars.indexOf(tag)) % PALETTE.length];
  const todayK = toDateKey(new Date());
  const q = holQuery.trim().toLowerCase();
  const list = holidayList
    .filter((h) => (!q || h.title.toLowerCase().includes(q) || h.date.includes(q))
      && (holCalendar === 'All' || h.tag === holCalendar)
      && (!holAlertsOnly || h.alert !== false))
    .sort((a, b) => {
      const au = (a.endDate || a.date) >= todayK; const bu = (b.endDate || b.date) >= todayK;
      if (au !== bu) return au ? -1 : 1;
      return au ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date);
    });
  const blocks = holidayBlocks(holidayList);
  const dayText = (k) => new Date(`${k}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const shortDay = (k) => new Date(`${k}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const weekend = (k) => [0, 6].includes(new Date(`${k}T12:00:00`).getDay());
  const pill = (text, color) => (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: t.surfaceAlt }}>
      <Text style={{ color: color || t.textDim, fontSize: t.fs(12), fontWeight: color ? '700' : '500' }}>{text}</Text>
    </View>
  );
  return (
    <View>
      {/* The month at a glance: holidays, leave and the tasks due each day. */}
      <View style={{ marginBottom: 12 }}><WdCalendar entries={entries} holidays={holidayList} leaveDays={leaveList} onOpen={(e) => openEditEntry(e)} /></View>
      <Row gap={8} style={{ marginBottom: 8 }}>
        <SearchField style={{ flex: 1 }} value={holQuery} onChangeText={setHolQuery} placeholder="Search holidays" />
        <Pressable onPress={openNewHoliday} accessibilityRole="button" accessibilityLabel="Add holiday" style={{ width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: t.primary }}>
          <Icon name="plus" size={22} color={t.onAccent} stroke={2.2} />
        </Pressable>
      </Row>
      <Row gap={8} style={{ marginBottom: 12, alignItems: 'center' }}>
        <View style={{ flex: 1 }}><PickerButton text={holCalendar === 'All' ? 'All Holiday Calendars' : holCalendar} onPress={() => setHolCalendarOpen((v) => !v)} /></View>
        <Pressable onPress={() => setHolAlertsOnly((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: holAlertsOnly }} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 20, height: 20, borderRadius: 5, alignItems: 'center', justifyContent: 'center', backgroundColor: holAlertsOnly ? t.primary : 'transparent', borderWidth: holAlertsOnly ? 0 : 2, borderColor: t.textDim }}>
            {holAlertsOnly && <Icon name="check" size={14} color={t.onAccent} stroke={3} />}
          </View>
          <Text style={{ color: t.text, fontSize: t.fs(13) }}>Alerts-on only</Text>
        </Pressable>
      </Row>
      {holCalendarOpen && (
        <View style={{ marginBottom: 12 }}>
          <Choices options={[['All', 'All Holiday Calendars'], ...calendars.map((c) => [c, c])]} value={holCalendar} onChange={(v) => { setHolCalendar(v); setHolCalendarOpen(false); }} />
        </View>
      )}
      {blocks.map((b) => (
        <View key={b.start} style={{ marginBottom: 8, padding: 12, borderRadius: 14, backgroundColor: t.tint, opacity: b.end < todayK ? 0.6 : 1 }}>
          <Text style={{ color: t.tintText, fontSize: t.fs(13.5) }}>
            <Text style={{ fontWeight: '800' }}>{b.days}-day continuous holiday</Text>
            {` · ${shortDay(b.start)} – ${shortDay(b.end)}${b.names.length ? ` · ${b.names.join(' + ')}` : ''}`}
          </Text>
        </View>
      ))}
      {!list.length && <P dim style={{ textAlign: 'center', marginVertical: 24 }}>{holidayList.length ? 'No holidays match.' : 'No holidays found - add one with the + button.'}</P>}
      {/* web.app: the holiday cards side by side (two a row); a phone-width screen keeps one a row. */}
      <CardGrid>{list.map((h) => {
        const past = (h.endDate || h.date) < todayK;
        const colour = colourOf(h.tag);
        const next = nextWorkingDay(h.endDate || h.date, holidayList, leaveList);
        return (
          <View key={h.id} style={{ marginTop: 10, padding: 16, borderRadius: t.radius, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, opacity: past ? 0.6 : 1 }}>
            <Row style={{ alignItems: 'flex-start', gap: 8 }}>
              <View style={{ marginTop: 2 }}><Icon name={h.alert === false ? 'bellOff' : 'bell'} size={17} color={h.alert === false ? t.textDim : t.primary} stroke={1.9} /></View>
              <Text style={{ flex: 1, color: t.text, fontWeight: '800', fontSize: t.fs(15.5) }} numberOfLines={2}>
                {h.title}{isOfficeClosed(h) ? '  (office closed)' : ''}
              </Text>
              {!!h.tag && (
                <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: colour + '22', borderWidth: 1, borderColor: colour + '55', maxWidth: '45%' }}>
                  <Text style={{ color: colour, fontWeight: '700', fontSize: t.fs(11.5) }} numberOfLines={2}>{h.tag}</Text>
                </View>
              )}
            </Row>
            <Row style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {pill(h.endDate ? `${dayText(h.date)} – ${dayText(h.endDate)}` : dayText(h.date), weekend(h.date) ? t.danger : null)}
              {pill(`Next working: ${dayText(next)}`)}
            </Row>
            <Row style={{ justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <RoundBtn icon="edit" a11y="Edit holiday" onPress={() => setHolidaySheet(h)} />
              <RoundBtn icon="trash" a11y="Delete holiday" color={t.danger} onPress={() => Alert.alert('Delete this holiday?', h.title, [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => removeHoliday(h.id) }])} />
            </Row>
          </View>
        );
      })}</CardGrid>
      {!!holidayList.length && <Small style={{ textAlign: 'center', marginTop: 12 }}>{holidayList.length} holidays{leaveList.length ? ` · ${leaveList.length} leave days` : ''}</Small>}
    </View>
  );
}
