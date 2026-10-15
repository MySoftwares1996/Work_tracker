import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, Alert, ScrollView } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Screen, Card, Small, P, Btn, Row, Sheet, Choices, DateTimeField, PickerButton } from '../ui';
import { useTheme, blend, ALARM_COLORS } from '../theme';
import { useStore } from '../store';
import { isSnoozed, isSilencedToday, RECURRENCES, RECURRENCE_LABELS, recurrenceLabel, completeEntry, nextRecurringEntry, editedNow, DEFAULT_ALERTS, snoozeEntry, silenceEntryToday, alertModeOf, normalizeHolidays, normalizeLeaveDays } from '../workingDashboard';
import { paymentLists, subCategoryComplete } from '../workingDashboardPayments';
import { snoozeSuggestions, pastDueEntries, ringingEntries, closedOn, postponeDue, withRemark, moveEntry, skipOccurrence, silenceMinutes } from '../pastDue';
import { scheduleEntryAlert, cancelEntryAlert, snoozeEntryAlert, entryIdOfAlarm } from '../workingDashboardNotify';
import { stopAlarmRinging } from '../tracker';
import { blankEntry, withStatus } from '../workingDashboard';
import { addAudit } from '../audit';

const SNOOZES = [15, 30, 45, 60, 120, 180, 240, 300];      // 15, 30, 45 min, 1, 2, 3, 4, 5 hr
const snoozeShort = (m) => (m >= 60 ? `${m / 60}h` : `${m}m`);
const snoozeLabel = (m) => (m >= 1440 ? '1 day' : m >= 60 ? `${m / 60} hr` : `${m} min`);
const fmtDue = (iso) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })} at ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;
};

// One button on the coloured background: white for the main answer, glass for the rest.
function AB({ pal, title, onPress, main, style }) {
  const t = useTheme();
  const G = ALARM_COLORS.glass;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title}
      style={({ pressed }) => [{ paddingVertical: 12, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: main ? G.paper : G.fill, borderWidth: main ? 0 : 1, borderColor: G.line, opacity: pressed ? 0.8 : 1 }, style]}>
      <Text numberOfLines={1} style={{ color: main ? pal.bottom : G.text, fontWeight: '800', fontSize: t.fs(15) }}>{title}</Text>
    </Pressable>
  );
}
function Chip({ text }) {
  const t = useTheme();
  const G = ALARM_COLORS.glass;
  if (!text) return null;
  return (
    <View style={{ paddingHorizontal: 11, paddingVertical: 5, borderRadius: 999, backgroundColor: G.fill, borderWidth: 1, borderColor: G.line, marginRight: 6, marginBottom: 6 }}>
      <Text numberOfLines={1} style={{ color: G.text, fontWeight: '700', fontSize: t.fs(12.5) }}>{text}</Text>
    </View>
  );
}


/**
 * Past Due Alert: every open entry past its due time, with what the web app's alert offers on each - a remark,
 * Mark done, Silence today, Skip (stays open, left out of today's report), Snooze for N minutes, Move to another date and time,
 * the status and the repeat. Opened from the alarm's "Open app" and from the dashboard.
 */
export default function PastDueAlert() {
  const t = useTheme();
  const nav = useNavigation();
  const route = useRoute();
  const focusAlarm = route.params?.focus || null;      // the alarm that rang: show what rang, not every overdue task
  const [showAll, setShowAll] = useState(false);
  const { data, update: storeUpdate } = useStore();
  // Preview (Config > Alerts): a sample task, and nothing is saved, booked or silenced.
  const preview = !!route.params?.preview || (focusAlarm ? entryIdOfAlarm(focusAlarm) === 'preview' : false);      // also the Config "test alarm" (wd:preview:test)
  const update = preview ? () => {} : storeUpdate;
  const fx = preview
    ? { scheduleEntryAlert: async () => {}, cancelEntryAlert: async () => {}, snoozeEntryAlert: async () => {}, stopAlarmRinging: async () => {} }
    : { scheduleEntryAlert, cancelEntryAlert, snoozeEntryAlert, stopAlarmRinging };
  const wd = data.workingDashboard || {};
  const alerts = { ...DEFAULT_ALERTS, ...(wd.alerts || {}) };
  const ring = wd.alarmRingtone || 'chime';
  const [gone, setGone] = useState(() => new Set());          // handled here: hidden at once
  const [remarks, setRemarks] = useState({});
  const [mins, setMins] = useState({});
  const [moves, setMoves] = useState({});
  const [repeatFor, setRepeatFor] = useState(null);
  const [snoozeFor, setSnoozeFor] = useState(null);
  const [statusFor, setStatusFor] = useState(null);
  const [samplePrio, setSamplePrio] = useState('High');      // preview only: the background colour follows the priority
  const [more, setMore] = useState({});            // cards with Move and the dropdowns opened out

  // Opened from an alert that is not overdue yet (a warning before the due time): go to the dashboard instead of an empty list.
  // Leaving the screen silences a ringing alarm: it was answered (or dismissed) here.
  const redirected = useRef(false);        // moving on to the dashboard is not answering the alarm
  // Back to the Working Dashboard already underneath (it is the first screen), not a second copy on top of it:
  // replace() stacked one, so Back from it went through the dashboard twice. popTo() adds one only if none is there.
  const toDashboard = (params) => { redirected.current = true; nav.popTo('WorkingDashboard', params); };
  useEffect(() => () => { if (!redirected.current) fx.stopAlarmRinging('wd:').catch(() => {}); }, []);

  const ringing = useMemo(
    () => (focusAlarm ? new Set(ringingEntries(wd.entries || [], focusAlarm, new Date(), alerts).map((e) => String(e.id))) : null),
    [focusAlarm],   // eslint-disable-line react-hooks/exhaustive-deps -- fixed when the alarm opened the screen
  );
  const sample = useMemo(() => ({ ...blankEntry(), id: 'preview', title: 'Pay vendor invoice - ICICI Bank follow-up', category: 'Payments', priority: samplePrio === 'None' ? null : samplePrio, status: 'Pending', pendingWith: 'Self', reference: 'RE: Invoice INV/2026/118 - payment advice', dueAt: new Date(Date.now() - 20 * 60000).toISOString() }), [samplePrio]);
  // A warning before the due time ("Due in 1 hour", deadline tomorrow) opens this screen too: its task is shown with the same
  // options, not sent to the dashboard. Only the task that rang is added; a done, binned, snoozed or silenced one is not.
  const warned = useMemo(() => {
    const id = focusAlarm ? entryIdOfAlarm(focusAlarm) : null;
    const e = id ? (wd.entries || []).find((x) => String(x.id) === String(id)) : null;
    const now = new Date();
    return e && !e.done && !e.binned && !isSnoozed(e, now) && !isSilencedToday(e, now) ? e : null;
  }, [wd.entries, focusAlarm]);
  const overdueAll = useMemo(() => {
    if (preview) return [sample];
    const list0 = pastDueEntries(wd.entries || []);
    return warned && !list0.some((x) => String(x.id) === String(warned.id)) ? [...list0, warned] : list0;
  }, [wd.entries, preview, sample, warned]);
  const list = useMemo(
    () => overdueAll.filter((e) => !gone.has(e.id) && (showAll || !ringing || ringing.has(String(e.id)))),
    [overdueAll, gone, showAll, ringing],
  );
  const firstLook = useRef(true);
  useEffect(() => {
    if (!firstLook.current) return;
    firstLook.current = false;
    const first = ringing ? overdueAll.filter((e) => ringing.has(String(e.id))) : overdueAll;
    if (!first.length) {
      // Tapped an alert for a task that is not past due any more (done, moved or changed on the web app after the
      // alert was booked): say so, instead of closing without a word.
      if (focusAlarm) explainGone();
      toDashboard();
    }
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // The alert's task is told what it is now: done, in the Bin, or moved - not just gone.
  function explainGone() {
    const id = entryIdOfAlarm(focusAlarm);
    const e = id ? (wd.entries || []).find((x) => String(x.id) === String(id)) : null;
    if (!e) return Alert.alert('Task not found', 'That alert was for a task that is no longer in the app (it may have been deleted on the web app).');
    // Only a task that is gone, done or binned is explained: an open one that is not past due yet is just a warning.
    if (!e.binned && !e.done) return;
    Alert.alert('Already updated', `“${e.title}” was ${e.binned ? 'moved to the Bin' : 'marked done'} - there is nothing to do for this alert.`);
  }

  // The web app's changes arrive a moment after the app opens from an alert: a task that was open, and is then done or
  // moved on the web app, leaves the list on its own - say why.
  const sawTasks = useRef(false);
  useEffect(() => {
    if (list.length) { sawTasks.current = true; return; }
    if (sawTasks.current && !gone.size && focusAlarm) { sawTasks.current = false; explainGone(); }
  }, [list.length]);   // eslint-disable-line react-hooks/exhaustive-deps

  // A new alarm while the screen is open (it is re-opened with that alarm): back to showing just what rang.
  useEffect(() => { setShowAll(false); }, [focusAlarm]);

  const closed = useMemo(() => list.map((e) => ({ e, c: closedOn(e, wd.holidays, wd.leaveDays) })), [list, wd.holidays, wd.leaveDays]);
  const closedList = closed.filter((x) => x.c);
  const hide = (id) => { if (!preview) setGone((s) => new Set([...s, id])); };      // the preview's sample stays
  const edit = (id, fn) => update((db) => ({ ...db, workingDashboard: { ...db.workingDashboard, entries: db.workingDashboard.entries.map((x) => (x.id === id ? fn(x) : x)) } }));
  const live = (e) => (wd.entries || []).find((x) => x.id === e.id) || e;

  // `dar`: the DAR button - done, and ticked for the Daily Activity Report in one press (as on the ringing alarm).
  const done = (shown, { dar = false } = {}) => {
    const e = live(shown);
    const marked = { ...withRemark(e, remarks[e.id]), dar };
    // As on the web app: a category that needs a Sub Category is completed from the entry form, where its
    // details are filled in - it is silenced for today meanwhile, so it does not ring again while they are.
    if (!subCategoryComplete(marked, paymentLists(wd, wd.categories))) {
      edit(e.id, () => silenceEntryToday(marked));
      toDashboard({ completeId: String(e.id), dar: marked.dar !== false });
      return;
    }
    const rolled = nextRecurringEntry(marked, wd.entries || [], new Date(), { holidays: normalizeHolidays(wd.holidays), leaveDays: normalizeLeaveDays(wd.leaveDays) });
    update((db) => ({ ...db, workingDashboard: { ...db.workingDashboard, entries: [...(rolled ? [rolled] : []), ...db.workingDashboard.entries.map((x) => (x.id === e.id ? { ...completeEntry(marked), audit: addAudit(e.audit, dar ? 'Marked done + DAR (alert)' : 'Marked done (alert)', 'phone') } : x))] } }));
    fx.cancelEntryAlert(e.id).catch(() => {});
    if (rolled) fx.scheduleEntryAlert(rolled, ring, wd.alerts).catch(() => {});
    hide(e.id);
  };
  const silence = (shown) => {
    const e = live(shown);
    // Quiet for the rest of today: its alerts are held back until tomorrow's morning time, then it rings as usual.
    // Saved on the entry in the web app's own field (lastAckDate), so the web app stops alarming too.
    fx.snoozeEntryAlert(e, ring, silenceMinutes(new Date(), alerts.morning), wd.alerts).catch(() => {}).then(() => edit(e.id, (x) => silenceEntryToday(withRemark(x, remarks[e.id]))));
    hide(e.id);
  };
  const snooze = (shown, minutes) => {
    const n = Number(minutes) || Number(mins[shown.id]) || 15;
    const e = live(shown);
    // snoozeUntil is the web app's own field: the web app stops alarming until then too.
    edit(e.id, (x) => ({ ...snoozeEntry(withRemark(x, remarks[e.id]), Date.now() + n * 60000), audit: addAudit(x.audit, `Snoozed for ${n >= 60 ? `${n / 60} h` : `${n} min`} (alert)`, 'phone') }));
    fx.snoozeEntryAlert(e, ring, n, wd.alerts).catch(() => {});
    hide(e.id);
  };
  const skip = (shown) => {
    const e = live(shown);
    const r = skipOccurrence(withRemark(e, remarks[e.id]), wd.entries || []);
    if (!r) return;
    update((db) => ({ ...db, workingDashboard: { ...db.workingDashboard, entries: db.workingDashboard.entries.map((x) => (x.id === e.id ? { ...r.skipped, audit: addAudit(x.audit, 'Skipped today (alert)', 'phone') } : x)) } }));
    // Still open: silenced for today, its alerts carry on from tomorrow.
    fx.scheduleEntryAlert(r.skipped, ring, wd.alerts).catch(() => {});
    hide(e.id);
  };
  const move = (shown, iso) => {
    const e = live(shown);
    const next = { ...moveEntry(withRemark(e, remarks[e.id]), iso), audit: addAudit(e.audit, 'Moved to a new date (alert)', 'phone') };
    edit(e.id, () => next);
    fx.scheduleEntryAlert(next, ring, wd.alerts).catch(() => {});
    fx.stopAlarmRinging(`wd:${e.id}:`).catch(() => {});
    if (new Date(iso) > new Date()) hide(e.id);
  };
  // 🔔 Alarm / 🔕 Reminder for this task, as on its card: a Reminder stops ringing and is not nagged again.
  const switchMode = (shown) => {
    const e = live(shown);
    const mode = alertModeOf(e, wd.alerts) === 'alarm' ? 'gentle' : 'alarm';
    const next = { ...e, alertMode: mode, ...editedNow() };
    edit(e.id, (x) => ({ ...x, alertMode: mode, ...editedNow() }));
    fx.scheduleEntryAlert(next, ring, wd.alerts).catch(() => {});
    if (mode === 'gentle') fx.stopAlarmRinging(`wd:${e.id}:`).catch(() => {});
  };
  const postpone = (shown) => move(shown, postponeDue(live(shown), wd.holidays, wd.leaveDays));
  const postponeAll = () => closedList.forEach(({ e }) => postpone(e));
  const setRepeat = (e, r) => edit(e.id, (x) => ({ ...x, recurrence: r, recurrenceEveryMin: r === 'custom' ? (x.recurrenceEveryMin || 15) : null, ...editedNow() }));

  const small = (title, onPress, kind = 'soft', disabled) => <Btn kind={kind} title={title} onPress={onPress} disabled={disabled} style={{ paddingVertical: 6, paddingHorizontal: 12, marginRight: 8, marginBottom: 6 }} />;

  const G = ALARM_COLORS.glass;
  const lead = closed[0] ? closed[0].e : null;
  const pal = ALARM_COLORS.priority[lead && lead.priority] || ALARM_COLORS.priority.None;
  const lateMin = lead && lead.dueAt ? Math.max(0, Math.round((Date.now() - new Date(lead.dueAt).getTime()) / 60000)) : 0;
  const early = lead && lead.dueAt && new Date(lead.dueAt).getTime() > Date.now();
  const toGo = early ? Math.round((new Date(lead.dueAt).getTime() - Date.now()) / 60000) : 0;
  const when = early ? `DUE IN ${toGo >= 60 ? `${Math.round(toGo / 60)} HR` : `${Math.max(toGo, 1)} MIN`}` : lateMin <= 30 ? 'DUE NOW' : 'PAST DUE';
  return (
    <View style={{ flex: 1, backgroundColor: pal.bottom }}>
      {/* The background follows the priority of the task that rang: red High, amber Medium, green Low, blue otherwise. */}
      <Svg style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} width="100%" height="100%" preserveAspectRatio="none">
        <Defs><LinearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={pal.top} /><Stop offset="1" stopColor={pal.bottom} /></LinearGradient></Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#bg)" />
      </Svg>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right', 'bottom']}>
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
          <Row style={{ alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 64 }}>{pal.icon}</Text>
              <Text style={{ color: G.dim, fontWeight: '700', letterSpacing: 0.6, fontSize: t.fs(13) }}>{lead ? `${pal.label} ${when}` : 'ALERT'}</Text>
            </View>
          </Row>
          <Pressable onPress={() => nav.goBack()} hitSlop={12} accessibilityLabel="Close" style={{ position: 'absolute', right: 12, top: 4 }}><Text style={{ color: G.dim, fontSize: 28 }}>✕</Text></Pressable>
          {preview && <View style={{ backgroundColor: G.fillStrong, borderRadius: 12, padding: 10, marginTop: 12 }}><Text style={{ color: G.text, fontWeight: '700', fontSize: t.fs(12.5) }}>PREVIEW - how an alarm opens full screen. A sample task; nothing here is saved or changed.</Text>
            <Row gap={6} style={{ marginTop: 8 }}>{['High', 'Medium', 'Low', 'None'].map((pr) => <Pressable key={pr} onPress={() => setSamplePrio(pr)} style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: samplePrio === pr ? G.paper : G.fill }}><Text style={{ color: samplePrio === pr ? pal.bottom : G.text, fontWeight: '800' }}>{pr}</Text></Pressable>)}</Row></View>}

          {!!ringing && !showAll && overdueAll.filter((e) => !ringing.has(String(e.id)) && !gone.has(e.id)).length > 0 && (
            <Pressable onPress={() => setShowAll(true)} hitSlop={8} style={{ marginTop: 10 }}>
              <Text style={{ color: G.text, fontWeight: '700', textAlign: 'center' }}>Showing the task that rang · Show all {overdueAll.filter((e) => !gone.has(e.id)).length} overdue ›</Text>
            </Pressable>
          )}

          {!list.length && (
            <View style={{ alignItems: 'center', padding: 28 }}>
              <Text style={{ fontSize: 40 }}>✅</Text>
              <Text style={{ color: G.text, fontWeight: '800', fontSize: t.fs(18), marginTop: 8 }}>Nothing past due</Text>
              <AB pal={pal} main title="Open Working Dashboard" onPress={() => toDashboard()} style={{ marginTop: 14 }} />
            </View>
          )}

          {closedList.length > 0 && (
            <View style={{ backgroundColor: G.fillStrong, borderRadius: 14, padding: 12, marginTop: 12 }}>
              <Text style={{ color: G.text, fontWeight: '800' }}>{closedList.length} task{closedList.length === 1 ? '' : 's'} fall on {[...new Set(closedList.map((x) => x.c.name))].join(', ')} (office closed)</Text>
              <AB pal={pal} title="Postpone all" onPress={postponeAll} style={{ marginTop: 8 }} />
            </View>
          )}

          {closed.map(({ e, c }) => {
            const entry = live(e);
            const moveTo = moves[e.id] || e.dueAt;
            const prio = ALARM_COLORS.priority[entry.priority] || ALARM_COLORS.priority.None;
            return (
              <View key={e.id} style={{ marginTop: 18 }}>
                <Text style={{ color: G.text, fontWeight: '800', fontSize: t.fs(26), lineHeight: t.fs(32), textAlign: 'center' }}>{entry.title}</Text>
                <Text style={{ color: G.dim, fontWeight: '600', textAlign: 'center', marginTop: 4, marginBottom: 12 }}>Due {fmtDue(entry.dueAt)}</Text>
                {/* Everything about the task: priority, category, who it is with, status, repeat. */}
                <Row style={{ flexWrap: 'wrap', justifyContent: 'center', gap: 0 }}>
                  <Chip text={`${prio.icon} ${entry.priority || 'No priority'}`} />
                  <Chip text={entry.category ? `📁 ${entry.category}` : ''} />
                  <Chip text={entry.pendingWith ? `👤 Pending with: ${entry.pendingWith}` : ''} />
                  <Chip text={`🔁 ${recurrenceLabel(entry)}`} />
                  <Chip text={entry.status ? `◔ ${entry.status}` : ''} />
                </Row>
                {!!entry.reference && <Text numberOfLines={2} style={{ color: G.dim, textAlign: 'center', fontSize: t.fs(12.5), marginTop: 2 }}>✉ {entry.reference}</Text>}

                {!!c && (
                  <View style={{ backgroundColor: G.fillStrong, borderRadius: 12, padding: 10, marginTop: 10 }}>
                    <Text style={{ color: G.text, fontWeight: '700', fontSize: t.fs(12.5) }}>Due on {c.name} - office closed. Postpone to the next working day?</Text>
                    <AB pal={pal} title="Postpone" onPress={() => postpone(entry)} style={{ marginTop: 6 }} />
                  </View>
                )}

                <TextInput
                  value={remarks[e.id] || ''} onChangeText={(v) => setRemarks((r) => ({ ...r, [e.id]: v }))}
                  placeholder="Remarks (optional)" placeholderTextColor={t.textDim}
                  style={{ backgroundColor: G.paper, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: G.ink, fontSize: t.fs(14), marginTop: 12, marginBottom: 12 }}
                />
                <AB pal={pal} main title="✓ Mark done" onPress={() => done(entry)} />
                <AB pal={pal} title="✓ Done + DAR (into the daily report)" onPress={() => done(entry, { dar: true })} style={{ marginTop: 8 }} />
                <Row gap={8} style={{ marginTop: 8 }}>
                  <AB pal={pal} title="Silence today" onPress={() => silence(entry)} style={{ flex: 1 }} />
                  <AB pal={pal} title="Skip" onPress={() => skip(entry)} style={{ flex: 1 }} />
                </Row>

                <Text style={{ color: G.dim, fontWeight: '700', fontSize: t.fs(12), letterSpacing: 0.5, marginTop: 16, marginBottom: 6 }}>SNOOZE FOR</Text>
                <Row style={{ flexWrap: 'wrap', gap: 8 }}>
                  {SNOOZES.map((m) => <AB pal={pal} key={m} title={`💤 ${snoozeShort(m)}`} onPress={() => snooze(entry, m)} style={{ minWidth: 72, paddingVertical: 10 }} />)}
                </Row>

                {(() => {
                  const tips = snoozeSuggestions(entry, { holidays: wd.holidays, leaveDays: wd.leaveDays, assignees: wd.assignees, morning: alerts.morning, bankWord: (wd.quickAdd || {}).bankWord });
                  if (!tips.length) return null;
                  return (
                    <View style={{ backgroundColor: G.fillStrong, borderRadius: 14, padding: 12, marginTop: 14 }}>
                      <Text style={{ color: G.text, fontWeight: '800' }}>💡 Snoozed {Number(entry.snoozeCount)} times - try:</Text>
                      <Row style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
                        {tips.map((tp) => <AB key={tp.key} pal={pal} title={tp.label} onPress={() => (tp.dueAt ? move(entry, tp.dueAt) : (edit(entry.id, (x) => ({ ...x, ...tp.patch, snoozeCount: 0, ...editedNow() })), hide(entry.id)))} />)}
                      </Row>
                    </View>
                  );
                })()}

                <Text style={{ color: G.dim, fontWeight: '700', fontSize: t.fs(12), letterSpacing: 0.5, marginTop: 16, marginBottom: 6 }}>MOVE TO DATE & TIME</Text>
                <View style={{ backgroundColor: G.paper, borderRadius: 12, padding: 10 }}>
                  <DateTimeField value={moveTo} onChange={(v) => v && setMoves((m) => ({ ...m, [e.id]: v }))} />
                  <Btn title="Move" onPress={() => move(entry, moveTo)} />
                </View>

                <Row gap={10} style={{ marginTop: 14 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: G.dim, fontWeight: '700', fontSize: t.fs(12), letterSpacing: 0.5, marginBottom: 6 }}>STATUS</Text>
                    <PickerButton text={`${entry.status || 'Set status'}  ▾`} onPress={() => setStatusFor(entry.id)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: G.dim, fontWeight: '700', fontSize: t.fs(12), letterSpacing: 0.5, marginBottom: 6 }}>RECURRING</Text>
                    <PickerButton text={`${recurrenceLabel(entry)}  ▾`} onPress={() => setRepeatFor(entry.id)} />
                  </View>
                </Row>
                <Pressable onPress={() => switchMode(entry)} hitSlop={8} style={{ alignSelf: 'center', marginTop: 14 }}>
                  <Text style={{ color: G.dim, fontWeight: '700' }}>{alertModeOf(entry, wd.alerts) === 'alarm' ? '🔕 Reminder only (stop ringing for this task)' : '🔔 Ring as alarm'}</Text>
                </Pressable>
              </View>
            );
          })}
        </ScrollView>
      </SafeAreaView>

      <Sheet visible={!!statusFor} onClose={() => setStatusFor(null)} title="Status">
        <Choices
          options={(wd.statuses || []).map((st) => [st, st])}
          value={(wd.entries || []).find((x) => x.id === statusFor)?.status || ''}
          onChange={(st) => { edit(statusFor, (x) => ({ ...withStatus(x, st), ...editedNow() })); setStatusFor(null); }}
        />
      </Sheet>

      <Sheet visible={!!repeatFor} onClose={() => setRepeatFor(null)} title="Repeat">
        <Choices
          options={RECURRENCES.map((r) => [r, RECURRENCE_LABELS[r]])}
          value={(wd.entries || []).find((x) => x.id === repeatFor)?.recurrence || 'none'}
          onChange={(r) => { const e = (wd.entries || []).find((x) => x.id === repeatFor); if (e) setRepeat(e, r); setRepeatFor(null); }}
        />
      </Sheet>
    </View>
  );
}
