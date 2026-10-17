import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { Btn, Row, Field, Sheet, DateTimeField } from '../ui';
import { useTheme } from '../theme';
import { holidayDateKey, isOfficeClosed } from '../workingDashboard';

// The Holiday editor sheet (add / edit / delete a holiday). Split out of WorkingDashboard.js unchanged.
export default function WdHolidaySheet({ holidaySheet, setHolidaySheet, holidayList, saveHoliday, removeHoliday }) {
  const t = useTheme();
  return (
    <Sheet visible={!!holidaySheet} onClose={() => setHolidaySheet(null)} title="Holiday">
      {!!holidaySheet && (
        <View>
          <Field label="Name" value={holidaySheet.title} onChangeText={(v) => setHolidaySheet({ ...holidaySheet, title: v })} placeholder="e.g. Gandhi Jayanti" />
          <Row gap={10}>
            <View style={{ flex: 1 }}><DateTimeField label="Date" mode="date" value={holidaySheet.date ? new Date(`${holidayDateKey(holidaySheet.date)}T12:00:00`).toISOString() : null} onChange={(v) => setHolidaySheet({ ...holidaySheet, date: holidayDateKey(new Date(v)) })} /></View>
            <View style={{ flex: 1 }}><DateTimeField label="End date (optional)" mode="date" value={holidaySheet.endDate ? new Date(`${holidayDateKey(holidaySheet.endDate)}T12:00:00`).toISOString() : null} onChange={(v) => setHolidaySheet({ ...holidaySheet, endDate: holidayDateKey(new Date(v)) })} /></View>
          </Row>
          <Field label="Holiday calendar (optional)" value={holidaySheet.tag} onChangeText={(v) => setHolidaySheet({ ...holidaySheet, tag: v })} placeholder="e.g. Indian Bank Holiday, USD Holiday" />
          {/* The web app's "Office closed" tick: a closed day moves Daily tasks on and is offered "Postpone"; a market-only (USD) holiday is a working day. */}
          <Pressable onPress={() => setHolidaySheet({ ...holidaySheet, officeClosed: !isOfficeClosed(holidaySheet) })} accessibilityRole="checkbox" accessibilityState={{ checked: isOfficeClosed(holidaySheet) }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <View style={{ width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: isOfficeClosed(holidaySheet) ? t.accent : 'transparent', borderWidth: isOfficeClosed(holidaySheet) ? 0 : 2, borderColor: t.accent }}>
              {isOfficeClosed(holidaySheet) && <Text style={{ color: t.onAccent, fontWeight: '900' }}>✓</Text>}
            </View>
            <Text style={{ flex: 1, color: t.text, fontSize: t.fs(14) }}><Text style={{ fontWeight: '800' }}>Office closed</Text> - untick for a market-only holiday (a working day here)</Text>
          </Pressable>
          <Btn title="Save" onPress={saveHoliday} />
          {holidayList.some((x) => x.id === holidaySheet.id) && (
            <Btn style={{ marginTop: 8 }} kind="danger" title="Delete" onPress={() => { removeHoliday(holidaySheet.id); setHolidaySheet(null); }} />
          )}
        </View>
      )}
    </Sheet>
  );
}
