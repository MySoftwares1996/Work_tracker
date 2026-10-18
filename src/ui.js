import React from 'react';
import {
  View, Text, Pressable, TextInput, ScrollView, Modal, StyleSheet, Platform,
  Alert, Keyboard, useWindowDimensions, Animated, PanResponder, Easing, AccessibilityInfo, RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import TabIcon from './tabIcons';
import { SIDE_BAR_WIDTH, CONTENT_MAX_WIDTH, layoutFor } from './layout';
import { useTheme, opaque, withAlpha } from './theme';
import Svg, { Path } from 'react-native-svg';
import { warnQuiet } from './quietCatch';

/**
 * @param headerless  true only for screens with the navigation header hidden.
 *
 * A screen under a header must NOT add the top safe-area inset: the header
 * already sits below the status bar. Adding it again left a blank band the
 * height of the status bar between the header and the content on every
 * screen that has a title bar.
 */
/** Room left at the foot of a screen for the floating bottom tab bar, so the last card is never under it. */
export const BOTTOM_BAR_SPACE = 80;

export { TABLET_MIN, WIDE_MIN, SIDE_BAR_WIDTH, CONTENT_MAX_WIDTH, layoutFor } from './layout';

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

/** Frosted-glass style for a bar: blur behind it on the website (and on iOS, where the style is honoured). */
export const frost = (t) => (Platform.OS === 'web' && t.frosted ? { backdropFilter: 'blur(28px) saturate(180%)', WebkitBackdropFilter: 'blur(28px) saturate(180%)' } : null);

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
  // APK with many tabs: the website's side bar turned sideways - a frosted bar with the selected tab in an accent pill that glides.
  if (Platform.OS !== 'web') return <AppTabs tabs={tabs} value={value} onChange={onChange} badges={badges} />;
  // The website opened on a phone: iOS-style tab bar, edge to edge, the selected tab in the accent colour.
  return (
    <View
      accessibilityRole="tablist"
      style={[{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        flexDirection: 'row', backgroundColor: t.bar, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 6), paddingHorizontal: 4,
        borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.hairline,
      }, frost(t)]}
    >
      {tabs.map((x) => <PhoneTab key={x.key} x={x} on={value === x.key} badge={badges[x.key]} onChange={onChange} crowded={tabs.length > 6} />)}
    </View>
  );
}

/** The phone's own tab bar: five tabs at most, edge to edge, big touch targets, the chosen tab's icon in a soft accent pill. */
function PhoneBar({ tabs, value, onChange, badges }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View accessibilityRole="tablist" style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', backgroundColor: t.surface, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 10), paddingHorizontal: 4, borderTopWidth: 1, borderTopColor: t.border }, frost(t)]}>
      {tabs.map((x) => {
        const on = value === x.key;
        const badge = badges[x.key];
        return (
          <Pressable key={x.key} onPress={() => onChange(x.key)} accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={`${x.label}${badge ? `, ${badge}` : ''}`} style={{ flex: 1, minWidth: 0, alignItems: 'center', paddingVertical: 2 }}>
            <View style={{ width: 54, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent' }}>
              <TabIcon name={x.icon || x.key} color={on ? t.accent : t.textDim} active={on} size={23} />
              {!!badge && (
                <View style={{ position: 'absolute', top: -4, right: 0, minWidth: 17, height: 17, borderRadius: 9, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: x.key === 'done' ? t.ok : t.danger }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '800' }}>{badge > 99 ? '99+' : badge}</Text>
                </View>
              )}
            </View>
            <Text style={{ marginTop: 3, fontSize: 11, fontWeight: on ? '800' : '600', color: on ? t.accent : t.textDim }} numberOfLines={1}>{x.label}</Text>
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
  // macOS Sonoma's sidebar: frosted, a hairline edge, small rounded rows; the selected row takes the accent colour.
  return (
    <View
      accessibilityRole="tablist"
      style={[{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: SIDE_BAR_WIDTH,
        backgroundColor: t.bar, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: t.sideEdge,
        paddingTop: 18, paddingBottom: 14, paddingHorizontal: 10,
      }, frost(t)]}
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
  return wide ? 24 : Math.max(insets.bottom, 8) + 72;
}

export function Screen({ children, scroll = true, padded = true, headerless = false, bottomBar = false, onRefresh }) {
  const t = useTheme();
  // Pull down to refresh (phone): the spinner shows while onRefresh runs, and at least a moment so it reads as done.
  const [refreshing, setRefreshing] = React.useState(false);
  const pull = onRefresh ? async () => { setRefreshing(true); try { await Promise.all([onRefresh(), new Promise((r) => setTimeout(r, 700))]); } catch { /* the screen shows its own errors */ } setRefreshing(false); } : null;
  const Body = scroll ? ScrollView : View;
  const edges = headerless ? ['top', 'left', 'right'] : ['left', 'right'];
  const { wide, tablet } = useLayout();
  const sides = padded ? (wide ? 28 : tablet ? 20 : 16) : 0;
  return (
    <SafeAreaView style={[{ flex: 1, backgroundColor: t.bg }, t.bgGradient ? { backgroundImage: t.bgGradient } : null]} edges={edges}>
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

/** A friendly empty screen: a round icon, a title, one line of help and (optionally) the one action that fills it. */
export function EmptyState({ icon = '✅', title, text, action, onAction }) {
  const t = useTheme();
  return (
    <View accessibilityRole="summary" style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24, gap: 10 }}>
      <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: t.accent + '1F', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: t.fs(38) }}>{icon}</Text>
      </View>
      <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(20), textAlign: 'center', marginTop: 4 }}>{title}</Text>
      {!!text && <Text style={{ color: t.textDim, fontSize: t.fs(14), lineHeight: t.fs(21), textAlign: 'center' }}>{text}</Text>}
      {!!action && <Btn style={{ marginTop: 8, alignSelf: 'center', paddingHorizontal: 24 }} title={action} onPress={onAction} />}
    </View>
  );
}

export function Card({ children, style, onPress, tone }) {
  const t = useTheme();
  // A card has an elevation shadow; a translucent background lets that shadow
  // show through as a grey box on Android. Flatten any #RRGGBBAA to opaque.
  const flat = StyleSheet.flatten(style) || {};
  const fixedStyle = flat.backgroundColor ? [style, { backgroundColor: opaque(flat.backgroundColor, t.surface) }] : style;
  style = fixedStyle;
  const base = {
    backgroundColor: opaque(tone || t.surface, t.surface),
    borderRadius: t.radius,
    borderWidth: t.frosted && Platform.OS === 'web' ? 0 : t.dark ? 1 : StyleSheet.hairlineWidth,
    borderColor: t.border,
    padding: 14,
    ...t.shadow,
  };
  if (onPress) {
    // Dips under the finger and springs back (the CSS transition on the website does the springing).
    return (
      <Pressable onPress={onPress} style={({ pressed, hovered }) => [base, style, hovered && Platform.OS === 'web' && { transform: [{ translateY: -2 }] }, pressed && { transform: [{ scale: 0.975 }], opacity: 0.94 }]}>
        {children}
      </Pressable>
    );
  }
  return <View style={[base, style]}>{children}</View>;
}

export function H1({ children, style }) {
  const t = useTheme();
  return <Text style={[{ fontSize: t.fs(24), fontWeight: '700', color: t.text, letterSpacing: -0.4 }, style]}>{children}</Text>;
}
export function H2({ children, style, numberOfLines }) {
  const t = useTheme();
  return <Text numberOfLines={numberOfLines} style={[{ fontSize: t.fs(17), fontWeight: '600', color: t.text, marginBottom: 8 }, style]}>{children}</Text>;
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

export function Btn({ title, onPress, kind = 'primary', style, disabled, icon }) {
  const t = useTheme();
  const map = {
    primary: { bg: t.accent, fg: t.onAccent || '#fff' },
    ghost: { bg: 'transparent', fg: t.accent, border: t.accent },
    soft: { bg: t.surfaceAlt, fg: t.text, border: t.border },
    danger: { bg: t.danger, fg: '#fff' },
    ok: { bg: t.ok, fg: '#fff' },
  }[kind];
  const press = usePressSpring(0.96);
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
        borderWidth: map.border ? 1 : 0,
        paddingVertical: web ? 8 : 12,
        paddingHorizontal: web ? 14 : 16,
        borderRadius: t.btnRadius,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.45 : pressed ? 0.82 : 1,
      }, style]}
    >
      <Animated.View style={{ transform: [{ scale: press.scale }], maxWidth: '100%' }}>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={{ color: map.fg, fontWeight: '600', fontSize: t.fs(web ? 13.5 : 15), textAlign: 'center', flexShrink: 1 }}
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
      {!!label && <Small style={{ marginBottom: 5 }}>{label}</Small>}
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
          backgroundColor: t.surfaceAlt,
          borderWidth: 1,
          borderColor: focused ? t.accent : t.border,
          borderRadius: t.fieldRadius,
          paddingHorizontal: 12,
          paddingVertical: Platform.OS === 'ios' ? 12 : 9,
          color: t.text,
          fontSize: t.fs(15),
          // `compact`: one line to start with, growing as lines are added (Task description, Notes).
          minHeight: multiline ? (compact ? 44 : 80) : undefined,
          textAlignVertical: multiline && !compact ? 'top' : 'center',
          // The macOS focus ring on the website: a soft halo in the accent colour.
          ...(Platform.OS === 'web' && focused ? { boxShadow: `0 0 0 3px ${t.accent}40` } : null),
        }}
      />
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
export function Sheet({ visible, onClose, title, children, full, dismissable = true, fillDesktop = false, footer = null }) {
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
    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
      <H2 style={{ flex: 1, marginBottom: 0, paddingRight: 8 }} numberOfLines={2}>{title}</H2>
      {dismissable && (
        <Pressable onPress={onClose} hitSlop={12} style={{ padding: 4 }} accessibilityLabel="Close">
          <Text style={{ color: t.textDim, fontSize: t.fs(20) }}>✕</Text>
        </Pressable>
      )}
    </View>
  );

  if (full) {
    return (
      <Modal visible={visible} animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={requestClose} statusBarTranslucent>
        <SafeAreaView style={{ flex: 1, backgroundColor: t.bg }} edges={['top', 'bottom']}>
          <View style={{ flex: 1, paddingHorizontal: fillWidth ? 32 : 16, paddingTop: 16, width: '100%', maxWidth: fillWidth ? undefined : tablet ? 760 : undefined, alignSelf: 'center' }}>
            {header}
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: footer ? 16 : 24 + kb }}>
              {children}
            </ScrollView>
            {/* footer: stays at the bottom (above the keyboard) while the page scrolls - the form's Save. */}
            {!!footer && <View style={{ paddingTop: 10, paddingBottom: 10 + kb, borderTopWidth: 1, borderTopColor: t.border, backgroundColor: t.bg }}>{footer}</View>}
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
        <Pressable onPress={dismissable ? onClose : undefined} disabled={!dismissable} style={[StyleSheet.absoluteFill, { backgroundColor: t.mac ? 'rgba(0,0,0,0.28)' : 'rgba(0,0,0,0.4)' }, Platform.OS === 'web' ? { backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' } : null]} accessibilityLabel="Close" />
        <SafeAreaView edges={['bottom']} style={{ width: '100%', maxWidth: tablet ? 680 : undefined }}>
          <View style={{
            maxHeight: maxH,
            backgroundColor: t.surface,
            borderTopLeftRadius: t.sheetRadius,
            borderTopRightRadius: t.sheetRadius,
            borderBottomLeftRadius: tablet ? t.sheetRadius : 0,
            borderBottomRightRadius: tablet ? t.sheetRadius : 0,
            paddingHorizontal: 16,
            paddingTop: 8,
            paddingBottom: 6,
            overflow: 'hidden',
            ...t.shadow,
            elevation: 12,
            ...(Platform.OS === 'web' ? { boxShadow: `0 0 0 0.5px ${t.dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)'}, 0 24px 70px rgba(0,0,0,0.30)`, animation: 'wdPop .24s cubic-bezier(.2,.9,.3,1.2)' } : null),
          }}>
            <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: t.border, marginBottom: 10 }} />
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
export function DateTimeField({ label, value, onChange, mode = 'datetime', minimumDate, maximumDate, placeholder, labelColor, clearable, dense }) {
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
    <View style={{ marginBottom: 12 }}>
      {!!label && <Small numberOfLines={dense ? 1 : undefined} style={[{ marginBottom: 5 }, labelColor ? { color: labelColor, fontWeight: '800' } : null]}>{label}</Small>}
      <Row gap={dense ? 4 : 10}>
        {mode !== 'time' && (
        <Pressable onPress={() => setShow('date')} style={{
          flex: 1, backgroundColor: t.surfaceAlt, borderWidth: 1, borderColor: t.border,
          borderRadius: t.radius - 8, paddingHorizontal: dense ? 8 : 12, paddingVertical: dense ? 13 : 11,
        }}>
          <Text numberOfLines={1} style={{ color: value ? t.text : t.textDim, fontSize: t.fs(dense ? 13 : 15) }}>
            {value ? d.toLocaleDateString([], dense ? { day: '2-digit', month: 'short' } : { day: '2-digit', month: 'short', year: 'numeric' }) : (placeholder || (dense ? 'Date' : 'Select Date'))}
          </Text>
        </Pressable>
        )}
        {mode !== 'date' && (
          <Pressable onPress={() => setShow('time')} style={{
            // mode 'time': a time only (the time button takes the whole row).
            ...(mode === 'time' ? { flex: 1 } : { width: 110 }), backgroundColor: t.surfaceAlt, borderWidth: 1, borderColor: t.border,
            // web.app: the time select is round (a pill); the phone keeps the rounded square.
            borderRadius: Platform.OS === 'web' ? 999 : t.radius - 8, paddingHorizontal: dense ? 8 : Platform.OS === 'web' ? 16 : 12, paddingVertical: dense ? 13 : 11, alignItems: Platform.OS === 'web' ? 'center' : undefined,
          }}>
            <Text numberOfLines={1} style={{ color: value ? t.text : t.textDim, fontSize: t.fs(dense ? 13 : 15) }}>
              {value ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : (dense ? 'Time' : 'Select Time')}
            </Text>
          </Pressable>
        )}
        {!!clearable && !!value && (
          <Pressable onPress={() => { setShow(null); onChange(null); }} hitSlop={8} accessibilityLabel={`Clear ${label || 'date'}`} style={{
            width: 42, alignItems: 'center', justifyContent: 'center', backgroundColor: t.surfaceAlt,
            borderWidth: 1, borderColor: t.border, borderRadius: t.radius - 8, paddingVertical: 11,
          }}>
            <Text style={{ color: t.textDim, fontSize: t.fs(15), fontWeight: '700' }}>✕</Text>
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


export function Segmented({ options, value, onChange, style }) {
  const t = useTheme();
  return (
    // iOS's UISegmentedControl: a grey track with a white, shadowed pill
    // under the selected segment - not a solid accent fill.
    <Row style={[{ backgroundColor: t.bgAlt, borderRadius: t.btnRadius, padding: 2 }, style]} gap={2}>
      {options.map((o) => {
        const key = typeof o === 'string' ? o : o.key;
        const label = typeof o === 'string' ? o : o.label;
        const on = value === key;
        return (
          <Pressable key={key} onPress={() => onChange(key)} style={{
            // Optional per-option weight, so a long label can have more room
            // than a short one instead of every segment being equal.
            flex: (typeof o === 'object' && o.flex) || 1,
            paddingVertical: 7, paddingHorizontal: 4, alignItems: 'center', borderRadius: Math.max(t.btnRadius - 2, 6),
            backgroundColor: on ? t.surface : 'transparent',
            ...(on ? { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 2 } : null),
          }}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: on ? t.text : t.textDim, fontWeight: on ? '600' : '500', fontSize: t.fs(12.5) }}>{label}</Text>
          </Pressable>
        );
      })}
    </Row>
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
      {!!label && <Small style={{ marginBottom: 5 }}>{label}</Small>}
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          backgroundColor: t.surfaceAlt, borderWidth: 1, borderColor: t.border,
          borderRadius: t.radius - 8, paddingHorizontal: 12, paddingVertical: 11,
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        }}
      >
        <Text style={{ color: t.text, fontSize: t.fs(15) }}>{ringtoneLabel(value)}</Text>
        <Text style={{ color: t.textDim, fontSize: t.fs(13) }}>Change</Text>
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
                    backgroundColor: selected ? t.accent + '1F' : t.surfaceAlt,
                    borderWidth: 1, borderColor: selected ? t.accent : t.border,
                    borderRadius: t.radius - 8, paddingHorizontal: 12, paddingVertical: 12,
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
                      backgroundColor: t.surfaceAlt, borderWidth: 1, borderColor: t.border,
                      borderRadius: t.radius - 8,
                    }}
                  >
                    <Text style={{ fontSize: t.fs(15) }}>{playing === r.id ? '■' : '▶'}</Text>
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

const ACCOUNT_KINDS = ['bank', 'credit card', 'cash', 'wallet'];

/**
 * Replaces every dropdown and chip-selector in the app.
 *
 * Options come from a source in optionSources.js, which points at exactly one
 * list in the database. Typing a name that does not exist offers to create
 * it; the new option is saved immediately and appears in every picker that
 * uses the same source. Each row can be deleted in place, with a warning that
 * says how many records use it.
 *
 * @param source   an entry from SOURCES, or fixedSource(...)
 * @param multi    select several (tags)
 * @param allowAny show an "Any" row that clears the value (filters)
 */
export function OptionPicker({
  label, value, onChange, source, multi = false, allowAny = false,
  placeholder = 'Select', anyLabel = 'Any', compact = false, editChip = false, dense = false,
}) {
  const t = useTheme();
  const { data, update } = useStoreForPicker();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [kind, setKind] = React.useState('bank');
  const [editing, setEditing] = React.useState(false);     // iOS Edit mode: delete buttons on the rows

  const options = React.useMemo(() => (source ? source.read(data) : []), [source, data]);
  const selected = multi ? (Array.isArray(value) ? value : []) : value;
  const labelOf = (v) => options.find((o) => o.value === v)?.label ?? v;

  const q = query.trim().toLowerCase();
  // Matched on the name as well as the label: a label may carry a symbol the stored name does not ("🥛 Milk"),
  // and typing the plain name must find the existing one, not offer to add a duplicate.
  const named = (o) => [String(o.label).toLowerCase(), String(o.value ?? '').toLowerCase()];
  const visible = q ? options.filter((o) => named(o).some((n) => n.includes(q))) : options;
  const exact = options.some((o) => named(o).includes(q));
  const canCreate = !!q && !exact && !source?.fixed;

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
    const extra = source.id === 'account' ? { kind } : {};
    const probe = source.add(data, name, extra);
    if (probe.error) { Alert.alert('Cannot add', probe.error); return; }
    const fixed = source.id === 'account' ? { ...extra, id: probe.value } : extra;
    update((db) => source.add(db, name, fixed).db);
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
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 46, paddingRight: 14, borderTopWidth: first ? 0 : 0.5, borderTopColor: t.border }}>
        <Text numberOfLines={1} style={{ flex: 1, color: tone || t.text, fontSize: t.fs(16.5), fontStyle: italic ? 'italic' : 'normal' }}>{content}</Text>
        {checked && <Text style={{ color: t.accent, fontSize: t.fs(17), fontWeight: '700', marginLeft: 8 }}>✓</Text>}
      </View>
    </Pressable>
  );

  return (
    <View style={{ marginBottom: compact ? 0 : 12 }}>
      {!!label && (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
          <Small numberOfLines={dense ? 1 : undefined} style={dense ? { flex: 1 } : undefined}>{label}</Small>
          {editChip && !source?.fixed && (
            <Pressable onPress={() => openPicker(true)} hitSlop={6} style={{ backgroundColor: t.accent + '22', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 3 }}>
              <Text style={{ color: t.accent, fontWeight: '800', fontSize: t.fs(12) }}>Edit</Text>
            </Pressable>
          )}
        </View>
      )}
      <PickerButton dense={dense} text={shown || (allowAny ? anyLabel : placeholder)} dim={!shown} onPress={() => openPicker(false)} />

      <Sheet visible={open} onClose={close} title={label ? label.charAt(0) + label.slice(1).toLowerCase() : source?.title || 'Select'}>
        <View>
          {/* iOS search bar: type and press Enter - an exact match is selected, a new name is created. */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: t.surfaceAlt, borderRadius: 11, paddingHorizontal: 10, height: 38 }}>
              <Text style={{ color: t.textDim, marginRight: 6, fontSize: t.fs(14) }}>🔍</Text>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder={source?.fixed ? 'Search' : 'Search or add new'}
                placeholderTextColor={t.textDim}
                autoCapitalize="words"
                returnKeyType="done"
                blurOnSubmit={false}
                onSubmitEditing={submit}
                style={{ flex: 1, color: t.text, fontSize: t.fs(16), paddingVertical: 0 }}
              />
              {!!query && <Pressable onPress={() => setQuery('')} hitSlop={8}><Text style={{ color: t.textDim, fontSize: t.fs(14) }}>✕</Text></Pressable>}
            </View>
            {!source?.fixed && !!options.length && (
              <Pressable onPress={() => setEditing((e) => !e)} hitSlop={8}>
                <Text style={{ color: t.accent, fontSize: t.fs(16), fontWeight: editing ? '700' : '400' }}>{editing ? 'Done' : 'Edit'}</Text>
              </Pressable>
            )}
          </View>

          {canCreate && source.id === 'account' && (
            <Row style={{ flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {ACCOUNT_KINDS.map((k) => (
                <Pressable
                  key={k}
                  onPress={() => setKind(k)}
                  style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: kind === k ? t.accent : t.surfaceAlt }}
                >
                  <Text style={{ color: kind === k ? '#fff' : t.text, fontSize: t.fs(12), textTransform: 'capitalize' }}>{k}</Text>
                </Pressable>
              ))}
            </Row>
          )}

          <View style={{ backgroundColor: t.surfaceAlt, borderRadius: 12, overflow: 'hidden' }}>
            {canCreate && row('__create', `+ Add "${query.trim()}"`, { onPress: create, first: true, tone: t.accent })}
            {allowAny && !q && row('__any', anyLabel, { onPress: () => { onChange?.(multi ? [] : null); close(); }, checked: anySelected, first: !canCreate, italic: true })}
            {visible.map((o, i) => {
              const on = multi ? selected.includes(o.value) : selected === o.value;
              return row(String(o.value), `${o.label}${o.kind ? `  ·  ${o.kind}` : ''}`, {
                onPress: editing ? undefined : () => pick(o.value),
                checked: on && !editing,
                first: i === 0 && !canCreate && !(allowAny && !q),
                onDelete: source?.fixed ? undefined : () => remove(o),
              });
            })}
            {!options.length && !q && (
              <Small style={{ textAlign: 'center', paddingVertical: 16 }}>
                {source?.fixed ? 'Nothing to choose.' : 'Nothing here yet. Type a name above to add the first one.'}
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

/** iOS pop-up button: the current value, then the up/down chevron. Used by every drop-down. */
export function PickerButton({ text, dim, onPress, style, dense }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [{
        backgroundColor: t.surfaceAlt, borderRadius: 10, paddingHorizontal: dense ? 8 : 12, minHeight: 44,
        flexDirection: 'row', alignItems: 'center', opacity: pressed ? 0.7 : 1,
        ...(dense ? { borderWidth: 1, borderColor: t.border, minHeight: 46 } : null),
      }, style]}
    >
      <Text numberOfLines={1} style={{ color: dim ? t.textDim : t.text, fontSize: t.fs(dense ? 13 : 15.5), flex: 1 }}>{text}</Text>
      {!dense && <Svg width={12} height={18} viewBox="0 0 12 18" style={{ marginLeft: 8 }}>
        <Path d="M2.5 6.5 6 3l3.5 3.5M2.5 11.5 6 15l3.5-3.5" stroke={t.accent} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>}
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

/** iOS grouped section: small grey caps title, a rounded white block of rows, an optional footnote. */
export function Group({ title, footer, children }) {
  const t = useTheme();
  return (
    <View style={{ marginBottom: 22 }}>
      {!!title && <Text style={{ color: t.textDim, fontSize: t.fs(13), marginLeft: 16, marginBottom: 6, textTransform: 'uppercase' }}>{title}</Text>}
      <View style={{ backgroundColor: t.surface, borderRadius: 12, overflow: 'hidden' }}>{children}</View>
      {!!footer && <Text style={{ color: t.textDim, fontSize: t.fs(12.5), lineHeight: 17, marginHorizontal: 16, marginTop: 7 }}>{footer}</Text>}
    </View>
  );
}

/**
 * One row: coloured icon tile, label, then a value and chevron, a switch, or both a
 * value and nothing else. `last` removes the divider under the final row of a group.
 */
export function Item({ icon, color, label, value, valueColor, onPress, right, last, destructive, chevron = true }) {
  const t = useTheme();
  const tappable = !!onPress;
  return (
    <Pressable
      onPress={onPress}
      disabled={!tappable}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', paddingLeft: 14, paddingRight: 12, minHeight: 48, backgroundColor: pressed && tappable ? t.surfaceAlt : t.surface })}
    >
      {!!icon && (
        <View style={{ width: 30, height: 30, borderRadius: 7, backgroundColor: color || t.accent, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
          <Text style={{ fontSize: 17 }}>{icon}</Text>
        </View>
      )}
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 48, borderBottomWidth: last ? 0 : 0.5, borderBottomColor: t.border, paddingVertical: 8 }}>
        <Text style={{ flex: 1, color: destructive ? t.danger : t.text, fontSize: t.fs(17), paddingRight: 8 }}>{label}</Text>
        {value != null && <Text numberOfLines={1} style={{ color: valueColor || t.textDim, fontSize: t.fs(16), maxWidth: 170 }}>{value}</Text>}
        {right}
        {tappable && chevron && !right && <Text style={{ color: t.textDim, fontSize: t.fs(22), marginLeft: 6, marginTop: -2 }}>›</Text>}
      </View>
    </Pressable>
  );
}

/** A choice list inside a sheet, with a tick on the current one (iOS style). */
export function Choices({ options, value, onChange }) {
  const t = useTheme();
  return (
    <View style={{ backgroundColor: t.surfaceAlt, borderRadius: 12, overflow: 'hidden' }}>
      {options.map(([key, label, sub], i) => (
        <Pressable key={String(key)} onPress={() => onChange(key)} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 13, borderTopWidth: i ? 0.5 : 0, borderTopColor: t.border }}>
          <View style={{ flex: 1 }}>
            <Text style={{ color: t.text, fontSize: t.fs(16) }}>{label}</Text>
            {!!sub && <Text style={{ color: t.textDim, fontSize: t.fs(12) }}>{sub}</Text>}
          </View>
          {String(value) === String(key) && <Text style={{ color: t.accent, fontSize: t.fs(18), fontWeight: '700' }}>✓</Text>}
        </Pressable>
      ))}
    </View>
  );
}
