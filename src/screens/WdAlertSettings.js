import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, Switch, AppState, Platform, Alert } from 'react-native';
import { Card, P, Small, Btn, Row, Field, DateTimeField, useLayout } from '../ui';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme';
import { DEFAULT_ALERTS } from '../workingDashboard';
import { readAlertLog, clearAlertLog } from '../alertLog';
import { useRealtimeStatus } from '../realtimeStatus';
import {
  trackerAvailable, isExactAlarmAllowed, requestExactAlarmPermission, isBatteryOptimised, requestBatteryExemption,
  isFullScreenIntentAllowed, requestFullScreenIntentPermission, setAlarmStyle, setAlarmDelivery, setAlarmBanner, canDrawOverlays, requestOverlayPermission, scheduleFullScreenAlarm,
} from '../tracker';
import { WEB_ALARM_STYLES, previewWebAlarm } from '../WebAlarm';
import { warnQuiet } from '../quietCatch';

// The phone's full-screen alarm looks (modules/native-tools AlarmStyles.kt), in the same order.
const PHONE_ALARM_STYLES = [
  [1, 'Classic dark'], [2, 'Red alert'], [3, 'Light & clean'], [4, 'Alarm clock'],
  [5, 'Task card'], [6, 'Big bottom buttons'], [7, 'Priority colour band'],
];

/** "HH:MM" <-> today's date at that time, for the time picker. */
const clockToIso = (hhmm, fallback) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '')) || /^(\d{1,2}):(\d{2})$/.exec(fallback);
  const d = new Date(); d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d.toISOString();
};
const isoToClock = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

/**
 * A time of day ("HH:MM"). "Both" (phone-width screens): picked from the time picker, so a typo like "9.30" cannot
 * slip in. Wider screens keep the typed field.
 */
function ClockField({ label, value, fallback, onChange }) {
  const phone = !useLayout().tablet;
  if (!phone) return <Field label={`${label} (HH:MM)`} value={value} onChangeText={onChange} placeholder={fallback} />;
  return <DateTimeField label={label} mode="time" value={clockToIso(value, fallback)} onChange={(v) => v && onChange(isoToClock(v))} />;
}

const LEADS = [[5, '5 min'], [15, '15 min'], [30, '30 min'], [60, '1 hr'], [120, '2 hr'], [1440, '1 day']];

/**
 * Config > Alerts: when Working Dashboard entries alert, and whether the phone
 * lets them ring with the app closed. The three phone settings are the usual
 * reasons an alert arrives late or not at all, each one tap away.
 */
export default function WdAlertSettings({ alerts, onChange, priorities = [] }) {
  const t = useTheme();
  const nav = useNavigation();
  const [log, setLog] = useState([]);
  useEffect(() => { readAlertLog().then(setLog).catch(warnQuiet('WdAlertSettings')); }, []);
  const a = { ...DEFAULT_ALERTS, ...(alerts || {}) };
  const set = (patch) => onChange({ ...a, ...patch });
  const leads = new Set((a.dueLeadMin || []).map(Number));
  // "Test this style": the website shows a sample task in its alarm window now; the phone rings its full-screen
  // alarm in a few seconds (lock the screen to see it as it comes). Nothing is changed by the sample's buttons.
  const [testNote, setTestNote] = useState('');
  const testStyle = async () => {
    if (Platform.OS === 'web') { previewWebAlarm(); return; }
    await setAlarmStyle(Number(a.phoneAlarmStyle) || 1).catch(warnQuiet('WdAlertSettings'));
    const ok = await scheduleFullScreenAlarm(`preview:${Date.now()}`, new Date(Date.now() + 5000), 'High priority due now', 'Sample task - style preview\nAny button closes it.').catch(() => false);
    setTestNote(ok ? 'Rings in 5 seconds - lock the screen to see it full screen.' : 'Could not book the test alarm: check "Alarms & reminders" below.');
  };
  const toggleLead = (m) => {
    const next = new Set(leads);
    if (next.has(m)) next.delete(m); else next.add(m);
    set({ dueLeadMin: [...next].sort((x, y) => y - x) });
  };

  const rt = useRealtimeStatus();
  const webNow = Number(rt.webInUseUntil) > Date.now();
  const seen = Number(rt.webSeenAt) || 0;
  const [phone, setPhone] = useState(null);
  const check = useCallback(async () => {
    const [exact, battery, fullScreen, overlay] = await Promise.all([isExactAlarmAllowed(), isBatteryOptimised(), isFullScreenIntentAllowed(), canDrawOverlays()]);
    setPhone({ exact, battery, fullScreen, overlay });
  }, []);
  useEffect(() => {
    check();
    // Coming back from a system settings screen: show the new state.
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    return () => sub.remove();
  }, [check]);

  const chip = (label, on, onPress) => (
    <Pressable key={label} onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 99, borderWidth: 1, borderColor: on ? t.accent : t.border, backgroundColor: on ? t.accent : t.surface }}>
      <Text style={{ color: on ? '#fff' : t.text, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
  const toggle = (title, hint, value, onValue) => (
    <Row style={{ justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 }}>
      <View style={{ flex: 1, marginRight: 10 }}>
        <Text style={{ color: t.text, fontSize: t.fs(15) }}>{title}</Text>
        <Small>{hint}</Small>
      </View>
      <Switch value={value} onValueChange={onValue} trackColor={{ false: t.border, true: t.accent }} />
    </Row>
  );
  const status = (ok, title, okText, badText, fix, fixTitle) => (
    <Row style={{ alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.border }}>
      <Text style={{ fontSize: 16, marginRight: 8 }}>{ok ? '✅' : '⚠️'}</Text>
      <View style={{ flex: 1, marginRight: 8 }}>
        <Text style={{ color: t.text, fontWeight: '600' }}>{title}</Text>
        <Small style={{ color: ok ? t.textDim : t.warn }}>{ok ? okText : badText}</Small>
      </View>
      {!ok && <Btn kind="soft" title={fixTitle} onPress={async () => { await fix(); setTimeout(check, 800); }} />}
    </Row>
  );

  return (
    <View>
      <P dim>Alerts are handed to Android ahead of time, so they ring with the app closed or swiped away from Recents.</P>

      <Card style={{ marginBottom: 12 }}>
        <Text style={{ color: t.text, fontWeight: '700', marginBottom: 8 }}>Warn me before the due time</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {LEADS.map(([m, label]) => chip(label, leads.has(m), () => toggleLead(m)))}
        </View>
        <Small style={{ marginTop: 8 }}>{leads.size ? `Before every timed entry: ${LEADS.filter(([m]) => leads.has(m)).map(([, l]) => l).join(', ')} ahead.` : 'No warning before the due time - only at it.'}</Small>
      </Card>

      {/* Phone only: where an alarm appears - full screen (the default, on the lock screen too) or the notification centre. */}
      {Platform.OS !== 'web' && trackerAvailable() && (
        <Card style={{ marginBottom: 12 }}>
          {toggle('Show alarms in the notification centre instead', 'Off (the default): an alarm opens full screen straight away - on the lock screen and while you use the phone. On: it appears only as a notification, with its buttons.', !!a.alarmAsNotification, (v) => { set({ alarmAsNotification: v }); setAlarmDelivery(v).catch(warnQuiet('WdAlertSettings')); })}
          {toggle('Also show a banner notification', 'On (the safe default): the alarm also pops up a notification, so you still see it if your phone refuses the full screen. Off: only a small silent line in the notification shade - the alert is the full screen alone (needs "Open over other apps").', a.alarmBanner !== false, (v) => { set({ alarmBanner: v }); setAlarmBanner(v).catch(warnQuiet('WdAlertSettings')); })}
        </Card>
      )}

      {/* How the alarm looks: on the phone, the full-screen alarm; on the website, the alarm window. Same buttons in every look. */}
      <Card style={{ marginBottom: 12 }}>
        <Text style={{ color: t.text, fontWeight: '700', marginBottom: 4 }}>Alarm style</Text>
        <Small style={{ marginBottom: 8 }}>
          {Platform.OS === 'web'
            ? 'How the alarm window looks on the website. Every style has the same options.'
            : 'How the full-screen alarm looks on this phone. Every style has the same buttons: Snooze 15m, Done, Done + DAR and Open app, with 5m / 30m / 1h snooze along the bottom.'}
        </Small>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {(Platform.OS === 'web' ? WEB_ALARM_STYLES : PHONE_ALARM_STYLES).map(([n, label]) => {
            const key = Platform.OS === 'web' ? 'webAlarmStyle' : 'phoneAlarmStyle';
            const on = (Number(a[key]) || 1) === n;
            return chip(`${n} · ${label}`, on, () => {
              set({ [key]: n });
              if (key === 'phoneAlarmStyle') setAlarmStyle(n).catch(warnQuiet('WdAlertSettings'));      // the next alarm already looks so
            });
          })}
        </View>
        {(Platform.OS === 'web' || trackerAvailable()) && (
          <Row gap={10} style={{ marginTop: 10, alignItems: 'center' }}>
            <Btn kind="soft" title="▶ Test this style" onPress={testStyle} />
            {!!testNote && <Small style={{ flex: 1 }}>{testNote}</Small>}
          </Row>
        )}
      </Card>

      {/* The phone as the back-up: it rings only when the web app is not being used. */}
      <Card style={{ marginBottom: 12 }}>
        {toggle('Ring on the phone only when the web app is not in use', 'While the web app is open on your computer and used in the last 15 minutes, its own alarm rings at the desk and the phone stays silent - no ring and no notification. Closed, asleep, idle or out of reach: the phone rings. If it cannot tell, it rings.', a.phoneWhenWebIdle !== false, (v) => set({ phoneWhenWebIdle: v }))}
        <Small style={{ marginTop: 6, color: !rt.user ? t.warn : webNow ? t.ok : t.textDim }}>
          {!rt.user
            ? 'Realtime Sync is not signed in, so the phone cannot see the web app - it always rings.'
            : webNow
              ? '🖥️ Web app in use now - phone alarms are quiet.'
              : seen
                ? `Web app not in use (last seen ${new Date(seen).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}) - the phone rings.`
                : 'No "in use" note from the web app yet - the phone rings. The web app sends it once it is updated and signed in.'}
        </Small>
      </Card>

      {/* Tasks come in from the web app with a priority: this sorts them into Alarm and Reminder on the phone. */}
      {a.fullScreen !== false && (
        <Card style={{ marginBottom: 12 }}>
          <Text style={{ color: t.text, fontWeight: '700', marginBottom: 4 }}>Which tasks ring as an alarm</Text>
          <Small style={{ marginBottom: 8 }}>By priority. The rest arrive as a plain 🔕 reminder - no ringing, no repeated nags. Only on this phone; the web app keeps its own alarms.</Small>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {chip('All tasks', !Array.isArray(a.alarmPriorities), () => set({ alarmPriorities: null }))}
            {(priorities.length ? priorities : ['High', 'Medium', 'Low']).map((p) => {
              const on = Array.isArray(a.alarmPriorities) && a.alarmPriorities.includes(p);
              return chip(p, on, () => {
                const cur = Array.isArray(a.alarmPriorities) ? a.alarmPriorities : [];
                set({ alarmPriorities: on ? cur.filter((x) => x !== p) : [...cur, p] });
              });
            })}
          </View>
          <Small style={{ marginTop: 8 }}>
            {!Array.isArray(a.alarmPriorities) ? 'Every task rings as an alarm.' : a.alarmPriorities.length ? `${a.alarmPriorities.join(', ')} ring as an alarm; every other task is a reminder.` : 'No task rings - all are reminders.'}
            {' '}Tap 🔔 / 🔕 on a task's card to change just that one.
          </Small>
        </Card>
      )}

      <Card style={{ marginBottom: 12 }}>
        {toggle('Ring like an alarm at the due time', 'Keeps ringing - sound and vibration - until you press Done or Snooze. Off: every task is a normal notification.', !!a.fullScreen, (v) => set({ fullScreen: v }))}
        {toggle('Keep reminding after the due time', 'Rings again 10 min, 30 min, 1 hr, 2 hr and 4 hr after, then at the same time every day, until the entry is done.', a.followUps !== false, (v) => set({ followUps: v }))}
        <Small style={{ marginTop: 6, marginBottom: 6 }}>Warnings before the due time ("Due in 1 hr", "Due tomorrow", deadline warnings) are a notification only, for every task, on the phone and the website. The alarm rings at the due time.</Small>
        {toggle('Deadline warnings', '1 day, 2 hours and 30 minutes before a deadline, and an alarm at it.', !!a.deadline, (v) => set({ deadline: v }))}
        <Small style={{ marginTop: 8, marginBottom: 6 }}>Entries due on a date with no time are announced the evening before and the morning of:</Small>
        <Row style={{ gap: 10 }}>
          <View style={{ flex: 1 }}><ClockField label="Morning" value={a.morning} fallback="09:30" onChange={(v) => set({ morning: v })} /></View>
          <View style={{ flex: 1 }}><ClockField label="Evening" value={a.evening} fallback="18:00" onChange={(v) => set({ evening: v })} /></View>
        </Row>
      </Card>

      {/* APK: the week summary reminder. */}
      {Platform.OS !== 'web' && (
        <Card style={{ marginBottom: 12 }}>
          <Text style={{ color: t.text, fontWeight: '700', marginBottom: 4 }}>Week summary reminder</Text>
          {toggle('Remind me to send the week summary', 'A notification on the day and time below. Tapping it opens the week summary, ready to Email or share as a PDF.', a.weeklySummary !== false, (v) => set({ weeklySummary: v }))}
          {a.weeklySummary !== false && (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                {[[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat']].map(([n, label]) => chip(label, Number(a.weeklySummaryDay) === n, () => set({ weeklySummaryDay: n })))}
              </View>
              <ClockField label="At" value={a.weeklySummaryTime} fallback="17:30" onChange={(v) => set({ weeklySummaryTime: v })} />
            </>
          )}
        </Card>
      )}

      {/* Quiet hours: the phone and the website both keep them. */}
      <Card style={{ marginBottom: 12 }}>
        <Text style={{ color: t.text, fontWeight: '700', marginBottom: 4 }}>Quiet hours</Text>
        {toggle('No alarms at night', 'Nothing rings between these times. An alert that falls in them rings once when they end.', !!a.quietHours, (v) => set({ quietHours: v }))}
        {!!a.quietHours && (
          <Row style={{ gap: 10 }}>
            <View style={{ flex: 1 }}><ClockField label="From" value={a.quietFrom} fallback="21:00" onChange={(v) => set({ quietFrom: v })} /></View>
            <View style={{ flex: 1 }}><ClockField label="To" value={a.quietTo} fallback="08:00" onChange={(v) => set({ quietTo: v })} /></View>
          </Row>
        )}
        {toggle('No alarms on days off', 'Sundays, holidays the office is closed on, and your leave days stay quiet. Open tasks ring again on the next working day.', !!a.quietOffDays, (v) => set({ quietOffDays: v }))}
        {(!!a.quietHours || !!a.quietOffDays) && toggle('High priority rings anyway', 'High priority tasks ignore quiet hours and days off.', a.quietExceptHigh !== false, (v) => set({ quietExceptHigh: v }))}
      </Card>

      <Card>
        <Text style={{ color: t.text, fontWeight: '700', marginBottom: 4 }}>Full-screen alert</Text>
        <Small style={{ marginBottom: 8 }}>Every task alert opens like this - on the lock screen and while you use the phone. See it with a sample task:</Small>
        <Btn kind="soft" title="👁 Preview the full-screen alert" onPress={() => nav.navigate('PastDueAlert', { preview: true })} />
        {Platform.OS !== 'web' && trackerAvailable() && (
          <>
            <Btn kind="soft" style={{ marginTop: 8 }} title="⏱ Test alarm in 10 seconds" onPress={async () => {
              const ok = await scheduleFullScreenAlarm('wd:preview:test', new Date(Date.now() + 10000), 'Test alarm', 'This is a test - nothing is changed.').catch(() => false);
              Alert.alert(ok ? 'Test alarm booked' : 'Could not book the test alarm', ok ? 'Lock the phone or open another app now. In 10 seconds the alert should open full screen and ring.' : 'Allow exact alarms below, then try again.');
            }} />
            <Small style={{ marginTop: 6 }}>Press it, then lock the phone or use another app - it proves the full screen on your phone.</Small>
          </>
        )}
      </Card>

      {Platform.OS !== 'web' && (
        <Card style={{ marginBottom: 12 }}>
          <Row style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ color: t.text, fontWeight: '700' }}>Alerts log</Text>
            <Pressable onPress={async () => { await clearAlertLog(); setLog([]); }} hitSlop={8}><Small style={{ color: t.accent, fontWeight: '700' }}>Clear</Small></Pressable>
          </Row>
          {!log.length ? <Small style={{ marginTop: 4 }}>Nothing went wrong with an alert.</Small> : log.slice(0, 12).map((x, i) => (
            <Small key={i} style={{ marginTop: 4 }}>{new Date(x.at).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })} · {x.text}</Small>
          ))}
        </Card>
      )}

      <Card>
        <Text style={{ color: t.text, fontWeight: '700', marginBottom: 4 }}>This phone</Text>
        {!trackerAvailable() ? (
          <Small>Install the app build (not Expo Go) for alarms that ring with the app closed.</Small>
        ) : !phone ? (
          <Small>Checking…</Small>
        ) : (
          <>
            {status(phone.exact, 'Exact alarms', 'Allowed - alerts ring on time.', 'Off - Android may delay alerts by many minutes.', requestExactAlarmPermission, 'Allow')}
            {status(!phone.battery, 'Battery optimisation', 'Not restricted - alerts ring with the app closed.', 'Restricted - the phone may stop alerts once the app is swiped away.', requestBatteryExemption, 'Fix')}
            {status(phone.fullScreen, 'Full-screen alarms', 'Allowed over the lock screen.', 'Off - alarms show only as a banner.', requestFullScreenIntentPermission, 'Allow')}
            {status(phone.overlay, 'Open over other apps', 'Allowed - an alarm opens full screen even while you use the phone.', 'Off - while you use the phone an alarm shows only as a banner.', requestOverlayPermission, 'Allow')}
            <Small style={{ marginTop: 8 }}>Some phones (Oppo, Realme, Vivo, Xiaomi, OnePlus) also need "Auto-start" or "Allow background activity" switched on for this app in the phone's own settings.</Small>
          </>
        )}
      </Card>
    </View>
  );
}
