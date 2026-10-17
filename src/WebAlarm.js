import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, Platform, ScrollView, TextInput } from 'react-native';
import { useStore } from './store';
import { useTheme, ThemeOverride, ALARM_COLORS } from './theme';
import { addReceivedListener } from './notify';
import { previewRingtone, stopPreview } from './ringtones';
import { isOpen, withStatus, snoozeEntry, silenceEntryToday, editedNow, RECURRENCES, RECURRENCE_LABELS, recurrenceLabel, DEFAULT_ALERTS, lastFollowUpLine, isWarningKey } from './workingDashboard';
import { withRemark, moveEntry, skipOccurrence, silenceMinutes } from './pastDue';
import { normStatus } from './workingDashboardPayments';
import { scheduleEntryAlert, snoozeEntryAlert } from './workingDashboardNotify';
import { handleWdAction } from './workingDashboardActions';
import { SOURCES } from './optionSources';
import { DateTimeField, PickerButton, Choices } from './ui';
import { warnQuiet } from './quietCatch';

/** The seven looks of the web.app alarm window, chosen in Config > Alerts > Alarm style (alerts.webAlarmStyle). */
export const WEB_ALARM_STYLES = [
  [1, 'Red-framed window'], [2, 'Compact list'], [3, 'Corner pop-up'], [4, 'Top banner'],
  [5, 'Dark window'], [6, 'Two panes'], [7, 'Simple first'],
];

// Config's "Test this style": a sample task rings in the chosen style; its buttons only close it.
const PREVIEW_ID = '__style_preview__';
const previewListeners = new Set();
export function previewWebAlarm() { previewListeners.forEach((fn) => fn()); }
function previewEntry() {
  const due = new Date(Date.now() - 10 * 60000).toISOString();
  return {
    id: PREVIEW_ID, title: 'Sample task - style preview', category: 'Bank Follow Up', priority: 'High', status: 'Pending',
    dueAt: due, recurrence: 'none', notes: 'This is how a ringing task looks. Any button closes it.',
  };
}

/**
 * web.app only: a task alert rings in the browser. When any Working Dashboard alert falls due, the ringtone chosen in
 * Config loops and the alarm shows the task with everything the Past Due Alert offers - remarks, Mark done,
 * Done + DAR, Silence today, Skip, Snooze (minutes), Move (date and time), status and repeat - until each task
 * is answered or done elsewhere. Several at once are shown together, with "Silence all for today". Seven looks,
 * same options in each (WEB_ALARM_STYLES). It rings while this tab is open; the phone stays silent meanwhile.
 */
// The snooze lengths offered in the alarm window's drop-down (minutes).
const SNOOZE_OPTIONS = [['15', '15 min'], ['30', '30 min'], ['45', '45 min'], ['60', '60 min'], ['120', '2 hr'], ['180', '3 hr'], ['240', '4 hr'], ['300', '5 hr']];

export default function WebAlarmHost({ onOpen }) {
  const t = useTheme();
  const { data, update } = useStore();
  const wd = data.workingDashboard || {};
  const entries = wd.entries || [];
  const alerts = { ...DEFAULT_ALERTS, ...(wd.alerts || {}) };
  const style = Number(alerts.webAlarmStyle) || 1;
  const tone = wd.alarmRingtone || 'chime';
  const [rings, setRings] = useState([]);       // [{ entryId, key, title, body }], newest last
  const [pick, setPick] = useState(0);          // the task shown, where one is shown at a time
  const [preview, setPreview] = useState(null); // the sample task of "Test this style", while it shows
  const toneRef = useRef(wd.alarmRingtone);
  toneRef.current = wd.alarmRingtone;

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    const sub = addReceivedListener((n) => {
      const c = n?.request?.content || {};
      const d = c.data || {};
      if (d.kind !== 'wd-entry') return;
      // A warning before the due time ("Due in 1 hr") is the browser's notification only - no alarm window, no sound.
      if (isWarningKey(d.key)) return;
      const ring = { entryId: d.entryId, key: d.key, title: c.title || 'Task due', body: c.body || '' };
      setRings((list) => [...list.filter((r) => String(r.entryId) !== String(d.entryId)), ring]);
    });
    const onPreview = () => {
      const e = previewEntry();
      setPreview(e);
      setRings((list) => [...list.filter((r) => r.entryId !== PREVIEW_ID), { entryId: PREVIEW_ID, key: 'due', title: 'High priority due now', body: e.title }]);
      setPick(1e6);        // shown first where one task is shown at a time (clamped below)
    };
    previewListeners.add(onPreview);
    return () => { sub.remove(); previewListeners.delete(onPreview); };
  }, []);

  // The ringtone loops while anything rings ("System default" has no sound file here: the Alarm tone stands in).
  const playing = rings.length > 0;
  useEffect(() => {
    if (!playing) { stopPreview(); return undefined; }
    const tn = toneRef.current === 'silent' ? 'silent' : (!toneRef.current || toneRef.current === 'default' ? 'alarm' : toneRef.current);
    previewRingtone(tn, { loop: true }).catch(() => {});
    return () => { stopPreview(); };
  }, [playing]);

  // Done, binned or deleted somewhere else (the card's ✓, the phone, another tab): that task leaves the alarm.
  useEffect(() => {
    if (!rings.length) return;
    const left = rings.filter((r) => { if (r.entryId === PREVIEW_ID) return true; const e = entries.find((x) => String(x.id) === String(r.entryId)); return e && isOpen(e); });
    if (left.length !== rings.length) setRings(left);
  }, [entries, rings]);
  useEffect(() => { if (pick >= rings.length && rings.length) setPick(rings.length - 1); }, [rings.length, pick]);

  if (Platform.OS !== 'web' || !rings.length) return null;

  const live = (id) => (String(id) === PREVIEW_ID ? preview : entries.find((x) => String(x.id) === String(id)));
  const edit = (id, fn) => update((db) => ({ ...db, workingDashboard: { ...db.workingDashboard, entries: (db.workingDashboard.entries || []).map((x) => (String(x.id) === String(id) ? fn(x) : x)) } }));
  const answered = (id) => setRings((list) => list.filter((r) => String(r.entryId) !== String(id)));

  const realAct = {
    done: (id, remark, dar) => { if (String(remark || '').trim()) edit(id, (x) => withRemark(x, remark)); answered(id); handleWdAction(dar ? 'DAR' : 'DONE', id).catch(() => {}); },
    silence: (id, remark) => {
      const e = live(id); if (!e) return;
      edit(id, (x) => silenceEntryToday(withRemark(x, remark)));
      snoozeEntryAlert(e, tone, silenceMinutes(new Date(), alerts.morning), wd.alerts).catch(warnQuiet('snoozeEntryAlert'));
      answered(id);
    },
    skip: (id, remark) => {
      const e = live(id); if (!e) return;
      const r = skipOccurrence(withRemark(e, remark), entries);
      if (!r) return;
      edit(id, () => r.skipped);
      scheduleEntryAlert(r.skipped, tone, wd.alerts).catch(warnQuiet('scheduleEntryAlert'));
      answered(id);
    },
    snooze: (id, remark, mins) => {
      const e = live(id); if (!e) return;
      const n = Number(mins) || 15;
      edit(id, (x) => snoozeEntry(withRemark(x, remark), Date.now() + n * 60000));
      snoozeEntryAlert(e, tone, n, wd.alerts).catch(warnQuiet('snoozeEntryAlert'));
      answered(id);
    },
    move: (id, remark, iso) => {
      const e = live(id); if (!e || !iso) return;
      const next = moveEntry(withRemark(e, remark), iso);
      edit(id, () => next);
      scheduleEntryAlert(next, tone, wd.alerts).catch(warnQuiet('scheduleEntryAlert'));
      if (new Date(iso) > new Date()) answered(id);
    },
    status: (id, status) => {
      if (normStatus(status) === 'completed') { act.done(id, '', false); return; }
      edit(id, (x) => ({ ...withStatus(x, status), ...editedNow() }));
    },
    repeat: (id, r) => edit(id, (x) => ({ ...x, recurrence: r, recurrenceEveryMin: r === 'custom' ? (x.recurrenceEveryMin || 15) : null, ...editedNow() })),
    open: (id) => { answered(id); onOpen?.(id); },
  };
  // The style preview's sample task changes nothing: its buttons close it (status and repeat are left as shown).
  const act = Object.fromEntries(Object.entries(realAct).map(([k, fn]) => [k, (id, ...rest) => {
    if (String(id) !== PREVIEW_ID) return fn(id, ...rest);
    if (k !== 'status' && k !== 'repeat') { answered(id); setPreview(null); }
    return undefined;
  }]));
  const silenceAll = () => rings.forEach((r) => act.silence(r.entryId, ''));
  const items = rings.map((r) => ({ ring: r, entry: live(r.entryId) })).filter((x) => x.entry);
  if (!items.length) return null;
  const cur = items[Math.min(pick, items.length - 1)];
  const playSound = () => { const tn = toneRef.current; previewRingtone(!tn || tn === 'default' ? 'alarm' : tn, { loop: true }).catch(() => {}); };
  const D = ALARM_COLORS.dark; const B = ALARM_COLORS.banner;
  const dark = { ...t, surface: D.surface, surfaceAlt: D.surfaceAlt, text: D.text, textDim: D.textDim, border: D.border };
  const pager = items.length > 1 && (
    <Pressable onPress={() => setPick((pick + 1) % items.length)} accessibilityRole="button">
      <Text style={{ color: t.textDim, fontSize: t.fs(12), fontWeight: '700' }}>{Math.min(pick, items.length - 1) + 1} of {items.length} ›</Text>
    </Pressable>
  );
  // Close: hides the alarm window without answering anything (the sound stops); a new alarm opens it again.
  const closeWindow = () => { stopPreview(); setPreview(null); setRings([]); };
  const soundHint = (color = t.accent) => (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 8 }}>
      <Pressable onPress={playSound} accessibilityRole="button" accessibilityLabel="Play the alarm sound" style={{ flexShrink: 1 }}>
        <Text style={{ color, fontWeight: '700', fontSize: t.fs(12) }}>🔊 No sound? Click here - the browser needs one click to allow it</Text>
      </Pressable>
      <Pressable onPress={closeWindow} accessibilityRole="button" accessibilityLabel="Close the alarm window" hitSlop={8}>
        <Text style={{ color, fontWeight: '800', fontSize: t.fs(13) }}>✕ Close</Text>
      </Pressable>
    </View>
  );
  const silenceAllBtn = (p = t) => (
    <Pressable onPress={silenceAll} accessibilityRole="button" style={{ marginTop: 10, paddingVertical: 11, borderRadius: 12, alignItems: 'center', backgroundColor: p.surfaceAlt, borderWidth: 1, borderColor: p.border }}>
      <Text style={{ color: p.text, fontWeight: '800', fontSize: t.fs(14) }}>Silence all for today</Text>
    </Pressable>
  );
  const backdrop = (children, align = 'center') => (
    <Modal transparent visible animationType="fade" onRequestClose={() => items.forEach((x) => act.snooze(x.entry.id, '', 15))}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: align, padding: 16 }}>{children}</View>
    </Modal>
  );
  const window = (p, children, maxWidth = 780, border = t.danger) => (
    <View accessibilityRole="alert" style={{ width: '100%', maxWidth, maxHeight: '92%', borderRadius: 20, padding: 18, backgroundColor: p.surface, borderWidth: 2, borderColor: border }}>{children}</View>
  );

  /* ---------- the seven looks ---------- */
  if (style === 2) {
    // Compact list: one line per task with Done and 15m; the rest opens under the line.
    return backdrop(
      <View accessibilityRole="alert" style={{ width: '100%', maxWidth: 660, maxHeight: '92%', borderRadius: 18, overflow: 'hidden', backgroundColor: t.surface }}>
        <View style={{ backgroundColor: t.danger, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: t.fs(16) }}>🚨 {items.length === 1 ? '1 task needs you' : `${items.length} tasks need you`}</Text>
          <Pressable onPress={silenceAll}><Text style={{ color: '#fff', fontWeight: '700', fontSize: t.fs(12) }}>Silence all for today</Text></Pressable>
        </View>
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>{soundHint()}</View>
        <ScrollView style={{ flexGrow: 0 }}>
          {items.map((x, i) => {
            const open = i === Math.min(pick, items.length - 1);
            return (
              <View key={String(x.entry.id)} style={{ borderTopWidth: 1, borderTopColor: t.border }}>
                <Pressable onPress={() => setPick(i)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingHorizontal: 16 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.danger }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(15) }} numberOfLines={1}>{x.entry.title}</Text>
                    <Text style={{ color: t.textDim, fontSize: t.fs(12) }} numberOfLines={1}>{[x.ring.title, x.entry.category, x.entry.pendingWith].filter(Boolean).join(' · ')}</Text>
                  </View>
                  <SmallBtn label="✓ Done" tone={t.ok} onPress={() => act.done(x.entry.id, '', false)} />
                  <SmallBtn label="💤 15m" onPress={() => act.snooze(x.entry.id, '', 15)} />
                  <Text style={{ color: t.accent, fontWeight: '800' }}>{open ? '⌃' : '⌄'}</Text>
                </Pressable>
                {open && <View style={{ paddingHorizontal: 16, paddingBottom: 12, backgroundColor: t.surfaceAlt }}><TaskOptions entry={x.entry} ring={x.ring} act={act} header={false} /></View>}
              </View>
            );
          })}
        </ScrollView>
      </View>,
    );
  }
  if (style === 3) {
    // Corner pop-up: bottom-right, the page stays usable; one task at a time.
    return (
      <View accessibilityRole="alert" style={{ position: 'fixed', right: 18, bottom: 18, width: 400, maxWidth: '94%', maxHeight: '88%', zIndex: 9999, borderRadius: 16, backgroundColor: t.surface, borderTopWidth: 5, borderTopColor: t.danger, padding: 14, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
          <Text style={{ color: t.danger, fontWeight: '800', fontSize: t.fs(12) }}>🚨 {cur.ring.title.toUpperCase()}</Text>
          {pager}
        </View>
        {soundHint()}
        <ScrollView style={{ flexGrow: 0 }}><TaskOptions key={String(cur.entry.id)} entry={cur.entry} ring={cur.ring} act={act} header="name" foldMore /></ScrollView>
        {items.length > 1 && silenceAllBtn()}
      </View>
    );
  }
  if (style === 4) {
    // Top banner: across the top of the page; main buttons in the band, everything else under it.
    return (
      <View accessibilityRole="alert" style={{ position: 'fixed', left: 0, right: 0, top: 0, zIndex: 9999, maxHeight: '90%', backgroundColor: B.bg, paddingVertical: 12, paddingHorizontal: 20, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <Text style={{ fontSize: 26 }}>🚨</Text>
          <View style={{ flex: 1, minWidth: 220 }}>
            <Text style={{ color: B.label, fontWeight: '800', fontSize: t.fs(11) }}>{cur.ring.title.toUpperCase()}{items.length > 1 ? ` · ${Math.min(pick, items.length - 1) + 1} OF ${items.length}` : ''}</Text>
            <Text style={{ color: '#fff', fontWeight: '800', fontSize: t.fs(18) }} numberOfLines={1}>{cur.entry.title}</Text>
          </View>
          <SmallBtn label="Mark done" solid="#fff" color={B.doneText} onPress={() => act.done(cur.entry.id, '', false)} />
          <SmallBtn label="Done + DAR" solid="rgba(255,255,255,0.2)" color="#fff" onPress={() => act.done(cur.entry.id, '', true)} />
          <SmallBtn label="💤 15m" solid="rgba(255,255,255,0.2)" color="#fff" onPress={() => act.snooze(cur.entry.id, '', 15)} />
          {items.length > 1 && <SmallBtn label="Next ›" solid="rgba(255,255,255,0.2)" color="#fff" onPress={() => setPick((pick + 1) % items.length)} />}
        </View>
        <ScrollView style={{ flexGrow: 0, marginTop: 10, borderRadius: 12, backgroundColor: t.surface, padding: 12 }}>
          {soundHint()}
          <TaskOptions key={String(cur.entry.id)} entry={cur.entry} ring={cur.ring} act={act} header={false} />
          {silenceAllBtn()}
        </ScrollView>
      </View>
    );
  }
  if (style === 6) {
    // Two panes: the ringing tasks on the left, the chosen one's options on the right.
    return backdrop(
      <View accessibilityRole="alert" style={{ width: '100%', maxWidth: 860, height: '86%', borderRadius: 20, overflow: 'hidden', backgroundColor: t.surface, flexDirection: 'row' }}>
        <View style={{ width: 250, backgroundColor: t.danger + '12', borderRightWidth: 1, borderRightColor: t.danger + '33', padding: 14 }}>
          <Text style={{ color: t.danger, fontWeight: '800', fontSize: t.fs(12), marginBottom: 8 }}>🚨 {items.length} {items.length === 1 ? 'TASK' : 'TASKS'} RINGING</Text>
          {soundHint()}
          <ScrollView style={{ flex: 1 }}>
            {items.map((x, i) => {
              const on = i === Math.min(pick, items.length - 1);
              return (
                <Pressable key={String(x.entry.id)} onPress={() => setPick(i)} style={{ backgroundColor: t.surface, borderWidth: on ? 2 : 1, borderColor: on ? t.danger : t.danger + '33', borderRadius: 12, padding: 10, marginBottom: 8 }}>
                  <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(13) }} numberOfLines={2}>{x.entry.title}</Text>
                  <Text style={{ color: t.textDim, fontSize: t.fs(11) }}>{x.ring.title}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          {silenceAllBtn()}
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18 }}>
          <TaskOptions key={String(cur.entry.id)} entry={cur.entry} ring={cur.ring} act={act} header="full" bare />
        </ScrollView>
      </View>,
    );
  }
  if (style === 7) {
    // Simple first: four big buttons; remarks, skip, move, status and repeat under "More options".
    return backdrop(window(t, (
      <ScrollView style={{ flexGrow: 0 }}>
        <View style={{ alignItems: 'center' }}>
          <Text style={{ fontSize: 40 }}>⏰</Text>
          <Text style={{ color: t.danger, fontWeight: '800', fontSize: t.fs(12), letterSpacing: 1 }}>{cur.ring.title.toUpperCase()}{items.length > 1 ? ` · ${Math.min(pick, items.length - 1) + 1} OF ${items.length}` : ''}</Text>
          <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(21), marginVertical: 8, textAlign: 'center' }}>{cur.entry.title}</Text>
          {soundHint()}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <BigBtn label="✓ Mark done" bg={t.ok} color="#fff" onPress={() => act.done(cur.entry.id, '', false)} />
          <BigBtn label="✓ Done + DAR" bg={t.ok + '22'} color={t.ok} onPress={() => act.done(cur.entry.id, '', true)} />
          <BigBtn label="💤 Snooze 15m" bg={t.surfaceAlt} color={t.text} onPress={() => act.snooze(cur.entry.id, '', 15)} />
          <BigBtn label="🔕 Silence today" bg={t.warn + '22'} color={t.warn} onPress={() => act.silence(cur.entry.id, '')} />
        </View>
        <TaskOptions key={String(cur.entry.id)} entry={cur.entry} ring={cur.ring} act={act} header={false} foldAll />
        {items.length > 1 && <Pressable onPress={() => setPick((pick + 1) % items.length)} style={{ alignSelf: 'center', marginTop: 8 }}><Text style={{ color: t.accent, fontWeight: '700' }}>Next task ›</Text></Pressable>}
        {silenceAllBtn()}
      </ScrollView>
    ), 520, t.border));
  }
  // 1 Red-framed window, and 5 the same in dark colours: every ringing task's card, one under another.
  const p = style === 5 ? dark : t;
  return backdrop(window(p, (
    <>
      <Text style={{ color: style === 5 ? D.title : t.danger, fontWeight: '800', fontSize: t.fs(13), marginBottom: 6 }}>🚨 ALARM{items.length > 1 ? ` · ${items.length} tasks` : ''}</Text>
      {soundHint(style === 5 ? D.link : t.accent)}
      <ScrollView style={{ flexGrow: 0 }}>
        {items.map((x) => <TaskOptions key={String(x.entry.id)} entry={x.entry} ring={x.ring} act={act} header="full" palette={p} />)}
      </ScrollView>
      {silenceAllBtn(p)}
    </>
  ), 780, style === 5 ? D.border : t.danger));
}

function SmallBtn({ label, onPress, tone, solid, color }) {
  const t = useTheme();
  const c = color || tone || t.text;
  return (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: solid || (tone ? tone + '1F' : t.surfaceAlt), borderWidth: solid ? 0 : 1, borderColor: (tone || t.textDim) + '55' }}>
      <Text style={{ color: c, fontWeight: '700', fontSize: t.fs(13) }}>{label}</Text>
    </Pressable>
  );
}

function BigBtn({ label, onPress, bg, color }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ flexGrow: 1, flexBasis: '45%', paddingVertical: 14, borderRadius: 14, alignItems: 'center', backgroundColor: bg }}>
      <Text style={{ color, fontWeight: '800', fontSize: t.fs(15) }}>{label}</Text>
    </Pressable>
  );
}

/**
 * One ringing task's options: what rang and the chips (header), remarks, Mark done, Done + DAR, Silence today, Skip,
 * Snooze (minutes), Move, status, repeat and Open. `foldMore` folds Move / status / repeat under one link (corner
 * pop-up); `foldAll` folds every one of them under "More options" (Simple first); `bare` drops the card frame.
 */
function TaskOptions({ entry, ring, act, header = 'full', palette, foldMore, foldAll, bare }) {
  const base = useTheme();
  const t = palette || base;
  const { data } = useStore();
  const [remark, setRemark] = useState('');
  const [mins, setMins] = useState('15');
  const [moveTo, setMoveTo] = useState(entry.dueAt || null);
  const [open, setOpen] = useState(null);     // 'status' | 'repeat' | null
  const [more, setMore] = useState(false);
  const statuses = SOURCES.wdStatus.read(data).map((o) => [o.value, o.label]);
  const id = entry.id;
  const chip = (text, color) => (
    <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: color + '1A', borderWidth: 1, borderColor: color + '40', marginRight: 6, marginBottom: 6 }}>
      <Text style={{ color, fontSize: base.fs(12), fontWeight: '600' }}>{text}</Text>
    </View>
  );
  const btn = (label, onPress, tone) => (
    <Pressable onPress={onPress} accessibilityRole="button"
      style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, marginRight: 6, marginBottom: 8, backgroundColor: (tone || t.textDim) + '1F', borderWidth: 1, borderColor: (tone || t.textDim) + '55' }}>
      <Text style={{ color: tone || t.text, fontWeight: '700', fontSize: base.fs(13) }}>{label}</Text>
    </Pressable>
  );
  const link = (label, onPress) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ marginTop: 6, marginBottom: 8, padding: 10, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: t.border }}>
      <Text style={{ color: base.accent, fontWeight: '700', fontSize: base.fs(13), textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
  const remarkBox = (
    <TextInput value={remark} onChangeText={setRemark} placeholder="Remarks / notes for today (optional) — e.g. Nothing to do Today" placeholderTextColor={t.textDim}
      style={{ backgroundColor: t.surfaceAlt, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, color: t.text, fontSize: base.fs(14), marginTop: 4, marginBottom: 10 }} />
  );
  const actions = (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }}>
      {!foldAll && btn('Mark done', () => act.done(id, remark, false), base.ok)}
      {!foldAll && btn('Done + DAR', () => act.done(id, remark, true), base.ok)}
      {!foldAll && btn('Silence today', () => act.silence(id, remark), base.warn)}
      {btn('Skip', () => act.skip(id, remark))}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 6, marginBottom: 8, borderRadius: 12, borderWidth: 1, borderColor: t.border, overflow: 'hidden' }}>
        <Pressable onPress={() => setOpen(open === 'snooze' ? null : 'snooze')} accessibilityRole="button" accessibilityLabel="Snooze length"
          style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 8, paddingHorizontal: 9 }}>
          <Text style={{ color: t.text, fontSize: base.fs(13) }}>{(SNOOZE_OPTIONS.find(([k]) => k === String(mins)) || [mins, `${mins} min`])[1]}</Text>
          <Text style={{ color: base.accent, fontSize: base.fs(12) }}>▾</Text>
        </Pressable>
        <Pressable onPress={() => act.snooze(id, remark, mins)} accessibilityRole="button" style={{ paddingVertical: 8, paddingHorizontal: 10, backgroundColor: base.accent + '1F' }}>
          <Text style={{ color: base.accent, fontWeight: '700', fontSize: base.fs(13) }}>Snooze</Text>
        </Pressable>
      </View>
      {open === 'snooze' && (
        <View style={{ width: '100%', marginBottom: 8 }}>
          <Choices options={SNOOZE_OPTIONS} value={String(mins)} onChange={(v) => { setMins(v); setOpen(null); }} />
        </View>
      )}
    </View>
  );
  const moveAndPickers = (
    <>
      {/* One line: move to (date and time), Move, status and repeat (it wraps only on a narrow window). */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', gap: 8 }}>
        <View style={{ flexGrow: 3, flexBasis: 250, minWidth: 210 }}><DateTimeField label="MOVE TO" value={moveTo} onChange={setMoveTo} /></View>
        <View style={{ marginBottom: 12 }}>{btn('Move', () => act.move(id, remark, moveTo), base.accent)}</View>
        <View style={{ flexGrow: 1, flexBasis: 130, minWidth: 120, marginBottom: 12 }}><PickerButton text={entry.status || 'Status'} onPress={() => setOpen(open === 'status' ? null : 'status')} /></View>
        <View style={{ flexGrow: 1, flexBasis: 110, minWidth: 100, marginBottom: 12 }}><PickerButton text={recurrenceLabel(entry)} onPress={() => setOpen(open === 'repeat' ? null : 'repeat')} /></View>
      </View>
      {open === 'status' && <View style={{ marginTop: 8 }}><Choices options={statuses} value={entry.status} onChange={(v) => { setOpen(null); act.status(id, v); }} /></View>}
      {open === 'repeat' && <View style={{ marginTop: 8 }}><Choices options={RECURRENCES.map((r) => [r, RECURRENCE_LABELS[r]])} value={entry.recurrence || 'none'} onChange={(v) => { setOpen(null); act.repeat(id, v); }} /></View>}
    </>
  );
  const body = (
    <>
      {header === 'full' && <Text style={{ color: base.danger, fontWeight: '700', fontSize: base.fs(13) }}>{ring.title}</Text>}
      {!!header && <Text style={{ color: t.text, fontWeight: '800', fontSize: base.fs(header === 'name' ? 16 : 18), marginTop: 2, marginBottom: 6 }}>{entry.title}</Text>}
      {!!header && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {!!entry.priority && chip(entry.priority, base.danger)}
          {!!entry.category && chip(entry.category, base.accent)}
          {!!entry.pendingWith && chip(`Pending with: ${entry.pendingWith}`, base.warn)}
          {entry.recurrence && entry.recurrence !== 'none' && chip(recurrenceLabel(entry), base.purple)}
        </View>
      )}
      {/* A bank follow-up: the banker's last word, so the call starts from it. */}
      {!!lastFollowUpLine(entry) && <Text style={{ color: t.text, fontSize: base.fs(13), marginBottom: 8 }}>📞 {lastFollowUpLine(entry)}</Text>}
      {foldAll && !more ? link('More options — remarks, skip, snooze minutes, move, status, repeat ⌄', () => setMore(true)) : (
        <>
          {remarkBox}
          {actions}
          {foldMore && !more ? link('Move · Status · Repeat ⌄', () => setMore(true)) : moveAndPickers}
        </>
      )}
      <Pressable onPress={() => act.open(id)} accessibilityRole="button" style={{ alignSelf: 'flex-start', marginTop: 10 }}>
        <Text style={{ color: base.accent, fontWeight: '700', fontSize: base.fs(13) }}>Open the task ↗</Text>
      </Pressable>
    </>
  );
  // A palette (the dark window) reaches the date and pick fields too, not only the text drawn here.
  const themed = palette ? <ThemeOverride value={palette}>{body}</ThemeOverride> : body;
  if (bare || header !== 'full') return <View>{themed}</View>;
  return <View style={{ padding: 14, borderRadius: 16, marginBottom: 10, backgroundColor: base.danger + '12', borderWidth: 1, borderColor: base.danger + '40' }}>{themed}</View>;
}
