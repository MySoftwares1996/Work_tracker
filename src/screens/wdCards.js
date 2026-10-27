/**
 * The Working Dashboard's cards and small pieces (entry rows, Register / Completed cards, stat tiles, count lists, undo bar...),
 * split out of WorkingDashboard.js. Pure presentation: they get everything through props.
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Alert, Pressable, Platform, Animated } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useLayout, FadeInUp, AnimatedNumber, Card, Small, Row, prefersReducedMotion } from '../ui';
import Icon, { ICON_NAMES } from '../icons';
import { display } from '../fonts';
import { GradBox, GradIcon, CatIcon } from '../gradient';
import { useTheme } from '../theme';
import { checklistText } from '../checklist';
import { recordNarration } from '../narrationHistory';
import { isBankFollowUpCategory, followUpAgeText } from '../bankFollowUp';
import { recurrenceLabel, isOverdue, completedTime, isSkippedToday } from '../workingDashboard';

// A bare "YYYY-MM-DD" (holidays, leave days) is that day locally; new Date() would read it as UTC midnight.
export const fmtDate = (iso) => (iso ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00` : iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '');
export const fmtDateTime = (iso) => (iso ? new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');


export function StatTile({ label, value, sub, color, onPress, index = 0 }) {
  const t = useTheme();
  const phone = Platform.OS !== 'web';
  // Compact tiles: the number beside its label, so all of them fit on a row or two instead of filling the screen.
  return (
    <FadeInUp delay={index * 60} style={{ flexGrow: 1, flexBasis: phone ? 150 : 170, minWidth: phone ? 140 : 150 }}>
      <Card onPress={onPress} style={{ paddingVertical: 10, paddingHorizontal: 14, transitionProperty: 'transform, box-shadow', transitionDuration: '180ms' }}>
        <Row gap={12}>
          <AnimatedNumber value={value} style={{ color: color || t.text, fontFamily: display(), fontWeight: '600', fontSize: t.fs(26), letterSpacing: -0.5, minWidth: 30 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={phone ? 2 : 1} style={{ color: t.text, fontWeight: '700', fontSize: t.fs(12.5) }}>{label}</Text>
            {!!sub && <Small numberOfLines={1}>{sub}</Small>}
          </View>
        </Row>
      </Card>
    </FadeInUp>
  );
}

export const PRIORITY_COLOR = { High: 'danger', Medium: 'warn', Low: 'ok' };

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
        {!!icon && (ICON_NAMES.includes(icon) ? <Icon name={icon} size={17} color={solid ? t.onAccent : c} stroke={2} /> : <Text style={{ color: solid ? t.onAccent : c, fontWeight: '800', fontSize: t.fs(15) }}>{icon}</Text>)}
        {!!label && <Text style={{ color: solid ? t.onAccent : c, fontWeight: '700', fontSize: t.fs(13) }}>{label}</Text>}
      </Pressable>
    </Animated.View>
  );
}

/*
 * web.app: Register, Completed and Bin show two cards a row from tablet width up; a phone browser shows one card a
 * row, like the APK ("device compatible"). Lists in the grid show whole rows of two.
 */
export const GRID = Platform.OS === 'web';
export const SEARCH_PLACEHOLDER = 'Search tasks';
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
                <RoundBtn icon={ring ? 'bell' : 'bellOff'} a11y={ring ? 'Rings as an alarm - tap for a plain reminder' : 'Plain reminder - tap to ring as an alarm'} color={ring ? t.warn : t.textDim} onPress={onToggleAlert} />
              )}
              {Platform.OS === 'web' && <RoundBtn icon="edit" a11y="Edit" onPress={onPress} />}
              {!inDone && !!onFollowUp && <RoundBtn icon="phone" a11y="Bank follow-up: banker's update and the next follow-up date" color={t.accent} onPress={onFollowUp} />}
              {WEB_DAR && !inDone
                ? <RoundBtn label="DAR" a11y="Complete, and add to the daily report" color={t.ok} onPress={() => onAct('complete', { dar: true })} />
                : <RoundBtn label="DAR" icon={entry.dar !== false ? 'check' : ''} a11y={entry.dar !== false ? 'In the daily report - tap for "Done" only' : 'Add to the daily report'} color={t.ok} solid={entry.dar !== false} onPress={onToggleDar} />}
              {inDone &&  <RoundBtn icon="trash" a11y="Move to Bin" color={t.danger} onPress={() => onAct('bin')} />}
              {inDone
                ?  <RoundBtn icon="undo" a11y="Reopen" color={t.accent} onPress={() => onAct('reopen')} />
                : <RoundBtn icon="check" a11y={WEB_DAR ? 'Complete - not in the daily report' : 'Complete'} color={t.ok} onPress={() => onAct('complete', WEB_DAR ? { dar: false } : undefined)} />}
            </Row>
          </View>
        </Row>
      </View>
    </Pressable>
  );
  // No swipe gestures: complete and bin only with the buttons, so a scroll or tab swipe can never change an entry.
  return row;
}

/** iOS-style "Completed · Undo" bar above the tab bar; disappears after a few seconds. */
export function UndoBar({ undo, onUndo, onHide, bottom, left = 20 }) {
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
    <Animated.View style={{ opacity: rise, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) }], position: 'absolute', left, right: 20, bottom, flexDirection: 'row', alignItems: 'center', backgroundColor: t.primaryDark, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 16, elevation: 14, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 4 } }}>
      <Text style={{ color: '#fff', flex: 1, fontSize: t.fs(14), fontWeight: '600' }} numberOfLines={2}>{undo.message}</Text>
      <Pressable onPress={onUndo} hitSlop={10} accessibilityRole="button" accessibilityLabel="Undo">
        <Text style={{ color: t.mint, fontWeight: '800', fontSize: t.fs(15), marginLeft: 14 }}>Undo</Text>
      </Pressable>
    </Animated.View>
  );
}

export function ShowMore({ total, visibleCount, onPress }) {
  const t = useTheme();
  return Platform.OS !== 'web' && total > visibleCount ? (
    <Pressable onPress={onPress} style={{ paddingVertical: 14, alignItems: 'center' }}>
      <Text style={{ color: t.primary, fontWeight: '800' }}>Show more ({total - visibleCount} left)</Text>
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
 * The phone's own pieces (Ledger): the app bar, the stat tiles, the task cards and the + button.
 */

/** The initial of the signed-in name (or the first letter given). */
const initialOf = (name) => String(name || '?').trim().charAt(0).toUpperCase() || '?';

/** The 44px white rounded square used for the app bar's actions (search, meeting-mode bell, refresh). */
export function CircleBtn({ icon, label, onPress, active, primary }) {
  const t = useTheme();
  if (primary) return <GradIcon name={icon} colors={t.grad.brand} size={44} radius={15} iconSize={21} />;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [{ width: 44, height: 44, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: active ? t.warnTint : t.surface, borderWidth: active ? 1 : t.dark ? 1 : 0, borderColor: active ? t.amber : t.border, opacity: pressed ? 0.8 : 1 }, t.lift]}>
      <Icon name={icon} size={21} color={active ? t.warnText : t.text} stroke={2} />
    </Pressable>
  );
}

/**
 * The phone's app bar ("Gradient bento"). Home: the gradient initial, "Good morning" over the signed-in name, then the
 * refresh / search / meeting-mode squares. Other screens: a back square (pages opened from More), the big bold title with a
 * muted line under it, and the same squares at the right.
 */
export function PhoneHeader({ title, subtitle, userLabel, onSearch, onBell, bellOn, onUser, onBack, onRefresh, refreshing, onNew, greeting }) {
  const t = useTheme();
  const actions = (
    <Row gap={8} style={{ alignItems: 'center' }}>
      {/* A page opened from More keeps only search (and the bell while meeting mode is on), so its title has room. */}
      {!!onRefresh && !onBack && <CircleBtn icon="refresh" label={refreshing ? 'Refreshing' : 'Refresh'} onPress={refreshing ? undefined : onRefresh} />}
      <CircleBtn icon="search" label="Search" onPress={onSearch} />
      {(!onBack || bellOn) && <CircleBtn icon={bellOn ? 'bellOff' : 'bell'} label={bellOn ? 'Meeting mode is on' : 'Meeting mode'} onPress={onBell} active={bellOn} />}
      {!!onNew && <Pressable onPress={onNew} accessibilityRole="button" accessibilityLabel="New entry"><CircleBtn icon="plus" label="New entry" primary /></Pressable>}
    </Row>
  );
  if (greeting) {
    return (
      <Row gap={12} style={{ alignItems: 'center', marginBottom: 16 }}>
        <GradBox colors={t.grad.pink.concat(t.grad.violet.slice(1))} radius={16} onPress={onUser} accessibilityLabel={`Signed in as ${userLabel}`} style={{ width: 48, height: 48 }} contentStyle={{ alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: t.onTile, fontWeight: '800', fontSize: t.fs(19) }}>{initialOf(userLabel)}</Text>
        </GradBox>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: t.textDim, fontWeight: '700', fontSize: t.fs(13) }}>{greeting}</Text>
          <Text numberOfLines={1} accessibilityRole="header" style={{ color: t.text, fontWeight: '800', fontSize: t.fs(20), letterSpacing: -0.3 }}>{userLabel}</Text>
        </View>
        {actions}
      </Row>
    );
  }
  return (
    <View style={{ marginBottom: 14 }}>
      <Row gap={10} style={{ alignItems: 'center' }}>
        {onBack ? <CircleBtn icon="back" label="Back to More" onPress={onBack} /> : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} accessibilityRole="header" style={{ color: t.text, fontWeight: '800', fontSize: t.fs(onBack ? 24 : 30), letterSpacing: -0.7 }}>{title}</Text>
          {!!subtitle && <Text numberOfLines={1} style={{ color: t.textDim, fontWeight: '600', fontSize: t.fs(13), marginTop: 2 }}>{subtitle}</Text>}
        </View>
        {actions}
      </Row>
    </View>
  );
}

/** The + button: 56px, the violet-pink gradient with a soft coloured lift. */
export function Fab({ onPress, bottom, right = 20, label = 'New entry' }) {
  const t = useTheme();
  return (
    <GradBox colors={t.grad.brand} radius={20} onPress={onPress} accessibilityLabel={label} style={[{ position: 'absolute', right, bottom, width: 56, height: 56 }, t.fabShadow]} contentStyle={{ alignItems: 'center', justifyContent: 'center' }} glow={false}>
      <View><Icon name="plus" size={26} color={t.onTile} stroke={2.6} /></View>
    </GradBox>
  );
}

/** A section heading with an optional link at the right ("Needs attention" - "See all"). */
export function SectionHead({ title, action, onAction, style }) {
  const t = useTheme();
  return (
    <Row style={[{ justifyContent: 'space-between', alignItems: 'baseline', marginTop: 4, marginBottom: 10, paddingHorizontal: 4 }, style]}>
      <Text accessibilityRole="header" style={{ color: t.text, fontWeight: '800', fontSize: t.fs(18), letterSpacing: -0.2 }}>{title}</Text>
      {!!action && <Pressable onPress={onAction} hitSlop={8} accessibilityRole="button"><Text style={{ color: t.primary, fontWeight: '700', fontSize: t.fs(14) }}>{action}</Text></Pressable>}
    </Row>
  );
}

/**
 * A count tile. With a `tone` ('red' | 'orange' | 'blue' | 'green' | 'violet'; 'amber' and 'slate' are the older names) it is a
 * gradient tile - white number and label, an icon square at the top right; without one it is a white card ("More counts").
 */
const KPI = { red: ['red', 'alert'], amber: ['orange', 'clock'], orange: ['orange', 'clock'], slate: ['blue', 'calendar'], blue: ['blue', 'calendar'], green: ['green', 'done'], violet: ['violet', 'tasks'] };
export function PhoneKpi({ label, value, tone, onPress, wide, icon }) {
  const t = useTheme();
  const k = KPI[tone];
  if (k) {
    return (
      <GradBox colors={t.grad[k[0]]} radius={24} onPress={onPress} accessibilityLabel={`${label}: ${value}`} style={{ flex: 1 }} contentStyle={{ paddingVertical: 14, paddingHorizontal: 15, minHeight: 104 }}>
        <View style={{ position: 'absolute', right: 12, top: 12, width: 36, height: 36, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.24)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon || k[1]} size={19} color={t.onTile} stroke={2.3} />
        </View>
        <Text style={{ color: t.onTile, fontWeight: '800', fontSize: t.fs(34), letterSpacing: -1, marginTop: 6 }}>{value}</Text>
        <Text style={{ color: t.onTile, fontWeight: '700', fontSize: t.fs(14) }} numberOfLines={1}>{label}</Text>
      </GradBox>
    );
  }
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => [{ width: wide ? '31.5%' : undefined, flex: wide ? undefined : 1, borderRadius: 18, paddingVertical: 12, paddingHorizontal: 14, gap: 2, backgroundColor: t.surface, borderWidth: t.dark ? 1 : 0, borderColor: t.border, opacity: pressed ? 0.85 : 1 }, t.lift]}>
      <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(24), letterSpacing: -0.5 }}>{value}</Text>
      <Text style={{ color: t.textDim, fontWeight: '700', fontSize: t.fs(11.5) }} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

/** "Today 6:00 PM", "Yesterday 11:00 AM", "Tomorrow", "21 Oct 4:30 PM". */
export const relativeDue = (due) => {
  const now = new Date();
  const day0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round((day0(due) - day0(now)) / 86400000);
  const name = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : due.toLocaleDateString([], { day: 'numeric', month: 'short' });
  return isMidnight(due) ? name : `${name} ${due.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
};

/** The small priority badge at the right of a task row (High red, Medium amber, Low green). */
function PrioBadge({ priority }) {
  const t = useTheme();
  if (!priority) return null;
  const [bg, fg] = { High: [t.dangerTint, t.dangerText], Medium: [t.warnTint, t.warnText], Low: [t.okTint, t.okText] }[priority] || [t.tint, t.tintText];
  return <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9, backgroundColor: bg }}><Text style={{ color: fg, fontWeight: '800', fontSize: t.fs(11.5) }}>{priority}</Text></View>;
}

/**
 * A task ("Gradient bento"): a white card - the category's gradient icon, the title, the due text (red when late) and the
 * person, the priority badge at the right, and the Done / DAR buttons under it.
 */
export function PhoneRow({ entry, onPress, onDone, onDar, onFollowUp }) {
  const t = useTheme();
  const due = entry.dueAt ? new Date(entry.dueAt) : null;
  const overdue = isOverdue(entry);
  const late = overdue && due ? daysLate(due) : 0;
  const dueText = due ? (late >= 1 ? `Overdue ${late} day${late === 1 ? '' : 's'}` : relativeDue(due)) : 'No date';
  const facts = [entry.pendingWith, entry.category, entry.recurrence && entry.recurrence !== 'none' ? `↻ ${recurrenceLabel(entry)}` : '', checklistText(entry) ? `☑ ${checklistText(entry)}` : ''].filter(Boolean).join(' · ');
  return (
    <View style={[{ marginBottom: 10, borderRadius: 22, backgroundColor: t.surface, borderWidth: t.dark ? 1 : 0, borderColor: t.border, paddingVertical: 12, paddingHorizontal: 12, gap: 10 }, t.lift]}>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={entry.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <CatIcon category={entry.category} size={44} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(15), lineHeight: t.fs(20) }} numberOfLines={2}>{entry.title}</Text>
          <Text style={{ color: t.textDim, fontWeight: '600', fontSize: t.fs(12.5) }} numberOfLines={1}><Text style={{ color: overdue ? t.danger : t.textDim, fontWeight: '800' }}>{dueText}</Text>{facts ? ` · ${facts}` : ''}</Text>
        </View>
        <PrioBadge priority={entry.priority} />
      </Pressable>
      {(!!onDone || !!onFollowUp) && (
        <Row gap={8} style={{ paddingLeft: 56 }}>
          {!!onDone && (
            <GradBox colors={t.grad.green} radius={12} onPress={onDone} accessibilityLabel="Complete, keep out of the daily report" glow={false} style={{ flex: 1 }} contentStyle={{ flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center', paddingVertical: 9 }}>
              <View><Icon name="check" size={15} color={t.onTile} stroke={3} /></View><Text style={{ color: t.onTile, fontWeight: '800', fontSize: t.fs(13.5) }}>Done</Text>
            </GradBox>
          )}
          {!!onDone && !!onDar && (
            <Pressable onPress={onDar} accessibilityRole="button" accessibilityLabel="Complete, and add to the daily report" style={({ pressed }) => ({ flex: 1, paddingVertical: 9, borderRadius: 12, alignItems: 'center', backgroundColor: t.tint, opacity: pressed ? 0.85 : 1 })}>
              <Text style={{ color: t.tintText, fontWeight: '800', fontSize: t.fs(13.5) }}>DAR</Text>
            </Pressable>
          )}
          {!!onFollowUp && (
            <Pressable onPress={onFollowUp} hitSlop={8} accessibilityRole="button" accessibilityLabel="Bank follow-up" style={{ width: 40, borderRadius: 12, backgroundColor: t.slateTint, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="phone" size={17} color={t.slateText} stroke={2} />
            </Pressable>
          )}
        </Row>
      )}
    </View>
  );
}

/** A finished task: the category's icon, the title, when it was completed, a Done / DAR badge and Reopen. */
export function PhoneDoneRow({ entry, onPress, onReopen }) {
  const t = useTheme();
  const ms = completedTime(entry);
  const time = ms ? new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '';
  const facts = [time ? `Done ${time}` : 'Done', entry.pendingWith || entry.category].filter(Boolean).join(' · ');
  const dar = entry.dar !== false;
  return (
    <View style={[{ marginBottom: 10, borderRadius: 22, backgroundColor: t.surface, borderWidth: t.dark ? 1 : 0, borderColor: t.border, paddingVertical: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 12 }, t.lift]}>
      <CatIcon category={entry.category} size={42} />
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={entry.title} style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={{ color: t.text, fontWeight: '700', fontSize: t.fs(14.5), lineHeight: t.fs(19) }} numberOfLines={2}>{entry.title}</Text>
        <Text style={{ color: t.textDim, fontWeight: '600', fontSize: t.fs(12.5) }} numberOfLines={1}>{facts}</Text>
      </Pressable>
      <View style={{ alignItems: 'flex-end', gap: 6 }}>
        <View style={{ paddingHorizontal: 9, paddingVertical: 4, borderRadius: 9, backgroundColor: dar ? t.tint : t.okTint }}><Text style={{ color: dar ? t.tintText : t.okText, fontWeight: '800', fontSize: t.fs(11.5) }}>{dar ? 'DAR' : 'Done'}</Text></View>
        <Pressable onPress={onReopen} accessibilityRole="button" accessibilityLabel="Reopen" hitSlop={6}>
          <Text style={{ color: t.primary, fontWeight: '800', fontSize: t.fs(12.5) }}>Reopen</Text>
        </Pressable>
      </View>
    </View>
  );
}
