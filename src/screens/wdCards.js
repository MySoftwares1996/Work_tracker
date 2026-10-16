/**
 * The Working Dashboard's cards and small pieces (entry rows, Register / Completed cards, stat tiles, count lists, undo bar...),
 * split out of WorkingDashboard.js. Pure presentation: they get everything through props.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Alert, Pressable, Platform, Animated, Easing } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Swipeable } from 'react-native-gesture-handler';
import { useLayout, FadeInUp, AnimatedNumber, Card, Small, Btn, Row, prefersReducedMotion } from '../ui';
import { useTheme, blend } from '../theme';
import { checklistText } from '../checklist';
import { recordNarration } from '../narrationHistory';
import { isBankFollowUpCategory, followUpAgeText, isLongPending, LONG_PENDING_DAYS } from '../bankFollowUp';
import { recurrenceLabel, isOverdue, completedTime, isSkippedToday } from '../workingDashboard';

// A bare "YYYY-MM-DD" (holidays, leave days) is that day locally; new Date() would read it as UTC midnight.
export const fmtDate = (iso) => (iso ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');

// Two cards a row on a phone, three on a tablet, four on a wide screen (see useLayout in ui.js).
export const TILE_WIDTHS = { 2: ['45%', '49%'], 3: ['30%', '32.5%'], 4: ['22%', '24.3%'] };

export function StatTile({ label, value, sub, color, onPress, index = 0 }) {
  const t = useTheme();
  const [minWidth, maxWidth] = TILE_WIDTHS[useLayout().columns];
  const web = t.frosted;      // the modern look (website and phone): compact tiles; Classic keeps the stacked tile with a stripe
  const phone = Platform.OS !== 'web';
  // web.app: compact tiles - the number beside its label, so all seven fit on a row or two instead of filling the screen.
  return (
    <FadeInUp delay={index * 60} style={web ? { flexGrow: 1, flexBasis: phone ? 150 : 170, minWidth: phone ? 140 : 150 } : { flex: 1, minWidth, maxWidth }}>
      <Card onPress={onPress} style={web ? { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, transitionProperty: 'transform, box-shadow', transitionDuration: '180ms' } : { borderLeftWidth: 4, borderLeftColor: color || t.accent, paddingVertical: 12 }}>
        {web ? (
          <Row gap={12}>
            <AnimatedNumber value={value} style={{ color: color || t.text, fontWeight: '800', fontSize: t.fs(24), letterSpacing: -0.5, minWidth: 30 }} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={phone ? 2 : 1} style={{ color: t.text, fontWeight: '700', fontSize: t.fs(12.5) }}>{label}</Text>
              {!!sub && <Small numberOfLines={1}>{sub}</Small>}
            </View>
          </Row>
        ) : (
          <>
            <AnimatedNumber value={value} style={{ color: color || t.text, fontWeight: '800', fontSize: t.fs(24) }} />
            <Text style={{ color: t.text, fontWeight: '700', fontSize: t.fs(13), marginTop: 2 }}>{label}</Text>
            {!!sub && <Small>{sub}</Small>}
          </>
        )}
      </Card>
    </FadeInUp>
  );
}

export const PRIORITY_COLOR = { High: 'danger', Medium: 'warn', Low: 'ok' };
export const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;
export const isMidnight = (d) => d.getHours() === 0 && d.getMinutes() === 0;
/** "3 Sept", or "21 Sept · 12:03 PM" when the entry has a real time. */
export const fmtDue = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  const day = d.toLocaleDateString([], { day: 'numeric', month: 'short' });
  return isMidnight(d) ? day : `${day} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
};

export function statusColor(t, status) {
  if (status === 'In-Progress') return t.accent;
  if (status === 'Pending') return t.warn;
  if (status === 'Completed') return t.ok;
  return null; // "Not Yet Started" and anything else: plain text, no pill
}

/** Whole calendar days between the due date and today (0 when due today). */
export const daysLate = (due) => {
  const a = new Date(due.getFullYear(), due.getMonth(), due.getDate());
  const now = new Date();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.round((b - a) / 86400000));
};

/** "Today, 4:12 pm" / "Yesterday, 9:05 am" / "3 Sept, 5:30 pm". */
export const fmtWhen = (ms) => {
  const d = new Date(ms);
  const today = new Date();
  const y = new Date(); y.setDate(y.getDate() - 1);
  const same = (a, b2) => a.toDateString() === b2.toDateString();
  const day = same(d, today) ? 'Today' : same(d, y) ? 'Yesterday' : d.toLocaleDateString([], { day: 'numeric', month: 'short', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
  return `${day}, ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
};

export function RoundBtn({ icon, label, onPress, color, solid, a11y }) {
  const t = useTheme();
  const c = color || t.textDim;
  // "Both" (phone-width screens): the button springs down under the finger and back.
  const springy = !useLayout().tablet;
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v) => { if (springy && !prefersReducedMotion()) Animated.spring(scale, { toValue: v, speed: 40, bounciness: v === 1 ? 12 : 0, useNativeDriver: Platform.OS !== 'web' }).start(); };
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable onPress={onPress} onPressIn={() => to(0.86)} onPressOut={() => to(1)} hitSlop={6} accessibilityRole="button" accessibilityLabel={a11y || label || icon}
        style={({ pressed }) => ({ height: 36, minWidth: 36, paddingHorizontal: label ? 12 : 0, borderRadius: 18, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4, backgroundColor: solid ? c : c + '1A', opacity: pressed ? 0.6 : 1 })}>
        {!!icon && <Text style={{ color: solid ? '#fff' : c, fontWeight: '800', fontSize: t.fs(15) }}>{icon}</Text>}
        {!!label && <Text style={{ color: solid ? '#fff' : c, fontWeight: '700', fontSize: t.fs(13) }}>{label}</Text>}
      </Pressable>
    </Animated.View>
  );
}

/**
 * "Both" (phone-width screens): a card that leaves its list - completed, reopened, binned - slides away and fades
 * before the change is made, so you see it go. Returns [style, leave(fn)]. If the card is still there afterwards
 * (the change was refused, e.g. a Sub Category is needed first), it comes back.
 */
export function useLeaveAnimation() {
  const v = useRef(new Animated.Value(1)).current;
  const leave = (fn) => {
    if (prefersReducedMotion()) { fn(); return; }
    Animated.timing(v, { toValue: 0, duration: 240, easing: Easing.in(Easing.cubic), useNativeDriver: Platform.OS !== 'web' }).start(() => { fn(); v.setValue(1); });
  };
  const style = { opacity: v, transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [48, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) }] };
  return [style, leave];
}

/*
 * web.app: Register, Completed and Bin show two cards a row from tablet width up; a phone browser shows one card a
 * row, like the APK ("device compatible"). Lists in the grid show whole rows of two.
 */
export const GRID = Platform.OS === 'web';
export const SEARCH_PLACEHOLDER = '🔍 Search tasks...';
// Cards (APK and web.app): DAR completes the task AND puts it in the daily report; ✓ completes it and keeps it OUT of it.
export const WEB_DAR = true;
export const GRID_COLS = 2;
export const gridCount = (n) => (GRID ? Math.ceil(n / GRID_COLS) * GRID_COLS : n);
export function CardGrid({ children }) {
  const { tablet } = useLayout();
  // A phone-width screen shows one card a row on the website too ("device compatible").
  if (!GRID || !tablet) return children;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -5 }}>
      {React.Children.toArray(children).map((child) => (
        <View key={child.key} style={{ width: `${100 / GRID_COLS}%`, paddingHorizontal: 5 }}>{child}</View>
      ))}
    </View>
  );
}

/** One entry card, shared by Register (mode "open") and Completed (mode "done") - on tablets and desktops. */
export function EntryRow({ entry, mode = 'open', onPress, onToggleDar, onAct, ring, onToggleAlert, narration, onFollowUp }) {
  const t = useTheme();
  const inDone = mode === 'done';
  const due = entry.dueAt ? new Date(entry.dueAt) : null;
  const overdue = !inDone && isOverdue(entry);
  const pc = t[PRIORITY_COLOR[entry.priority]] || t.textDim;
  const sc = statusColor(t, entry.status);
  const recur = entry.recurrence && entry.recurrence !== 'none' ? recurrenceLabel(entry) : null;
  const doneMs = inDone ? completedTime(entry) : 0;
  const meta = [entry.category, entry.pendingWith, recur && `↻ ${recur}`, checklistText(entry) && `☑ ${checklistText(entry)}`, (entry.attachments || []).length && `📎 ${entry.attachments.length}`].filter(Boolean);
  // On a phone the due line gets a line of its own above the buttons: beside them it was cut to "Overdue · …".
  // In the web's two-a-row grid a card is narrow at any screen size: it always uses the stacked phone layout.
  const layout = useLayout();
  const tablet = layout.tablet && !GRID;
  // "Both" (the APK and the website on a phone) and web.app at every width: tapping the mail chain copies it and
  // opens the task at once. Only the APK on a tablet-wide screen just copies.
  const phoneWidth = !layout.tablet || Platform.OS === 'web';
  const late = overdue && due ? daysLate(due) : 0;
  const dueLine = inDone ? (
    <>
      <Text style={{ color: t.ok, fontWeight: '700', fontSize: t.fs(13.5) }} numberOfLines={1}>
        ✓ {doneMs ? `Completed ${fmtWhen(doneMs)}` : 'Completed · time not recorded'}
      </Text>
      {!!due && <Small numberOfLines={1}>Due {fmtDue(entry.dueAt)}</Small>}
    </>
  ) : (
    <Text style={{ color: overdue ? t.danger : due ? t.text : t.textDim, fontWeight: '700', fontSize: t.fs(13.5) }} numberOfLines={2}>
      {due ? `${overdue ? '⚠ Overdue · ' : '⏰ Due '}${fmtDue(entry.dueAt)}${late ? ` · ${late} day${late === 1 ? '' : 's'} late` : ''}` : 'No due date'}
    </Text>
  );
  const statusPill = entry.status ? (
    <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10, backgroundColor: (sc || t.textDim) + '1F' }}>
      <Text style={{ color: sc || t.textDim, fontWeight: '700', fontSize: t.fs(11.5) }} numberOfLines={1}>{entry.status}</Text>
    </View>
  ) : null;
  const row = (
    <Pressable onPress={onPress} style={({ pressed }) => ({ marginBottom: 10, transform: [{ scale: pressed ? 0.985 : 1 }], ...(GRID ? { flex: 1 } : null) })}>
      <View style={{ backgroundColor: t.surface, borderRadius: 16, paddingVertical: 14, paddingHorizontal: GRID ? 10 : 14, borderWidth: 0.5, borderColor: overdue ? t.danger + '66' : t.border, ...t.shadow, ...(GRID ? { flex: 1 } : null) }}>
        <Row style={{ alignItems: GRID ? 'stretch' : 'flex-start', gap: GRID ? 8 : 10, ...(GRID ? { flex: 1 } : null) }}>
          <View style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, backgroundColor: inDone ? t.ok : pc, opacity: inDone ? 0.7 : 1 }} />
          <View style={{ flex: 1 }}>
            {/* web.app: the task gets the card's whole width - two full lines, "…" only past that - and the status moves
                to the row below: beside the title it took a column of its own, and a description was cut after a few
                words with half the second line empty. The APK keeps the status beside the title. */}
            <Row style={{ alignItems: 'flex-start', gap: 8 }}>
              <Text style={{ flex: 1, color: t.text, fontWeight: '700', fontSize: t.fs(16), lineHeight: t.fs(21), textDecorationLine: inDone ? 'line-through' : 'none', textDecorationColor: t.textDim }} numberOfLines={2}>{entry.title}</Text>
              {!GRID && statusPill}
            </Row>
            <Row style={{ alignItems: 'center', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {GRID && statusPill}
              {!!entry.priority && (
                <Row style={{ alignItems: 'center', gap: 4 }}>
                  <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: pc }} />
                  <Text style={{ color: pc, fontWeight: '700', fontSize: t.fs(12.5) }}>{entry.priority}</Text>
                </Row>
              )}
              {meta.map((m, i) => (
                <Text key={`${i}-${m}`} style={{ color: t.textDim, fontSize: t.fs(12.5) }} numberOfLines={1}>·  {m}</Text>
              ))}
              {inDone && <Text style={{ color: entry.dar !== false ? t.ok : t.textDim, fontSize: t.fs(12.5), fontWeight: '700' }} numberOfLines={1}>·  {entry.dar !== false ? '📊 In daily report' : 'Not in daily report'}</Text>}
              {/* web.app: how long a bank follow-up has been open, as on the phone's card. */}
              {Platform.OS === 'web' && !inDone && isBankFollowUpCategory(entry.category) && (
                <Text style={{ color: t.warn, fontSize: t.fs(12.5), fontWeight: '700' }} numberOfLines={1}>·  📞 {followUpAgeText(entry)}</Text>
              )}
            </Row>
            {!!entry.reference && (
              <Pressable onPress={async () => { await Clipboard.setStringAsync(entry.reference); if (phoneWidth) onPress?.(); }} hitSlop={6} accessibilityLabel={phoneWidth ? 'Copy the mail chain and open the task' : 'Copy the mail chain'} style={{ alignSelf: 'flex-start', marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: t.surfaceAlt }}>
                <Text style={{ fontSize: t.fs(11) }}>📋</Text>
                <Text style={{ color: t.accent, fontSize: t.fs(12) }} numberOfLines={1}>{entry.reference}</Text>
              </Pressable>
            )}
            {(!!narration || (!inDone && isSkippedToday(entry))) && (
              <Row style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                {!!narration && (
                  // The Tally narration, as on the web app's card: one tap copies it for Tally.
                  <Pressable onPress={async () => { await Clipboard.setStringAsync(narration); recordNarration(narration); Alert.alert('Copied', 'Narration copied - paste it into Tally.'); }} hitSlop={6} accessibilityLabel="Copy narration"
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: t.ok + '1A' }}>
                    <Text style={{ color: t.ok, fontSize: t.fs(12), fontWeight: '700' }}>⧉ Narration</Text>
                  </Pressable>
                )}
                {!inDone && isSkippedToday(entry) && (
                  <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: t.warn + '1F' }}>
                    <Text style={{ color: t.warn, fontSize: t.fs(12), fontWeight: '700' }}>Skipped today</Text>
                  </View>
                )}
              </Row>
            )}
            {/* In a row of two, the due line and buttons line up at the foot of every card. */}
            {GRID && <View style={{ flexGrow: 1 }} />}
            <View style={{ height: 0.5, backgroundColor: t.border, marginTop: 12, marginBottom: 10 }} />
            {!tablet && <View style={{ marginBottom: 10 }}>{dueLine}</View>}
            <Row style={{ alignItems: 'center', gap: GRID ? 6 : 8, justifyContent: 'flex-end', flexWrap: GRID ? 'wrap' : 'nowrap' }}>
              {tablet && <View style={{ flex: 1 }}>{dueLine}</View>}
              {!inDone && !!onToggleAlert && (
                <RoundBtn icon={ring ? '🔔' : '🔕'} a11y={ring ? 'Rings as an alarm - tap for a plain reminder' : 'Plain reminder - tap to ring as an alarm'} color={ring ? t.warn : t.textDim} onPress={onToggleAlert} />
              )}
              {Platform.OS === 'web' && <RoundBtn icon="✎" a11y="Edit" onPress={onPress} />}
              {!inDone && !!onFollowUp && <RoundBtn icon="📞" a11y="Bank follow-up: banker's update and the next follow-up date" color={t.accent} onPress={onFollowUp} />}
              {WEB_DAR && !inDone
                ? <RoundBtn label="DAR" a11y="Complete, and add to the daily report" color={t.ok} onPress={() => onAct('complete', { dar: true })} />
                : <RoundBtn label="DAR" icon={entry.dar !== false ? '✓' : ''} a11y={entry.dar !== false ? 'In the daily report - tap for "Done" only' : 'Add to the daily report'} color={t.ok} solid={entry.dar !== false} onPress={onToggleDar} />}
              {inDone && <RoundBtn icon="🗑" a11y="Move to Bin" color={t.danger} onPress={() => onAct('bin')} />}
              {inDone
                ? <RoundBtn icon="↩" a11y="Reopen" color={t.accent} onPress={() => onAct('reopen')} />
                : <RoundBtn icon="✓" a11y={WEB_DAR ? 'Complete - not in the daily report' : 'Complete'} color={t.ok} onPress={() => onAct('complete', WEB_DAR ? { dar: false } : undefined)} />}
            </Row>
          </View>
        </Row>
      </View>
    </Pressable>
  );
  // No swipe gestures: complete and bin only with the buttons, so a scroll or tab swipe can never change an entry.
  return row;
}

/**
 * "Both" (the APK and the website on a phone): a Register card as the web app draws it - the task with its status
 * beside it, priority / category / person chips, the mail chain (a tap copies it and opens the task), the due date
 * (red with ⚠ once overdue) and the actions. Overdue cards are tinted.
 */
export function OpenCard({ entry, onOpen, onToggleDar, onComplete, ring, onToggleAlert, narration, onFollowUp, onEscalate }) {
  const t = useTheme();
  const [leaveStyle, leave] = useLeaveAnimation();
  const [ticked, setTicked] = useState(false);      // ✓ fills green for a moment as the card leaves
  const due = entry.dueAt ? new Date(entry.dueAt) : null;
  const overdue = isOverdue(entry);
  const pc = t[PRIORITY_COLOR[entry.priority]] || t.textDim;
  const sc = statusColor(t, entry.status);
  const recur = entry.recurrence && entry.recurrence !== 'none' ? recurrenceLabel(entry) : null;
  const chip = (text, color, key) => (
    <View key={key} style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: (color || t.textDim) + '1A', borderWidth: color ? 1 : 0, borderColor: (color || t.textDim) + '40' }}>
      <Text style={{ color: color || t.textDim, fontSize: t.fs(12.5), fontWeight: color ? '600' : '500' }} numberOfLines={1}>{text}</Text>
    </View>
  );
  return (
    <Animated.View style={leaveStyle}>
    <Pressable onPress={onOpen} style={({ pressed, hovered }) => ({ marginBottom: 10, transform: [{ scale: pressed ? 0.985 : 1 }, { translateY: hovered && Platform.OS === 'web' ? -2 : 0 }], transitionProperty: 'transform', transitionDuration: '180ms' })}>
      <View style={{ backgroundColor: overdue ? blend(t.danger, 0.06, t.surface) : t.surface, borderRadius: t.frosted ? 14 : 16, padding: 14, borderLeftWidth: t.frosted ? 0 : 4, borderLeftColor: pc, borderWidth: 0.5, borderColor: overdue ? t.danger + '55' : t.border, ...t.shadow }}>
        <Row style={{ alignItems: 'flex-start', gap: 8 }}>
          {t.frosted && <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: pc, marginTop: 6 }} />}
          <Text style={{ flex: 1, color: t.text, fontWeight: '800', fontSize: t.fs(16), lineHeight: t.fs(21) }} numberOfLines={2}>{entry.title}</Text>
          {!!entry.status && (sc ? (
            <View style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: sc + '1F' }}>
              <Text style={{ color: sc, fontWeight: '700', fontSize: t.fs(12) }} numberOfLines={1}>{entry.status}</Text>
            </View>
          ) : <Text style={{ color: t.text, fontWeight: '700', fontSize: t.fs(12.5), maxWidth: '40%' }} numberOfLines={2}>{entry.status}</Text>)}
        </Row>
        <Row style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {!!entry.priority && chip(entry.priority, null, 'p')}
          {!!entry.category && chip(entry.category, t.accent, 'c')}
          {!!recur && chip(`↻ ${recur}`, t.purple, 'r')}
          {!!entry.pendingWith && chip(entry.pendingWith, null, 'w')}
          {!!checklistText(entry) && chip(`☑ ${checklistText(entry)}`, null, 'ck')}
          {!!(entry.attachments || []).length && chip(`📎 ${entry.attachments.length}`, null, 'att')}
          {/* A bank follow-up runs for weeks: how long it has been open, and how many times it was followed up. */}
          {isBankFollowUpCategory(entry.category) && chip(`📞 ${followUpAgeText(entry)}`, t.warn, 'age')}
          {isBankFollowUpCategory(entry.category) && isLongPending(entry) && chip(`⚠ Long pending (${LONG_PENDING_DAYS}+ days)`, t.danger, 'long')}
        </Row>
        {/* Open 15+ days and not High: offered once - raise to High and put "Escalated to manager" in today's report. */}
        {!!onEscalate && (
          <View style={{ marginTop: 8, padding: 10, borderRadius: 12, backgroundColor: t.danger + '12', borderWidth: 1, borderColor: t.danger + '40' }}>
            <Text style={{ color: t.text, fontSize: t.fs(13), fontWeight: '700', marginBottom: 8 }}>Open {LONG_PENDING_DAYS}+ days. Escalate to your manager? (raises it to High)</Text>
            <Row gap={8}>
              <Btn style={{ flex: 1 }} kind="soft" title="Not now" onPress={() => onEscalate(false)} />
              <Btn style={{ flex: 2 }} kind="danger" title="Escalate · High" onPress={() => onEscalate(true)} />
            </Row>
          </View>
        )}
        {!!entry.reference && (
          <Pressable onPress={async () => { await Clipboard.setStringAsync(entry.reference); onOpen(); }} hitSlop={6} accessibilityLabel="Copy the mail chain and open the task"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: t.accent + '14', alignSelf: 'stretch' }}>
            <Text style={{ color: t.accent, fontSize: t.fs(12) }}>⧉</Text>
            <Text style={{ flex: 1, color: t.accent, fontSize: t.fs(13) }} numberOfLines={1}>{entry.reference}</Text>
          </Pressable>
        )}
        {(!!narration || isSkippedToday(entry)) && (
          <Row style={{ gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
            {!!narration && (
              <Pressable onPress={async () => { await Clipboard.setStringAsync(narration); recordNarration(narration); Alert.alert('Copied', 'Narration copied - paste it into Tally.'); }} hitSlop={6} accessibilityLabel="Copy narration"
                style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: t.ok + '1A' }}>
                <Text style={{ color: t.ok, fontSize: t.fs(12), fontWeight: '700' }}>⧉ Narration</Text>
              </Pressable>
            )}
            {isSkippedToday(entry) && (
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: t.warn + '1F' }}>
                <Text style={{ color: t.warn, fontSize: t.fs(12), fontWeight: '700' }}>Skipped today</Text>
              </View>
            )}
          </Row>
        )}
        <Row style={{ alignItems: 'center', gap: 8, marginTop: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <Text style={{ flex: 1, minWidth: 90, textAlign: 'right', color: overdue ? t.danger : due ? t.text : t.textDim, fontWeight: '800', fontSize: t.fs(14) }} numberOfLines={1}>
            {due ? `${overdue ? '⚠ ' : '⏰ '}${fmtDue(entry.dueAt)}` : 'No due date'}
          </Text>
          {!!onToggleAlert && <RoundBtn icon={ring ? '🔔' : '🔕'} a11y={ring ? 'Rings as an alarm - tap for a plain reminder' : 'Plain reminder - tap to ring as an alarm'} color={ring ? t.warn : t.textDim} onPress={onToggleAlert} />}
          {Platform.OS === 'web' && <RoundBtn icon="✎" a11y="Edit" onPress={onOpen} />}
          {!!onFollowUp && <RoundBtn icon="📞" a11y="Bank follow-up: banker's update and the next follow-up date" color={t.accent} onPress={onFollowUp} />}
          {WEB_DAR
            ? <RoundBtn label="DAR" a11y="Complete, and add to the daily report" color={t.ok} onPress={() => { setTicked(true); leave(() => { setTicked(false); onComplete({ dar: true }); }); }} />
            : <RoundBtn label="DAR" icon={entry.dar !== false ? '✓' : ''} a11y={entry.dar !== false ? 'In the daily report - tap for "Done" only' : 'Add to the daily report'} color={t.ok} solid={entry.dar !== false} onPress={onToggleDar} />}
          <RoundBtn icon="✓" a11y={WEB_DAR ? 'Complete - not in the daily report' : 'Complete'} color={t.ok} solid={ticked && !WEB_DAR} onPress={() => { setTicked(true); leave(() => { setTicked(false); onComplete(WEB_DAR ? { dar: false } : undefined); }); }} />
        </Row>
      </View>
    </Pressable>
    </Animated.View>
  );
}

/**
 * "Both" (the APK and the website on a phone): a Completed card as the web app draws it - the task, its priority,
 * category, repeat and person as chips, the mail chain (a tap copies it and opens the task), when it was completed,
 * and copy narration / reopen / bin.
 */
export function DoneCard({ entry, onOpen, onReopen, onBin, narration }) {
  const t = useTheme();
  const [leaveStyle, leave] = useLeaveAnimation();
  const doneMs = completedTime(entry);
  const chip = (text, color, key) => (
    <View key={key} style={{ paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: (color || t.textDim) + '1A', borderWidth: color ? 1 : 0, borderColor: (color || t.textDim) + '40' }}>
      <Text style={{ color: color || t.textDim, fontSize: t.fs(12.5), fontWeight: color ? '600' : '500' }} numberOfLines={1}>{text}</Text>
    </View>
  );
  return (
    <Animated.View style={leaveStyle}>
    <Pressable onPress={onOpen} style={({ pressed, hovered }) => ({ marginBottom: 10, transform: [{ scale: pressed ? 0.985 : 1 }, { translateY: hovered && Platform.OS === 'web' ? -2 : 0 }], transitionProperty: 'transform', transitionDuration: '180ms' })}>
      <View style={{ backgroundColor: t.surface, borderRadius: t.frosted ? 14 : 16, padding: 14, borderLeftWidth: t.frosted ? 0 : 4, borderLeftColor: t.textDim + '66', borderWidth: 0.5, borderColor: t.border, ...t.shadow }}>
        <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(16), lineHeight: t.fs(21) }} numberOfLines={2}>{entry.title}</Text>
        <Row style={{ flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {!!entry.priority && chip(entry.priority, null, 'p')}
          {!!entry.category && chip(entry.category, t.accent, 'c')}
          {chip(recurrenceLabel(entry), t.purple, 'r')}
          {chip(entry.dar !== false ? '📊 In daily report' : 'Not in daily report', entry.dar !== false ? t.ok : null, 'd')}
          {!!entry.pendingWith && chip(entry.pendingWith, null, 'w')}
        </Row>
        {!!entry.reference && (
          <Pressable onPress={async () => { await Clipboard.setStringAsync(entry.reference); onOpen(); }} hitSlop={6} accessibilityLabel="Copy the mail chain and open the task"
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: t.accent + '14', alignSelf: 'stretch' }}>
            <Text style={{ color: t.accent, fontSize: t.fs(12) }}>⧉</Text>
            <Text style={{ flex: 1, color: t.accent, fontSize: t.fs(13) }} numberOfLines={1}>{entry.reference}</Text>
          </Pressable>
        )}
        <Row style={{ alignItems: 'center', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
          <Text style={{ flex: 1, color: t.textDim, fontSize: t.fs(13.5), textAlign: 'right' }} numberOfLines={1}>
            {doneMs ? `Completed ${new Date(doneMs).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'Completed'}
          </Text>
          {!!narration && (
            <RoundBtn icon="⧉" a11y="Copy narration" onPress={async () => { await Clipboard.setStringAsync(narration); recordNarration(narration); Alert.alert('Copied', 'Narration copied - paste it into Tally.'); }} />
          )}
          <RoundBtn icon="↺" a11y="Reopen" color={t.accent} onPress={() => leave(onReopen)} />
          <RoundBtn icon="🗑" a11y="Move to Bin" color={t.danger} onPress={() => leave(onBin)} />
        </Row>
      </View>
    </Pressable>
    </Animated.View>
  );
}

/** iOS-style "Completed · Undo" bar above the tab bar; disappears after a few seconds. */
export function UndoBar({ undo, onUndo, onHide, bottom, left = 16 }) {
  const t = useTheme();
  useEffect(() => {
    if (!undo) return undefined;
    const i = setTimeout(onHide, 6000);
    return () => clearTimeout(i);
  }, [undo]); // eslint-disable-line react-hooks/exhaustive-deps
  // Phone widths: the bar slides up into place.
  const phone = !useLayout().tablet;
  const rise = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!undo || !phone || prefersReducedMotion()) { rise.setValue(1); return; }
    rise.setValue(0);
    Animated.spring(rise, { toValue: 1, friction: 7, tension: 70, useNativeDriver: Platform.OS !== 'web' }).start();
  }, [undo]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!undo) return null;
  return (
    <Animated.View style={{ opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }], position: 'absolute', left, right: 16, bottom, flexDirection: 'row', alignItems: 'center', backgroundColor: t.text, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 16, elevation: 14, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
      <Text style={{ color: t.bg, flex: 1, fontSize: t.fs(14) }} numberOfLines={2}>{undo.message}</Text>
      <Pressable onPress={onUndo} hitSlop={10} accessibilityRole="button" accessibilityLabel="Undo">
        <Text style={{ color: t.warn, fontWeight: '800', fontSize: t.fs(15), marginLeft: 14 }}>Undo</Text>
      </Pressable>
    </Animated.View>
  );
}

export function ShowMore({ total, visibleCount, onPress }) {
  const t = useTheme();
  return Platform.OS !== 'web' && total > visibleCount ? (
    <Pressable onPress={onPress} style={{ paddingVertical: 14, alignItems: 'center' }}>
      <Text style={{ color: t.accent, fontWeight: '700' }}>••• Show more ({total - visibleCount} left)</Text>
    </Pressable>
  ) : null;
}

export function CountList({ title, total, rows, activeLabel, onPress }) {
  const t = useTheme();
  // Desktop website: the items sit four a row instead of one long column.
  const { wide } = useLayout();
  // The columns follow the card's own width (it can sit in a narrow side column): the name must always be readable.
  const [cardW, setCardW] = useState(0);
  const cols = !(GRID && wide) || !cardW ? 1 : cardW >= 760 ? 4 : cardW >= 520 ? 3 : cardW >= 380 ? 2 : 1;
  const side = cols > 1;
  if (!rows.length) return null;
  return (
    <Card style={{ marginTop: 14 }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <Small style={{ fontWeight: '700', textTransform: 'uppercase' }}>{title}</Small>
        <Small>{total} open</Small>
      </Row>
      <View onLayout={(e) => setCardW(e.nativeEvent.layout.width)} style={side ? { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 } : undefined}>
      {rows.map((r) => {
        const item = (
        <Pressable
          key={r.label}
          onPress={() => onPress?.(r.label)}
          style={{
            flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
            paddingVertical: 10, paddingHorizontal: 10, borderRadius: t.radius - 8, marginBottom: 4,
            backgroundColor: activeLabel === r.label ? t.accent + '14' : t.surfaceAlt,
            borderWidth: activeLabel === r.label ? 1 : 0, borderColor: t.accent,
          }}
        >
          <Text style={{ color: t.text, fontSize: t.fs(14), ...(side ? { flexShrink: 1, marginRight: 6 } : null) }} numberOfLines={1}>{r.label}</Text>
          <View style={{ backgroundColor: t.bgAlt, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2 }}>
            <Text style={{ color: t.text, fontWeight: '700', fontSize: t.fs(12) }}>{r.count}</Text>
          </View>
        </Pressable>
        );
        return side ? <View key={r.label} style={{ width: `${100 / cols}%`, paddingHorizontal: 4 }}>{item}</View> : item;
      })}
      </View>
    </Card>
  );
}



/*
 * The phone's own pieces (the app-style Home and Tasks): a coloured tile for the Home carousel, and a compact task row that
 * slides open to Done / DAR.
 */

/** A coloured count tile for the Home carousel. `tone`: a theme colour; `dark` puts dark text on a light tone (amber). */
export function PhoneTile({ label, value, tone, dark, onPress }) {
  const t = useTheme();
  const ink = dark ? '#3B2A00' : '#fff';
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} style={({ pressed }) => ({ width: 118, height: 84, borderRadius: 18, padding: 12, backgroundColor: tone, overflow: 'hidden', transform: [{ scale: pressed ? 0.97 : 1 }], ...t.shadow })}>
      <View style={{ position: 'absolute', right: -16, top: -16, width: 56, height: 56, borderRadius: 28, backgroundColor: 'rgba(255,255,255,0.22)' }} />
      <Text style={{ color: ink, fontWeight: '700', fontSize: t.fs(12), opacity: 0.95 }} numberOfLines={2}>{label}</Text>
      <Text style={{ color: ink, fontWeight: '800', fontSize: t.fs(30), letterSpacing: -1, marginTop: 'auto' }}>{value}</Text>
    </Pressable>
  );
}

/** A task as one rounded row: a priority dot, the title, chips, and when it is due. With onDone / onDar it slides open to ✓ Done and ✓ DAR. */
export function PhoneRow({ entry, onPress, onDone, onDar, onFollowUp }) {
  const t = useTheme();
  const swipe = useRef(null);
  const due = entry.dueAt ? new Date(entry.dueAt) : null;
  const overdue = isOverdue(entry);
  const pc = t[PRIORITY_COLOR[entry.priority]] || t.textDim;
  const late = overdue && due ? daysLate(due) : 0;
  const when = due
    ? (overdue ? `Overdue${late ? `\n${late} d` : ''}` : `${due.toLocaleDateString([], { day: 'numeric', month: 'short' })}${isMidnight(due) ? '' : `\n${due.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}`)
    : 'No date';
  const chips = [entry.priority && { text: entry.priority, color: pc }, entry.category && { text: entry.category }, entry.pendingWith && { text: entry.pendingWith }, entry.recurrence && entry.recurrence !== 'none' && { text: `↻ ${recurrenceLabel(entry)}` }, checklistText(entry) && { text: `☑ ${checklistText(entry)}` }].filter(Boolean);
  const body = (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={entry.title} style={({ pressed }) => ({ backgroundColor: t.surface, borderRadius: 18, paddingVertical: 13, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'flex-start', gap: 12, opacity: pressed ? 0.92 : 1, ...(onDone ? null : t.shadow) })}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: pc, marginTop: 6 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontWeight: '700', fontSize: t.fs(15.5), lineHeight: t.fs(20) }} numberOfLines={2}>{entry.title}</Text>
        <Row style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {chips.map((c, i) => (
            <View key={i} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: (c.color || t.textDim) + '22' }}>
              <Text style={{ color: c.color || t.textDim, fontWeight: '700', fontSize: t.fs(11.5) }} numberOfLines={1}>{c.text}</Text>
            </View>
          ))}
        </Row>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <Text style={{ color: overdue ? t.danger : t.textDim, fontWeight: '700', fontSize: t.fs(11.5), textAlign: 'right', lineHeight: t.fs(15) }}>{when}</Text>
        {!!onFollowUp && <Pressable onPress={onFollowUp} hitSlop={8} accessibilityRole="button" accessibilityLabel="Bank follow-up"><Text style={{ fontSize: t.fs(18) }}>📞</Text></Pressable>}
      </View>
    </Pressable>
  );
  if (!onDone) return <View style={{ marginBottom: 10 }}>{body}</View>;
  const action = (label, color, fn) => (
    <Pressable onPress={() => { if (swipe.current) swipe.current.close(); fn(); }} accessibilityRole="button" accessibilityLabel={label === 'DAR' ? 'Complete, and add to the daily report' : 'Complete'} style={{ width: 70, alignItems: 'center', justifyContent: 'center', backgroundColor: color }}>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: t.fs(17) }}>✓</Text>
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: t.fs(12) }}>{label}</Text>
    </Pressable>
  );
  return (
    <View style={{ marginBottom: 10, borderRadius: 18, overflow: 'hidden', ...t.shadow }}>
      <Swipeable ref={swipe} overshootRight={false} friction={1.6} rightThreshold={40} renderRightActions={() => <View style={{ flexDirection: 'row' }}>{action('Done', t.ok, onDone)}{onDar ? action('DAR', blend(t.text, 0.3, t.ok), onDar) : null}</View>}>
        {body}
      </Swipeable>
    </View>
  );
}

/** A finished task as a row: a green dot, the title, when it was completed and whether it is in the daily report, and Reopen. */
export function PhoneDoneRow({ entry, onPress, onReopen }) {
  const t = useTheme();
  const ms = completedTime(entry);
  const time = ms ? new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  const chips = [
    { text: `✓ ${time || 'done'}`, color: t.ok },
    { text: entry.dar ? 'In report' : 'Done only', color: entry.dar ? t.accent : t.textDim },
    entry.category && { text: entry.category, color: t.textDim },
  ].filter(Boolean);
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={entry.title} style={({ pressed }) => ({ backgroundColor: t.surface, borderRadius: 18, paddingVertical: 13, paddingHorizontal: 14, marginBottom: 10, flexDirection: 'row', alignItems: 'flex-start', gap: 12, opacity: pressed ? 0.92 : 1, ...t.shadow })}>
      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.ok, marginTop: 6 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: t.text, fontWeight: '700', fontSize: t.fs(15.5), lineHeight: t.fs(20) }} numberOfLines={2}>{entry.title}</Text>
        <Row style={{ flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {chips.map((c, i) => (
            <View key={i} style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: c.color + '22' }}>
              <Text style={{ color: c.color, fontWeight: '700', fontSize: t.fs(11.5) }} numberOfLines={1}>{c.text}</Text>
            </View>
          ))}
        </Row>
      </View>
      <Pressable onPress={onReopen} hitSlop={8} accessibilityRole="button" accessibilityLabel="Reopen" style={{ alignItems: 'center' }}>
        <Text style={{ color: t.accent, fontSize: t.fs(20) }}>↩</Text>
        <Text style={{ color: t.accent, fontWeight: '700', fontSize: t.fs(11) }}>Reopen</Text>
      </Pressable>
    </Pressable>
  );
}
