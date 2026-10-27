import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Circle } from 'react-native-svg';
import { useTheme } from './theme';
import { GRADS } from './themeTokens';
import Icon from './icons';

/*
 * The "Gradient bento" look (G): gradient fills drawn with react-native-svg (already in the build, so this ships as a phone
 * update - no new native library), gradient tiles and the colour icon of a category.
 */

let seq = 0;
/**
 * A gradient filling its parent (top-left to bottom-right). `colors`: two or three stops.
 * The box is measured (onLayout) and the SVG drawn at that exact size: on Android a "100%" SVG inside an absolute-fill view
 * was drawn smaller than its box, leaving the tiles half filled and shifted (owner's screenshots, 27 Oct).
 */
export function Gradient({ colors, radius = 0, vertical = false }) {
  const id = React.useRef(`wdg${(seq += 1)}`).current;
  const [size, setSize] = React.useState(null);
  const stops = colors && colors.length ? colors : GRADS.brand;
  const onLayout = (e) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || Math.abs(size.w - width) > 0.5 || Math.abs(size.h - height) > 0.5) setSize({ w: width, h: height });
  };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} onLayout={onLayout}>
      {!!size && size.w > 0 && size.h > 0 && (
        <Svg width={size.w} height={size.h}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2={vertical ? '0' : '1'} y2="1">
              {stops.map((c, i) => <Stop key={i} offset={stops.length === 1 ? 0 : i / (stops.length - 1)} stopColor={c} />)}
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width={size.w} height={size.h} rx={Math.min(radius, size.w / 2, size.h / 2)} ry={Math.min(radius, size.w / 2, size.h / 2)} fill={`url(#${id})`} />
        </Svg>
      )}
    </View>
  );
}

/**
 * A box with a gradient behind its children; with onPress it is a button. `style` places the box (flex, width, height,
 * margins), `contentStyle` lays out what is inside (padding, alignment). The coloured lift sits on the outer view.
 */
export function GradBox({ colors, radius = 22, style, contentStyle, children, onPress, glow = true, accessibilityLabel, accessibilityRole, accessibilityState }) {
  const t = useTheme();
  // The coloured lift needs a solid background on the view that casts it (Android draws a smeared box otherwise).
  const shadow = glow && colors ? { ...t.glow(colors[colors.length - 1]), backgroundColor: colors[colors.length - 1] } : null;
  const base = colors && colors.length ? colors[colors.length - 1] : GRADS.brand[1];
  const inner = (
    <View style={[{ flexGrow: 1, borderRadius: radius, overflow: 'hidden', backgroundColor: base }, contentStyle]}>
      <Gradient colors={colors} radius={radius} />
      {children}
    </View>
  );
  if (onPress) {
    return (
      <Pressable onPress={onPress} accessibilityRole={accessibilityRole || 'button'} accessibilityLabel={accessibilityLabel} accessibilityState={accessibilityState}
        style={({ pressed }) => [{ borderRadius: radius }, shadow, style, { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}>
        {inner}
      </Pressable>
    );
  }
  return <View style={[{ borderRadius: radius }, shadow, style]}>{inner}</View>;
}

/** A square gradient icon (More's rows, the count tiles). */
export function GradIcon({ name, colors, size = 40, radius, iconSize, glow = true }) {
  const t = useTheme();
  const r = radius != null ? radius : Math.round(size * 0.32);
  return (
    <GradBox colors={colors} radius={r} glow={glow} style={{ width: size, height: size }} contentStyle={{ alignItems: 'center', justifyContent: 'center' }}>
      {/* In a View: the icon stays above the gradient in the browser too. */}
      <View><Icon name={name} size={iconSize || Math.round(size * 0.5)} color={t.onTile} stroke={2.2} /></View>
    </GradBox>
  );
}

// A category's icon and colour: known kinds by name, the rest by a stable hash of the name.
const KINDS = [
  [/pay|vendor|invoice|tds|salary|imprest|advance/i, 'report', 0],
  [/gst|tax|compliance|statutory|return|audit/i, 'alert', 1],
  [/bank|recon|treasury|lc|fd/i, 'bank', 2],
  [/approv|sign|review/i, 'done', 3],
  [/mail|follow|call|meeting/i, 'mail', 4],
  [/hr|people|staff|employee/i, 'user', 5],
];
const hash = (s) => [...String(s || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export function categoryLook(t, category) {
  const name = String(category || '').trim();
  const hit = KINDS.find(([re]) => re.test(name));
  const grads = t.catGrads;
  if (!name) return { icon: 'tasks', colors: t.grad.slate };
  if (hit) return { icon: hit[1], colors: grads[hit[2] % grads.length] };
  return { icon: 'folder', colors: grads[hash(name) % grads.length] };
}
/** The category's gradient icon (task rows, the form's category grid). */
export function CatIcon({ category, size = 44 }) {
  const t = useTheme();
  const { icon, colors } = categoryLook(t, category);
  return <GradIcon name={icon} colors={colors} size={size} />;
}

/** A progress ring (Home's hero card): `pct` 0-100 in white over a faint track, the percent in the middle. */
export function Ring({ pct = 0, size = 74, stroke = 8, label }) {
  const t = useTheme();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.28)" strokeWidth={stroke} fill="none" />
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={t.onTile} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - p / 100)} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <Text style={{ color: t.onTile, fontWeight: '800', fontSize: t.fs(15) }}>{label != null ? label : `${Math.round(p)}%`}</Text>
    </View>
  );
}
