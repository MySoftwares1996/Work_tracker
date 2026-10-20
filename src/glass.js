import React from 'react';
import { View, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Defs, RadialGradient, LinearGradient, Stop, Rect, Circle } from 'react-native-svg';
import { useTheme } from './theme';

/**
 * The Glass theme's pieces (APK only; every other theme has t.glass null and these draw nothing or step aside).
 * Drawn with react-native-svg, which the app already has, so the look needs no new native library.
 * - GlassBackdrop: the screen's soft colour glows, behind everything.
 * - Sheen: the shine on the top half of a frosted panel (glassPanel gives the panel its fill and bright rim).
 * - GlossFill: a glossy tile's gradient and shine, like an app icon (glossTile gives its bright rim).
 */

let uid = 0;
const useId = (prefix) => React.useRef(`${prefix}${(uid += 1)}`).current;

/** The frosted panel's fill and rim, to merge into a card's style. Null outside the Glass theme. */
export const glassPanel = (t, strong) => (t.glass ? { backgroundColor: strong ? t.glass.fillStrong : t.glass.fill, borderColor: t.glass.rim, borderWidth: 1, overflow: 'hidden' } : null);

/** A glossy tile's own style: no fill or line of its own, GlossFill draws both. Null outside the Glass theme. */
export const glossTile = (t) => (t.glass ? { backgroundColor: 'transparent', borderWidth: 0, overflow: 'hidden' } : null);

/** The whole screen's backdrop: the base colour and a few large soft glows. */
export function GlassBackdrop() {
  const t = useTheme();
  const { width, height } = useWindowDimensions();
  const id = useId('gb');
  if (!t.glass) return null;
  const g = t.glass;
  const side = Math.max(width, height);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        <Defs>
          {g.orbs.map(([colour], i) => (
            <RadialGradient key={i} id={`${id}-${i}`} cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={colour} stopOpacity={g.glow} />
              <Stop offset="1" stopColor={colour} stopOpacity={0} />
            </RadialGradient>
          ))}
        </Defs>
        <Rect x={0} y={0} width={width} height={height} fill={g.base} />
        {g.orbs.map(([, x, y, r], i) => <Circle key={i} cx={x * width} cy={y * height} r={r * side} fill={`url(#${id}-${i})`} />)}
      </Svg>
    </View>
  );
}

/** The shine across the top half of a frosted panel. Put it first inside the panel. */
export function Sheen({ radius = 0 }) {
  const t = useTheme();
  const id = useId('gs');
  if (!t.glass) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <Svg width="100%" height="100%">
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.glass.sheen} stopOpacity={t.glass.sheenOpacity} />
            <Stop offset="1" stopColor={t.glass.sheen} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="55%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}

/** A glossy tile's gradient (tone: blue, red, amber, green, purple, hero), its shine and bright rim. Put it first inside the tile. */
export function GlossFill({ tone = 'blue', radius = 0 }) {
  const t = useTheme();
  const id = useId('gf');
  const [size, setSize] = React.useState(null);
  if (!t.glass) return null;
  const [top, bottom] = t.glass.tiles[tone] || t.glass.tiles.blue;
  return (
    <View pointerEvents="none" onLayout={(e) => setSize(e.nativeEvent.layout)} style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      {!!size && <Svg width={size.width} height={size.height}>
        <Defs>
          <LinearGradient id={`${id}-f`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={top} />
            <Stop offset="1" stopColor={bottom} />
          </LinearGradient>
          <LinearGradient id={`${id}-s`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={t.glass.sheen} stopOpacity={t.glass.tileSheen} />
            <Stop offset="1" stopColor={t.glass.sheen} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={size.width} height={size.height} fill={`url(#${id}-f)`} />
        <Rect x={4} y={3} width={Math.max(0, size.width - 8)} height={size.height * 0.45} rx={Math.max(0, radius - 4)} fill={`url(#${id}-s)`} />
        <Rect x={1} y={1} width={Math.max(0, size.width - 2)} height={Math.max(0, size.height - 2)} rx={Math.max(0, radius - 1)} fill="none" stroke={t.glass.tileRim} strokeWidth={2} />
      </Svg>}
    </View>
  );
}
