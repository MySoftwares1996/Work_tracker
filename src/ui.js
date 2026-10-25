import React from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, Modal, StyleSheet, Platform,
  Alert, Keyboard, useWindowDimensions, Animated, PanResponder, Easing, AccessibilityInfo, RefreshControl, LayoutAnimation, UIManager,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import TabIcon from './tabIcons';
import { SIDE_BAR_WIDTH, CONTENT_MAX_WIDTH, layoutFor } from './layout';
import { useTheme, opaque, withAlpha } from './theme';
import { warnQuiet } from './quietCatch';
import Icon, { ICON_NAMES } from './icons';
import { ff, display } from './fonts';

/**
 * @param headerless  true only for screens with the navigation header hidden.
 *
 * A screen under a header must NOT add the top safe-area inset: the header
 * already sits below the status bar. Adding it again left a blank band the
 * height of the status bar between the header and the content on every
 * screen that has a title bar.
 */
/** Room left at the foot of a screen for the floating bottom tab bar, so the last card is never under it. */
export const BOTTOM_BAR_SPACE = 96;

/** The current window's layout (see layout.js): re-renders when the window is resized or rotated. */
export function useLayout() {
  const { width } = useWindowDimensions();
  return layoutFor(width);
}

/** The spring every pressable thing uses (iOS / macOS feel): { scale } to put in a transform, and the press handlers. */
export function usePressSpring(to = 0.96) {
  const v = React.useRef(new Animated.Value(1)).current;
  const go = (x) => { if (reduceMotionCache) return; Animated.spring(v, { toValue: x, useNativeDriver: true, speed: 40, bounciness: x === 1 ? 10 : 0 }).start(); };
  return { scale: v, onPressIn: () => go(to), onPressOut: () => go(1) };
}

/**
 * The floating tab bar at the foot of a tool (Working Dashboard's design, shared by every tool with tabs).
 * tabs: [{ key, label, icon }] - icon is a tabIcons.js name. badges: { [key]: number }.
 */
export function BottomTabs({ tabs, value, onChange, badges = {} }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { wide } = useLayout();
  if (wide) return <SideTabs tabs={tabs} value={value} onChange={onChange} badges={badges} />;
  // A phone (the APK, or a phone-width screen) with a short list of tabs: the app-style bar - edge to edge, the chosen tab in a soft pill.
  if (tabs.length <= 5) return <PhoneBar tabs={tabs} value={value} onChange={onChange} badges={badges} />;
  // APK with many tabs: the side bar turned sideways - a bar with the selected tab in an accent pill that glides.
  if (Platform.OS !== 'web') return <AppTabs tabs={tabs} value={value} onChange={onChange} badges={badges} />;
  // The website opened on a phone: iOS-style tab bar, edge to edge, the selected tab in the accent colour.
  return (
    <View
      accessibilityRole="tablist"
      style={[{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        flexDirection: 'row', backgroundColor: t.bar, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 6), paddingHorizontal: 4,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.hairline,
      }]}
    >
      {tabs.map((x) => <PhoneTab key={x.key} x={x} on={value === x.key} badge={badges[x.key]} onChange={onChange} crowded={tabs.length > 6} />)}
    </View>
  );
}

/** The phone-bar icon for each tab key (the Ledger line icons). */
const PHONE_ICON = { dashboard: 'home', register: 'tasks', report: 'report', done: 'done', more: 'more' };

/**
 * The phone's own tab bar (Ledger): white, a line on top, five tabs at most. The chosen tab's icon sits in a 58x30 pill of the
 * primary tint and takes the primary colour; labels are 11px 700.
 */
function PhoneBar({ tabs, value, onChange, badges }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View accessibilityRole="tablist" style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: t.surface, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 12) + 4, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: t.border }]}>
      {tabs.map((x) => {
        const on = value === x.key;
        const badge = badges[x.key];
        const iconName = PHONE_ICON[x.key];
        return (
          <Pressable key={x.key} onPress={() => onChange(x.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${x.label}${badge ? `, ${badge}` : ''}`} style={{ flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 4, gap: 3 }}>
            <View style={{ width: 58, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.tint : 'transparent' }}>
              {iconName ? <Icon name={iconName} size={23} color={on ? t.primary : t.textDim} /> : <TabIcon name={x.icon || x.key} color={on ? t.primary : t.textDim} active={on} size={23} />}
            </View>
            <Text style={{ fontSize: 11, fontWeight: '700', color: on ? t.primary : t.textDim }} numberOfLines={1}>{x.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** APK tab bar in the website's style: rounded bar, one accent pill that slides to the chosen tab. */
function AppTabs({ tabs, value, onChange, badges }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [w, setW] = React.useState(0);
  const n = Math.max(tabs.length, 1);
  const index = Math.max(0, tabs.findIndex((x) => x.key === value));
  const slide = React.useRef(new Animated.Value(0)).current;
  const tabW = w ? (w - 8) / n : 0;
  React.useEffect(() => {
    if (!tabW) return;
    if (reduceMotionCache) { slide.setValue(index * tabW); return; }
    Animated.spring(slide, { toValue: index * tabW, useNativeDriver: true, speed: 18, bounciness: 7 }).start();
  }, [index, tabW]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ position: 'absolute', left: 10, right: 10, bottom: Math.max(insets.bottom, 8) + 2 }}>
      <View accessibilityRole="tablist" onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={{ flexDirection: 'row', backgroundColor: t.bar, borderRadius: 16, padding: 4, ...t.shadow, borderWidth: StyleSheet.hairlineWidth, borderColor: t.border }}>
        {!!tabW && <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 4, top: 4, bottom: 4, width: tabW, borderRadius: 12, backgroundColor: t.accent, transform: [{ translateX: slide }] }} />}
        {tabs.map((x) => {
          const on = value === x.key;
          const badge = badges[x.key];
          return (
            <Pressable key={x.key} onPress={() => onChange(x.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${x.label}${badge ? `, ${badge}` : ''}`}
              style={{ flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 6 }}>
              <View>
                <TabIcon name={x.icon || x.key} color={on ? t.onAccent : t.accent} active={on} size={20} />
                {!!badge && (
                  <View style={{ position: 'absolute', top: -5, left: 12, minWidth: 15, height: 15, borderRadius: 8, paddingHorizontal: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: x.key === 'bin' ? t.danger : on ? '#fff' : t.accent }}>
                    <Text style={{ color: x.key !== 'bin' && on ? t.accent : '#fff', fontSize: 9, fontWeight: '800' }}>{badge > 99 ? '99+' : badge}</Text>
                  </View>
                )}
              </View>
              <Text style={{ marginTop: 2, fontSize: 9.5, fontWeight: on ? '700' : '500', color: on ? '#fff' : t.text, maxWidth: '100%' }} numberOfLines={1}>{x.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function PhoneTab({ x, on, badge, onChange, crowded }) {
  const t = useTheme();
  const press = usePressSpring(0.9);
  const pop = React.useRef(new Animated.Value(1)).current;
  React.useEffect(() => {
    if (!on || reduceMotionCache) return;
    pop.setValue(0.82);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 14, bounciness: 14 }).start();
  }, [on]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Pressable onPress={() => onChange(x.key)} onPressIn={press.onPressIn} onPressOut={press.onPressOut} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${x.label}${badge ? `, ${badge}` : ''}`}
      style={{ flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 2 }}>
      <Animated.View style={{ alignItems: 'center', maxWidth: '100%', transform: [{ scale: press.scale }] }}>
        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <TabIcon name={x.icon || x.key} color={on ? t.accent : t.textDim} active={on} size={24} />
          {!!badge && (
            <View style={{ position: 'absolute', top: -4, left: 14, minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: x.key === 'bin' ? t.danger : t.accent }}>
              <Text style={{ color: '#fff', fontSize: 9.5, fontWeight: '700' }}>{badge > 99 ? '99+' : badge}</Text>
            </View>
          )}
        </Animated.View>
        <Text style={{ marginTop: 2, fontSize: crowded ? 8.5 : 10, fontWeight: on ? '600' : '500', color: on ? t.accent : t.textDim, maxWidth: '100%' }} numberOfLines={1} ellipsizeMode="tail">{x.label}</Text>
      </Animated.View>
    </Pressable>
  );
}

/** BottomTabs on a wide screen: the same tabs and badges, down the left edge. */
const SIDE_ROW = 34;
const SIDE_GAP = 2;
function SideTabs({ tabs, value, onChange, badges }) {
  const t = useTheme();
  const index = Math.max(0, tabs.findIndex((x) => x.key === value));
  const slide = React.useRef(new Animated.Value(index * (SIDE_ROW + SIDE_GAP))).current;
  React.useEffect(() => {
    const to = index * (SIDE_ROW + SIDE_GAP);
    if (reduceMotionCache) { slide.setValue(to); return; }
    Animated.spring(slide, { toValue: to, useNativeDriver: true, speed: 18, bounciness: 7 }).start();
  }, [index]); // eslint-disable-line react-hooks/exhaustive-deps
  // The wide-screen side bar: a line on its edge, small rounded rows; the selected row takes the accent colour.
  return (
    <View
      accessibilityRole="tablist"
      style={[{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: SIDE_BAR_WIDTH,
        backgroundColor: t.bar, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: t.sideEdge,
        paddingTop: 18, paddingBottom: 14, paddingHorizontal: 10,
      }]}
    >
      <Text style={{ color: t.textDim, fontWeight: '700', fontSize: t.fs(11), letterSpacing: 0.4, marginLeft: 10, marginBottom: 6 }}>WORKING DASHBOARD</Text>
      <View style={{ gap: SIDE_GAP }}>
        {/* The selection pill glides to the chosen row (a spring), instead of jumping. */}
        <Animated.View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, height: SIDE_ROW, borderRadius: 8, backgroundColor: t.accent, transform: [{ translateY: slide }] }} />
        {tabs.map((x) => {
          const on = value === x.key;
          const badge = badges[x.key];
          return (
            <Pressable key={x.key} onPress={() => onChange(x.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${x.label}${badge ? `, ${badge}` : ''}`}
              style={({ hovered }) => ({
                height: SIDE_ROW, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, borderRadius: 8,
                backgroundColor: !on && hovered ? (t.dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)') : 'transparent',
              })}>
              <TabIcon name={x.icon || x.key} color={on ? t.onAccent : t.accent} active={on} size={18} />
              <Text style={{ flex: 1, fontSize: t.fs(13.5), fontWeight: on ? '600' : '500', color: on ? '#fff' : t.text }} numberOfLines={1}>{x.label}</Text>
              {!!badge && (
                <Text style={{ color: on ? 'rgba(255,255,255,0.85)' : x.key === 'bin' ? t.danger : t.textDim, fontSize: t.fs(12), fontWeight: '600' }}>{badge > 999 ? '999+' : badge}</Text>
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Where a floating action button sits on a screen with the bottom tab bar: just above it (no bar on a wide screen). */
export function useAboveBottomBar() {
  const insets = useSafeAreaInsets();
  const { wide } = useLayout();
  return wide ? 24 : Math.max(insets.bottom, 12) + 4 + 66;
}

/** Glass: soft blue, lilac and pink glows behind the page (no native gradient library needed), so the frosted cards have something to frost. */
function GlassBackdrop() {
  const t = useTheme();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={{ position: 'absolute', top: -140, left: -120, width: 420, height: 420, borderRadius: 210, backgroundColor: t.glow[0], opacity: 0.55 }} />
      <View style={{ position: 'absolute', top: 160, right: -160, width: 420, height: 420, borderRadius: 210, backgroundColor: t.glow[1], opacity: 0.5 }} />
      <View style={{ position: 'absolute', bottom: -160, left: -60, width: 460, height: 460, borderRadius: 230, backgroundColor: t.glow[2], opacity: 0.5 }} />
    </View>
  );
}

export function Screen({ children, scroll = true, padded = true, headerless = false, bottomBar = false, onRefresh }) {
  const t = useTheme();
  // Pull down to refresh (phone): the spinner shows while onRefresh runs, and at least a moment so it reads as done.
  const [refreshing, setRefreshing] = React.useState(false);
  const pull = onRefresh ? async () => { setRefreshing(true); try { await Promise.all([onRefresh(), new Promise((r) => setTimeout(r, 700))]); } catch { /* the screen shows its own errors */ } setRefreshing(false); } : null;
  const Body = scroll ? ScrollView : View;
  const edges = headerless ? ['top', 'left', 'right'] : ['left', 'right'];
  const { wide, tablet } = useLayout();
  const sides = padded ? (wide ? 28 : 20) : 0;
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={edges}>
      {t.glass && <GlassBackdrop />}
      <Body
        style={{ flex: 1 }}
        contentContainerStyle={scroll ? [
          { paddingHorizontal: sides, paddingTop: padded ? (headerless ? 12 : wide ? 20 : 8) : 0, paddingBottom: bottomBar && !wide ? 48 + BOTTOM_BAR_SPACE : 48 },
          tablet && { width: '100%', maxWidth: CONTENT_MAX_WIDTH + sides * 2, alignSelf: 'center' },
        ] : undefined}
        keyboardShouldPersistTaps="handled"
        {...(scroll && pull ? { refreshControl: <RefreshControl refreshing={refreshing} onRefresh={pull} tintColor={t.accent} colors={[t.accent]} progressBackgroundColor={t.surface} /> } : null)}
      >
        {children}
      </Body>
    </SafeAreaView>
  );
}

/** A friendly empty screen: a round tinted icon, a serif title, one line of help and (optionally) the one action that fills it. */
export function EmptyState({ icon = 'done', title, text, action, onAction }) {
  const t = useTheme();
  return (
    <View accessibilityRole="summary" style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24, gap: 10 }}>
      <View style={{ width: 96, height: 96, borderRadius: 48, backgroundColor: t.tint, alignItems: 'center', justifyContent: 'center' }}>
        {ICON_NAMES.includes(icon) ? <Icon name={icon} size={44} color={t.primary} stroke={2} /> : <Text style={{ fontSize: t.fs(40) }}>{icon}</Text>}
      </View>
      <Text style={{ color: t.text, fontFamily: display(), fontWeight: '600', fontSize: t.fs(28), letterSpacing: -0.5, textAlign: 'center', marginTop: 6 }}>{title}</Text>
      {!!text && <Text style={{ color: t.textDim, fontSize: t.fs(15), lineHeight: t.fs(22), textAlign: 'center', fontWeight: '500' }}>{text}</Text>}
      {!!action && <Btn style={{ marginTop: 10, alignSelf: 'center', paddingHorizontal: 26 }} title={action} onPress={onAction} />}
    </View>
  );
}

export function Card({ children, style, onPress, tone }) {
  const t = useTheme();
  // Flat white card with a 1px line (Ledger). A translucent background is flattened to opaque.
  const flat = StyleSheet.flatten(style) || {};
  const fixedStyle = flat.backgroundColor ? [style, { backgroundColor: opaque(flat.backgroundColor, t.surface) }] : style;
  style = fixedStyle;
  const base = {
    backgroundColor: tone ? opaque(tone, t.surface) : t.cardFill,      // Glass: frosted, translucent over its backdrop
    borderRadius: t.radius,
    borderWidth: 1,
    borderColor: t.cardEdge,
    padding: 16,
    ...t.shadow,
  };
  if (onPress) {
    return (
      <Pressable onPress={onPress} style={({ pressed, hovered }) => [base, style, hovered && Platform.OS === 'web' && { transform: [{ translateY: -1 }] }, pressed && { transform: [{ scale: 0.985 }], opacity: 0.94 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

export function P({ children, dim, style, numberOfLines }) {
  const t = useTheme();
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontSize: t.fs(14), color: dim ? t.textDim : t.text, lineHeight: t.fs(20) }, style]}>
      {children}
    </Text>
  );
}
export function Small({ children, style, numberOfLines }) {
  const t = useTheme();
  return <Text numberOfLines={numberOfLines} style={[{ fontSize: t.fs(11.5), color: t.textDim }, style]}>{children}</Text>;
}

/** The small spaced caps label above a field (11px 800, muted). */
export function Label({ children, style, numberOfLines, dense }) {
  const t = useTheme();
  return <Text numberOfLines={numberOfLines} style={[{ fontSize: t.fs(dense ? 10 : 11), fontWeight: '800', letterSpacing: dense ? 0.4 : 0.8, color: t.textDim, textTransform: 'uppercase', marginBottom: 6 }, style]}>{children}</Text>;
}

export function Btn({ title, onPress, kind = 'primary', style, disabled, icon }) {
  const t = useTheme();
  const map = {
    primary: { bg: t.primary, fg: t.onAccent },
    ghost: { bg: 'transparent', fg: t.primary, border: t.primary },
    soft: { bg: t.tint, fg: t.tintText },
    neutral: { bg: t.surfaceAlt, fg: t.text },
    danger: { bg: t.danger, fg: t.dark ? t.bg : '#fff' },
    ok: { bg: t.primary, fg: t.onAccent },
  }[kind];
  const press = usePressSpring(0.97);
  const web = Platform.OS === 'web';
  return (
    <Pressable
      onPress={onPress}
      onPressIn={press.onPressIn}
      onPressOut={press.onPressOut}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [{
        backgroundColor: map.bg,
        borderColor: map.border || 'transparent',
        borderWidth: map.border ? 1.5 : 0,
        paddingVertical: web ? 10 : 13,
        paddingHorizontal: 16,
        borderRadius: t.btnRadius,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.45 : pressed ? 0.85 : 1,
      }, style]}
    >
      <Animated.View style={{ transform: [{ scale: press.scale }], maxWidth: '100%' }}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={{ color: map.fg, fontWeight: '800', fontSize: t.fs(web ? 14 : 15), textAlign: 'center', flexShrink: 1 }}
        >
          {icon ? icon + '  ' : ''}{title}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

/**
 * Extra props (secureTextEntry, autoCapitalize, autoCorrect, maxLength...) are
 * forwarded to the TextInput. They used to be dropped silently, so the backup
 * passphrase field showed the passphrase in plain text.
 */
export function Field({ label, value, onChangeText, placeholder, keyboardType, multiline, compact, style, onFocus, onBlur, ...inputProps }) {
  const t = useTheme();
  /*
   * Number fields keep their own text while focused. Callers store
   * Number(v) || default, so clearing the field used to snap straight back
   * to the default - you could not delete "150" to type "80". Now the field
   * shows what you type and settles to the stored value when you leave it.
   */
  const numeric = keyboardType === 'numeric' || keyboardType === 'decimal-pad' || keyboardType === 'number-pad';
  const [editing, setEditing] = React.useState(null);
  const [focused, setFocused] = React.useState(false);
  const shown = numeric && editing != null ? editing : (value == null ? '' : String(value));
  const handleChange = (v) => { if (numeric) setEditing(v); onChangeText?.(v); };
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      {!!label && <Label>{label}</Label>}
      <TextInput
        value={shown}
        onChangeText={handleChange}
        onFocus={(e) => { setFocused(true); if (numeric) setEditing(value == null ? '' : String(value)); onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); if (numeric) setEditing(null); onBlur?.(e); }}
        placeholder={placeholder}
        placeholderTextColor={t.textDim}
        keyboardType={keyboardType}
        multiline={multiline}
        numberOfLines={compact ? 1 : undefined}
        {...inputProps}
        style={{
          backgroundColor: t.surface,
          borderWidth: 1,
          borderColor: focused ? t.primary : t.fieldBorder,
          borderRadius: t.fieldRadius,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : Platform.OS === 'ios' ? 13 : 10,
          color: t.text,
          fontFamily: ff(600),
          fontSize: t.fs(14.5),
          // `compact`: one line to start with, growing as lines are added (Task description, Notes).
          minHeight: multiline ? (compact ? 62 : 90) : 46,
          textAlignVertical: multiline && !compact ? 'top' : 'center',
          // The macOS focus ring on the website: a soft halo in the accent colour.
          ...(Platform.OS === 'web' && focused ? { boxShadow: `0 0 0 3px ${t.accent}40` } : null),
        }}
      />
    </View>
  );
}

/** An on / off switch (Config): a 46x28 track, primary when on, with a white knob. */
export function Toggle({ value, onChange, label }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: !!value }} accessibilityLabel={label} hitSlop={8}
      style={{ width: 46, height: 28, borderRadius: 14, backgroundColor: value ? t.primary : t.fieldBorder, justifyContent: 'center' }}>
      <View style={{ position: 'absolute', top: 3, left: value ? 21 : 3, width: 22, height: 22, borderRadius: 11, backgroundColor: value ? t.onAccent : '#fff' }} />
    </Pressable>
  );
}

/** The search box: a white field with a line, the search icon at the left and a clear button when something is typed. */
export function SearchField({ value, onChangeText, placeholder, style, onSubmitEditing, height = 48 }) {
  const t = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, paddingHorizontal: 14, height }, style]}>
      <Icon name="search" size={20} color={t.textDim} stroke={1.9} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.textDim}
        returnKeyType="search"
        onSubmitEditing={onSubmitEditing}
        accessibilityLabel={placeholder}
        style={{ flex: 1, color: t.text, fontFamily: ff(600), fontSize: t.fs(14), paddingVertical: 0, ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null) }}
      />
      {!!value && (
        <Pressable onPress={() => onChangeText('')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Clear search">
          <Icon name="close" size={16} color={t.textDim} stroke={2.2} />
        </Pressable>
      )}
    </View>
  );
}

/** Height of the on-screen keyboard, 0 when hidden. */
function useKeyboardHeight() {
  const [h, setH] = React.useState(0);
  React.useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', (e) => setH(e?.endCoordinates?.height || 0));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setH(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  return h;
}

/**
 * Every popup in the app. Opens as a dialog in the MIDDLE of the screen.
 *
 * Sized in real pixels from the window, not percentages: the old sheet used
 * maxHeight: '85%' of a parent with no height, which resolved against nothing
 * and clipped lists after two or three rows. When the keyboard opens the
 * dialog moves up and shrinks to the space left above it, so a search or
 * name field is never hidden. Tapping outside closes it.
 *
 * `full` keeps a full-screen page for long content (category drill-down).
 */
/**
 * `dismissable = false` locks the sheet: no X button, the backdrop no longer
 * closes it, and the Android back button is swallowed.
 */
export function Sheet({ visible, onClose, title, children, full, dismissable = true, fillDesktop = false, footer = null, bigTitle = false }) {
  const t = useTheme();
  const { height } = useWindowDimensions();
  const kb = useKeyboardHeight();
  const margin = 20;
  const available = height - kb - margin * 2 - (Platform.OS === 'android' ? 24 : 44);
  const maxH = Math.max(220, Math.min(available, height * 0.82));
  const requestClose = dismissable ? onClose : () => {};
  const { tablet, wide } = useLayout();
  // fillDesktop: a full sheet on the desktop website (900+) uses the whole width, not a 760-wide column.
  const fillWidth = fillDesktop && wide && Platform.OS === 'web';

  const header = (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
      <Text numberOfLines={2} style={{ flex: 1, paddingRight: 8, color: t.text, fontFamily: display(), fontWeight: '600', fontSize: t.fs(bigTitle ? 30 : 24), letterSpacing: -0.6 }}>{title}</Text>
      {dismissable && (
        <Pressable onPress={onClose} hitSlop={8} accessibilityLabel="Close" accessibilityRole="button" style={{ width: bigTitle ? 44 : 40, height: bigTitle ? 44 : 40, borderRadius: 22, backgroundColor: bigTitle ? t.surface : t.surfaceAlt, borderWidth: bigTitle ? 1 : 0, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="close" size={18} color={t.text} stroke={2.2} />
        </Pressable>
      )}
    </View>
  );

  if (full) {
    return (
      <Modal visible={visible} animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={requestClose} statusBarTranslucent>
        <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top', 'bottom']}>
          <View style={{ flex: 1, paddingHorizontal: fillWidth ? 32 : 20, paddingTop: 16, width: '100%', maxWidth: fillWidth ? undefined : tablet ? 760 : undefined, alignSelf: 'center' }}>
            {header}
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: footer ? 16 : 24 + kb }}>
              {children}
            </ScrollView>
            {/* footer: stays at the bottom (above the keyboard) while the page scrolls - the form's Save. */}
            {!!footer && <View style={{ paddingTop: 12, paddingBottom: 12 + kb, marginHorizontal: -20, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.surface }}>{footer}</View>}
          </View>
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} animationType={tablet ? 'fade' : 'slide'} transparent onRequestClose={requestClose} statusBarTranslucent>
      {/* Anchored to the bottom edge with a top grabber handle - the standard
          iOS action-sheet presentation, instead of a centred fading dialog. */}
      {/* On a tablet or desktop it opens as a centred dialog instead: a sheet the full width of a big
          screen is hard to read. */}
      <View style={{ flex: 1, justifyContent: tablet ? 'center' : 'flex-end', alignItems: tablet ? 'center' : undefined, padding: tablet ? 24 : 0, paddingBottom: kb + (tablet ? 24 : 0) }}>
        <Pressable onPress={dismissable ? onClose : undefined} disabled={!dismissable} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(15,23,20,0.5)' }, Platform.OS === 'web' ? { backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' } : null]} accessibilityLabel="Close" />
        <SafeAreaView edges={['bottom']} style={{ width: '100%', maxWidth: tablet ? 680 : undefined }}>
          <View style={{
            maxHeight: maxH,
            backgroundColor: t.surface,
            borderTopLeftRadius: t.sheetRadius,
            borderTopRightRadius: t.sheetRadius,
            borderBottomLeftRadius: tablet ? t.sheetRadius : 0,
            borderBottomRightRadius: tablet ? t.sheetRadius : 0,
            paddingHorizontal: 20,
            paddingTop: 8,
            paddingBottom: 6,
            overflow: 'hidden',
            borderWidth: 1,
            borderColor: t.border,
            elevation: 12,
            ...(Platform.OS === 'web' ? { boxShadow: '0 -8px 40px rgba(15,23,20,0.18)', animation: 'wdPop .24s cubic-bezier(.2,.9,.3,1.2)' } : null),
          }}>
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginBottom: 12 }} />
            {header}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              contentContainerStyle={{ paddingBottom: 14 }}
              style={{ flexGrow: 0 }}
            >
              {children}
            </ScrollView>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export function Row({ children, style, gap = 10 }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

/* ---------- v2 additions ---------- */

import DateTimePicker from '@react-native-community/datetimepicker';
import TimePickerModal from './TimePickerModal';

/** `clearable` adds a ✕ that empties the field (onChange(null)) - an optional date could be set but never removed. */
export function DateTimeField({ label, value, onChange, mode = 'datetime', minimumDate, maximumDate, placeholder, labelColor, clearable, dense, iconOnly }) {
  const t = useTheme();
  const [show, setShow] = React.useState(null); // 'date' | 'time' | null
  
  // d is only used to provide a default starting position for the popup picker if value is null
  const d = value ? new Date(value) : new Date();

  // Android's dialog and the browser's picker close once used; iOS's spinner stays until Done.
  const closesOnPick = Platform.OS !== 'ios';
  const onPicked = (event, picked) => {
    if (closesOnPick) setShow(null);
    if (event?.type === 'dismissed' || !picked) return;
    
    // Ensure we build upon the existing selected value or start fresh
    const next = value ? new Date(value) : new Date();
    if (!value && show === 'date') next.setHours(0, 0, 0, 0);      // a date picked on an empty field is a date alone (no clock time)
    
    if (show === 'time') { 
      next.setHours(picked.getHours(), picked.getMinutes(), 0, 0); 
    } else { 
      next.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate()); 
    }
    onChange(next.toISOString());
    if (closesOnPick && show === 'date' && mode === 'datetime') setTimeout(() => setShow('time'), 120);
  };

  return (
    <View style={{ marginBottom: iconOnly ? 0 : 12 }}>
      {!!label && !iconOnly && <Label dense={dense} numberOfLines={dense ? 1 : undefined} style={labelColor ? { color: labelColor } : null}>{label}</Label>}
      <Row gap={dense ? 6 : 10}>
        {/* iconOnly: just a calendar button (the Report's "pick another date"). */}
        {iconOnly && (
          <Pressable onPress={() => setShow('date')} accessibilityRole="button" accessibilityLabel={label || 'Pick a date'} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="calendar" size={20} color={t.text} stroke={1.9} />
          </Pressable>
        )}
        {!iconOnly && mode !== 'time' && (
        <Pressable onPress={() => setShow('date')} style={{
          flex: 1, backgroundColor: t.surface, borderWidth: 1, borderColor: t.fieldBorder, minHeight: 46, justifyContent: 'center',
          borderRadius: t.fieldRadius, paddingHorizontal: dense ? 9 : 14,
        }}>
          <Text numberOfLines={1} style={{ color: value ? t.text : t.textDim, fontWeight: '600', fontSize: t.fs(dense ? 12.5 : 14.5) }}>
            {value ? d.toLocaleDateString([], dense ? { day: '2-digit', month: 'short' } : { day: '2-digit', month: 'short', year: 'numeric' }) : (placeholder || (dense ? 'Date' : 'Select Date'))}
          </Text>
        </Pressable>
        )}
        {!iconOnly && mode !== 'date' && (
          <Pressable onPress={() => setShow('time')} style={{
            // mode 'time': a time only (the time button takes the whole row).
            ...(mode === 'time' ? { flex: 1 } : { width: 110 }), backgroundColor: t.surface, borderWidth: 1, borderColor: t.fieldBorder, minHeight: 46, justifyContent: 'center',
            borderRadius: t.fieldRadius, paddingHorizontal: dense ? 9 : 14,
          }}>
            <Text numberOfLines={1} style={{ color: value ? t.text : t.textDim, fontWeight: '600', fontSize: t.fs(dense ? 12.5 : 14.5) }}>
              {value ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : (dense ? 'Time' : 'Select Time')}
            </Text>
          </Pressable>
        )}
        {!iconOnly && !!clearable && !!value && (
          <Pressable onPress={() => { setShow(null); onChange(null); }} hitSlop={8} accessibilityLabel={`Clear ${label || 'date'}`} style={{
            width: 42, minHeight: 46, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surface,
            borderWidth: 1, borderColor: t.fieldBorder, borderRadius: t.fieldRadius,
          }}>
            <Icon name="close" size={16} color={t.textDim} stroke={2.2} />
          </Pressable>
        )}
      </Row>
      {show === 'date' && (
        <DateTimePicker
          value={d}
          mode="date"
          is24Hour={false}
          minimumDate={minimumDate}
          maximumDate={maximumDate}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={onPicked}
        />
      )}
      {Platform.OS === 'ios' && show === 'date' && <Btn kind="soft" title="Done" onPress={() => setShow(null)} />}
      {/* Every time is chosen in the same popup, on the phone and the website. */}
      <TimePickerModal visible={show === 'time'} value={d} onCancel={() => setShow(null)} onOk={(picked) => onPicked({ type: 'set' }, picked)} />
    </View>
  );
}

/**
 * A row of options in a soft track. Default: the chosen one is the dark primary with white text (tone 'dark');
 * tone 'light' gives a white pill with a hairline shadow (Config > Appearance > Text size).
 */
export function Segmented({ options, value, onChange, style, tone = 'dark' }) {
  const t = useTheme();
  const darkOn = tone !== 'light';
  return (
    <Row style={[{ backgroundColor: t.surfaceAlt, borderRadius: 14, padding: 3 }, style]} gap={2}>
      {options.map((o) => {
        const key = typeof o === 'string' ? o : o.key;
        const label = typeof o === 'string' ? o : o.label;
        const on = value === key;
        return (
          <Pressable key={key} onPress={() => onChange(key)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{
            // Optional per-option weight, so a long label can have more room than a short one instead of every segment being equal.
            flex: (typeof o === 'object' && o.flex) || 1,
            paddingVertical: 8, paddingHorizontal: 4, alignItems: 'center', borderRadius: 11,
            backgroundColor: on ? (darkOn ? t.primaryDark : t.surface) : 'transparent',
            ...(on && !darkOn ? { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 } : null),
          }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: on ? (darkOn ? '#fff' : t.text) : t.textDim, fontWeight: '700', fontSize: t.fs(13) }}>{label}</Text>
          </Pressable>
        );
      })}
    </Row>
  );
}

/** A filter chip: white pill with a line; the chosen one is the dark primary with white text. `count` sits after the label. */
export function Chip({ label, count, on, onPress, style, accessibilityLabel }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: !!on }} accessibilityLabel={accessibilityLabel || label}
      style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: on ? t.primaryDark : t.surface, borderWidth: 1, borderColor: on ? t.primaryDark : t.border, opacity: pressed ? 0.85 : 1 }, style]}>
      <Text style={{ color: on ? '#fff' : t.text, fontWeight: '700', fontSize: t.fs(13) }}>{label}</Text>
      {count != null && <Text style={{ color: on ? '#fff' : t.text, fontWeight: '800', fontSize: t.fs(13), opacity: 0.7, marginLeft: 4 }}>{count}</Text>}
    </Pressable>
  );
}

/* ---------- ringtone picker ---------- */

import { RINGTONES, ringtoneLabel, previewRingtone, stopPreview } from './ringtones';

/**
 * Field that opens a list of ringtones, each auditionable before choosing.
 * Used by Settings (the default alert tones).
 */
export function RingtonePicker({ label = 'Ringtone', value = 'default', onChange, compact }) {
  const t = useTheme();
  const [open, setOpen] = React.useState(false);
  const [playing, setPlaying] = React.useState(null);

  React.useEffect(() => () => { stopPreview(); }, []);

  const play = async (id) => {
    if (playing === id) { await stopPreview(); setPlaying(null); return; }
    setPlaying(id);
    const ok = await previewRingtone(id);
    if (!ok) setPlaying(null);
  };

  const close = async () => { await stopPreview(); setPlaying(null); setOpen(false); };

  return (
    <View style={{ marginBottom: compact ? 0 : 12 }}>
      {!!label && <Label>{label}</Label>}
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          backgroundColor: t.surface, borderWidth: 1, borderColor: t.fieldBorder,
          borderRadius: t.fieldRadius, paddingHorizontal: 14, minHeight: 46,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <Text style={{ color: t.text, fontWeight: '600', fontSize: t.fs(14.5) }}>{ringtoneLabel(value)}</Text>
        <Text style={{ color: t.primary, fontWeight: '800', fontSize: t.fs(13) }}>Change</Text>
      </Pressable>

      <Sheet visible={open} onClose={close} title="Choose a ringtone">
        <View>
          {RINGTONES.map((r) => {
            const selected = r.id === value;
            return (
              <Row key={r.id} style={{ alignItems: 'center', marginBottom: 8 }}>
                <Pressable
                  onPress={() => { onChange?.(r.id); }}
                  style={{
                    flex: 1, flexDirection: 'row', alignItems: 'center',
                    backgroundColor: selected ? t.tint : t.surface,
                    borderWidth: 1, borderColor: selected ? t.primary : t.border,
                    borderRadius: t.fieldRadius, paddingHorizontal: 12, paddingVertical: 12,
                  }}
                >
                  <View style={{
                    width: 18, height: 18, borderRadius: 9, marginRight: 10,
                    borderWidth: 2, borderColor: selected ? t.accent : t.border,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    {selected && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: t.accent }} />}
                  </View>
                  <Text style={{ color: t.text, fontSize: t.fs(15), fontWeight: selected ? '600' : '400' }}>{r.label}</Text>
                </Pressable>
                {!!r.asset && (
                  <Pressable
                    onPress={() => play(r.id)}
                    style={{
                      width: 46, paddingVertical: 12, alignItems: 'center',
                      backgroundColor: t.surface, borderWidth: 1, borderColor: t.border,
                      borderRadius: t.fieldRadius,
                    }}
                  >
                    <Text style={{ fontSize: t.fs(15), color: t.text }}>{playing === r.id ? '■' : '▶'}</Text>
                  </Pressable>
                )}
              </Row>
            );
          })}
          <Small style={{ marginTop: 6 }}>
            Android locks a sound to its notification channel, so the first alert after a change
            creates a fresh channel. If a tone ever stops applying, clear the app's notification
            categories in system settings and pick it again.
          </Small>
          <Btn style={{ marginTop: 14 }} title="Done" onPress={close} />
        </View>
      </Sheet>
    </View>
  );
}

/* ---------- option picker: the one dropdown for the whole app ---------- */

import { useStore as useStoreForPicker } from './store';

/**
 * Replaces every dropdown and chip-selector in the app.
 *
 * Options come from a source in optionSources.js, which points at exactly one
 * list in the database. Typing a name that does not exist offers to create
 * it; the new option is saved immediately and appears in every picker that
 * uses the same source. Each row can be deleted in place, with a warning that
 * says how many records use it.
 *
 * @param source   an entry from SOURCES
 * @param multi    select several (tags)
 * @param allowAny show an "Any" row that clears the value (filters)
 */
export function OptionPicker({
  label, value, onChange, source, multi = false, allowAny = false,
  placeholder = 'Select', anyLabel = 'Any', compact = false, editChip = false, dense = false, trigger,
}) {
  const t = useTheme();
  const { data, update } = useStoreForPicker();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [editing, setEditing] = React.useState(false);     // iOS Edit mode: delete buttons on the rows

  const options = React.useMemo(() => (source ? source.read(data) : []), [source, data]);
  const selected = multi ? (Array.isArray(value) ? value : []) : value;
  const labelOf = (v) => options.find((o) => o.value === v)?.label ?? v;

  const q = query.trim().toLowerCase();
  // Matched on the stored value as well as the label, so typing a name finds the existing one instead of offering to add a duplicate.
  const named = (o) => [String(o.label).toLowerCase(), String(o.value ?? '').toLowerCase()];
  const visible = q ? options.filter((o) => named(o).some((n) => n.includes(q))) : options;
  const exact = options.some((o) => named(o).includes(q));
  const canCreate = !!q && !exact;

  const close = () => { setOpen(false); setQuery(''); setEditing(false); };

  const pick = (v) => {
    if (multi) {
      const has = selected.includes(v);
      onChange?.(has ? selected.filter((x) => x !== v) : [...selected, v]);
    } else {
      onChange?.(v);
      close();
    }
  };

  /** Enter: select the exact match if there is one, otherwise create it. */
  const submit = () => {
    if (!q) return;
    const match = options.find((o) => named(o).includes(q));
    if (match) { setQuery(''); pick(match.value); return; }
    if (canCreate) { create(); return; }
    if (visible.length === 1) { setQuery(''); pick(visible[0].value); }
  };

  const create = () => {
    const name = query.trim();
    const probe = source.add(data, name);
    if (probe.error) { Alert.alert('Cannot add', probe.error); return; }
    update((db) => source.add(db, name).db);
    setQuery('');
    pick(probe.value);
  };

  const remove = (o) => {
    const used = source.usage ? source.usage(data, o.value) : 0;
    const probe = source.remove(data, o.value);
    if (probe.error) { Alert.alert('Cannot delete', probe.error); return; }
    Alert.alert(
      `Delete "${o.label}"?`,
      used
        ? `${used} existing record${used > 1 ? 's use' : ' uses'} it. They keep "${o.label}" - it just stops being offered here.`
        : 'It will be removed from this list everywhere in the app.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: () => {
            update((db) => source.remove(db, o.value).db);
            if (multi && selected.includes(o.value)) onChange?.(selected.filter((x) => x !== o.value));
            if (!multi && selected === o.value) onChange?.(null);
          },
        },
      ],
    );
  };

  const shown = multi
    ? (selected.length ? selected.map(labelOf).join(', ') : '')
    : (selected != null && selected !== '' ? labelOf(selected) : '');
  const anySelected = multi ? !selected.length : selected == null || selected === '';
  const openPicker = (edit = false) => { setEditing(edit); setOpen(true); };

  const row = (key, content, { onPress, checked, first, tone, onDelete, italic } = {}) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingLeft: 14, backgroundColor: pressed ? withAlpha(t.border, '66') : 'transparent' })}
    >
      {editing && onDelete && (
        <Pressable onPress={onDelete} hitSlop={8} accessibilityLabel={`Delete ${content}`} style={{ marginRight: 10 }}>
          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: t.danger, alignItems: 'center', justifyContent: 'center' }}>
            <View style={{ width: 10, height: 2.2, borderRadius: 1, backgroundColor: '#fff' }} />
          </View>
        </Pressable>
      )}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingRight: 14, borderTopWidth: first ? 0 : 1, borderTopColor: t.border }}>
        <Text numberOfLines={1} style={{ flex: 1, color: tone || t.text, fontWeight: '700', fontSize: t.fs(15), fontStyle: italic ? 'italic' : 'normal' }}>{content}</Text>
        {checked && <Icon name="check" size={18} color={t.primary} stroke={2.4} style={{ marginLeft: 8 }} />}
      </View>
    </Pressable>
  );

  return (
    <View style={{ marginBottom: compact || trigger ? 0 : 12 }}>
      {!trigger && !!label && (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <Label numberOfLines={dense ? 1 : undefined} style={dense ? { flex: 1 } : undefined}>{label}</Label>
          {editChip && (
            <Pressable onPress={() => openPicker(true)} hitSlop={6} style={{ backgroundColor: t.tint, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Text style={{ color: t.tintText, fontWeight: '800', fontSize: t.fs(12) }}>Edit</Text>
            </Pressable>
          )}
        </View>
      )}
      {/* trigger: the caller draws what opens the picker (the form's Status chip) instead of the drop-down field. */}
      {trigger ? trigger({ open: () => openPicker(false), text: shown }) : <PickerButton dense={dense} text={shown || (allowAny ? anyLabel : placeholder)} dim={!shown} onPress={() => openPicker(false)} />}

      <Sheet visible={open} onClose={close} title={label ? label.charAt(0) + label.slice(1).toLowerCase() : source?.title || 'Select'}>
        <View>
          {/* iOS search bar: type and press Enter - an exact match is selected, a new name is created. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: t.surface, borderWidth: 1, borderColor: t.fieldBorder, borderRadius: 14, paddingHorizontal: 12, height: 46 }}>
              <Icon name="search" size={18} color={t.textDim} stroke={1.9} style={{ marginRight: 8 }} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search or add new"
                placeholderTextColor={t.textDim}
                autoCapitalize="words"
                returnKeyType="done"
                blurOnSubmit={false}
                onSubmitEditing={submit}
                style={{ flex: 1, color: t.text, fontFamily: ff(600), fontSize: t.fs(14.5), paddingVertical: 0 }}
              />
              {!!query && <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityLabel="Clear"><Icon name="close" size={16} color={t.textDim} stroke={2.2} /></Pressable>}
            </View>
            {!!options.length && (
              <Pressable onPress={() => setEditing((e) => !e)} hitSlop={8}>
                <Text style={{ color: t.primary, fontSize: t.fs(15), fontWeight: '800' }}>{editing ? 'Done' : 'Edit'}</Text>
              </Pressable>
            )}
          </View>

          <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, overflow: 'hidden' }}>
            {canCreate && row('__create', `+ Add "${query.trim()}"`, { onPress: create, first: true, tone: t.primary })}
            {allowAny && !q && row('__any', anyLabel, { onPress: () => { onChange?.(multi ? [] : null); close(); }, checked: anySelected, first: !canCreate, italic: true })}
            {visible.map((o, i) => {
              const on = multi ? selected.includes(o.value) : selected === o.value;
              return row(String(o.value), o.label, {
                onPress: editing ? undefined : () => pick(o.value),
                checked: on && !editing,
                first: i === 0 && !canCreate && !(allowAny && !q),
                onDelete: () => remove(o),
              });
            })}
            {!options.length && !q && (
              <Small style={{ textAlign: 'center', paddingVertical: 16 }}>
                Nothing here yet. Type a name above to add the first one.
              </Small>
            )}
            {!!options.length && !visible.length && !canCreate && (
              <Small style={{ textAlign: 'center', paddingVertical: 16 }}>No match.</Small>
            )}
          </View>
          {editing && <Small style={{ marginTop: 8, marginLeft: 4 }}>Tap ⊖ to remove an option. Records that use it keep their value.</Small>}

          {multi && <Btn style={{ marginTop: 12 }} title={`Done${selected.length ? ` (${selected.length})` : ''}`} onPress={close} />}
        </View>
      </Sheet>
    </View>
  );
}

/** The drop-down field: the current value, then a chevron. Used by every drop-down. */
export function PickerButton({ text, dim, onPress, style, dense, noChevron }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [{
        backgroundColor: t.surface, borderRadius: t.fieldRadius, paddingHorizontal: dense ? 9 : 14, minHeight: 46,
        borderWidth: 1, borderColor: t.fieldBorder,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', opacity: pressed ? 0.7 : 1,
      }, style]}
    >
      <Text numberOfLines={1} style={{ color: dim ? t.textDim : t.text, fontWeight: '600', fontSize: t.fs(dense ? 12.5 : 14.5), flex: 1 }}>{text}</Text>
      {!noChevron && <Icon name="chevronDown" size={16} color={t.textDim} stroke={2} style={{ marginLeft: 4 }} />}
    </Pressable>
  );
}

/* ---------- large time tile ---------- */

/* ---------- swipeable tabs ---------- */

import { tabAfterSwipe, isHorizontalDrag } from './swipe';

/**
 * Wraps a tabbed screen so a left/right swipe changes tab. Tapping the tabs
 * keeps working exactly as before - this only adds the gesture.
 *
 * Only a clearly horizontal drag is claimed (see swipe.js), so vertical
 * scrolling is untouched, and a child that scrolls sideways natively keeps
 * its own gesture.
 */
/** `swipe`: a sideways drag changes tab (off: only the tab bar does; the slide between tabs stays). */
export function SwipeTabs({ tabs, value, onChange, children, style, swipe = true }) {
  const valueRef = React.useRef(value);
  const changeRef = React.useRef(onChange);
  valueRef.current = value;
  changeRef.current = onChange;

  const slide = React.useRef(new Animated.Value(0)).current;
  const prev = React.useRef(tabs.indexOf(value));
  React.useEffect(() => {
    const i = tabs.indexOf(value);
    if (prev.current !== i && prev.current >= 0 && i >= 0) {
      slide.setValue(i > prev.current ? 28 : -28);
      Animated.timing(slide, { toValue: 0, duration: 170, useNativeDriver: true }).start();
    }
    prev.current = i;
  }, [value]);

  const key = tabs.join('|');
  const responder = React.useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => isHorizontalDrag(g.dx, g.dy),
    onPanResponderTerminationRequest: () => true,
    onPanResponderRelease: (_, g) => {
      const next = tabAfterSwipe(tabs, valueRef.current, g.dx, g.dy, g.vx);
      if (next) changeRef.current?.(next);
    },
  }), [key]);

  return (
    <Animated.View {...(swipe ? responder.panHandlers : {})} style={[{ transform: [{ translateX: slide }] }, style]}>
      {children}
    </Animated.View>
  );
}

/* ---------- motion helpers ---------- */

let reduceMotionCache = false;
AccessibilityInfo.isReduceMotionEnabled?.().then((v) => { reduceMotionCache = !!v; }).catch(warnQuiet('ui'));

/** Fades its children in while rising into place; `delay` staggers a list. Skipped when the phone asks for reduced motion. */
/** The phone's "reduce motion" setting, as last read: animations are skipped when it is on. */
export const prefersReducedMotion = () => reduceMotionCache;

// Android needs this switched on once for LayoutAnimation (newer React Native builds ignore it).
try { if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) UIManager.setLayoutAnimationEnabledExperimental(true); } catch { /* the rows just move without animation */ }
/** Call right before a change that adds or removes rows (Done, Move, Snooze...): the list closes the gap softly instead of jumping. */
export function softLayout() {
  if (Platform.OS === 'web' || reduceMotionCache) return;
  try { LayoutAnimation.configureNext(LayoutAnimation.create(240, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity)); } catch { /* optional */ }
}

export function FadeInUp({ children, delay = 0, distance = 18, duration = 420, style }) {
  const v = React.useRef(new Animated.Value(reduceMotionCache ? 1 : 0)).current;
  React.useEffect(() => {
    if (reduceMotionCache) return undefined;
    const a = Animated.timing(v, { toValue: 1, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Animated.View
      style={[style, {
        opacity: v,
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) },
          { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }) },
        ],
      }]}
    >
      {children}
    </Animated.View>
  );
}

/** A number that counts up (or down) to its value instead of jumping. */
export function AnimatedNumber({ value, style, duration = 700 }) {
  const target = Number(value) || 0;
  const v = React.useRef(new Animated.Value(reduceMotionCache ? target : 0)).current;
  const [shown, setShown] = React.useState(reduceMotionCache ? target : 0);
  React.useEffect(() => {
    const id = v.addListener(({ value: x }) => setShown(Math.round(x)));
    if (reduceMotionCache) { v.setValue(target); setShown(target); return () => v.removeListener(id); }
    const a = Animated.timing(v, { toValue: target, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start();
    return () => { a.stop(); v.removeListener(id); };
  }, [target]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Text style={style}>{shown}</Text>;
}

/** A grouped section (More, Config): small spaced caps title, a white card with a line holding the rows, an optional footnote. */
export function Group({ title, footer, children }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 18 }}>
      {!!title && <Text style={{ color: t.textDim, fontWeight: '800', fontSize: t.fs(11), letterSpacing: 1.1, marginLeft: 4, marginBottom: 8, textTransform: 'uppercase' }}>{title}</Text>}
      <View style={{ backgroundColor: t.surface, borderRadius: t.radius, borderWidth: 1, borderColor: t.border, overflow: 'hidden' }}>{children}</View>
      {!!footer && <Text style={{ color: t.textDim, fontSize: t.fs(12.5), lineHeight: t.fs(18), marginHorizontal: 6, marginTop: 8, fontWeight: '500' }}>{footer}</Text>}
    </View>
  );
}

/** The tint pairs for the square icon holders (More): [background, icon colour]. */
export const toneOf = (t, tone) => ({
  green: [t.tint, t.tintText], slate: [t.slateTint, t.slateText], red: [t.dangerTint, t.dangerText], amber: [t.warnTint, t.warnText],
}[tone] || [t.tint, t.tintText]);

/**
 * One row: a tinted square icon holder (iconName + tone, or an emoji `icon`), the label, then a value and chevron, or a
 * switch. `last` removes the divider under the final row of a group.
 */
export function Item({ icon, iconName, tone, label, value, valueColor, onPress, right, last, destructive, chevron = true, first }) {
  const t = useTheme();
  const tappable = !!onPress;
  const [bg, fg] = toneOf(t, tone);
  return (
    <Pressable
      onPress={onPress}
      disabled={!tappable}
      accessibilityRole={tappable ? 'button' : undefined}
      accessibilityLabel={label}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 13, minHeight: 60, borderTopWidth: first ? 0 : 1, borderTopColor: t.surfaceAlt, backgroundColor: pressed && tappable ? t.surfaceAlt : t.surface })}
    >
      {!!(iconName || icon) && (
        <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
          {iconName ? <Icon name={iconName} size={18} color={fg} stroke={1.9} /> : <Text style={{ fontSize: 17 }}>{icon}</Text>}
        </View>
      )}
      <Text style={{ flex: 1, color: destructive ? t.danger : t.text, fontWeight: '700', fontSize: t.fs(15) }}>{label}</Text>
      {value != null && <Text numberOfLines={1} style={{ color: valueColor || t.textDim, fontWeight: '700', fontSize: t.fs(13), maxWidth: 170 }}>{value}</Text>}
      {right}
      {tappable && chevron && !right && <Icon name="chevronRight" size={16} color={t.chevron} stroke={2} />}
    </Pressable>
  );
}

/** A choice list inside a sheet, with a tick on the current one. */
export function Choices({ options, value, onChange }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, overflow: 'hidden' }}>
      {options.map(([key, label, sub], i) => {
        const on = String(value) === String(key);
        return (
          <Pressable key={String(key)} onPress={() => onChange(key)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: i ? 1 : 0, borderTopColor: t.border, backgroundColor: on ? t.tint : t.surface }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: on ? t.tintText : t.text, fontWeight: '700', fontSize: t.fs(15) }}>{label}</Text>
              {!!sub && <Text style={{ color: t.textDim, fontSize: t.fs(12), fontWeight: '500' }}>{sub}</Text>}
            </View>
            {on && <Icon name="check" size={18} color={t.primary} stroke={2.4} />}
          </Pressable>
        );
      })}
    </View>
  );
}
