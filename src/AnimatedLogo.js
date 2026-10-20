import React, { useEffect, useRef } from 'react';
import { Animated, Easing, AccessibilityInfo } from 'react-native';
import Svg, { Defs, LinearGradient, Stop, Rect, Circle, Path } from 'react-native-svg';
import { BRAND } from './theme';
import { warnQuiet } from './quietCatch';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);

const RING = 189;     // the ring's length (2 * pi * 30)
const TICK = 46;      // the tick's length

/**
 * The app's logo, alive: the ring draws itself round, the tick is written in, both hold, then it starts again -
 * the uploaded favicon.svg's own animation, drawn with react-native-svg so it plays on the phone and the web
 * alike. With "reduce motion" on (or `still`) it shows the finished mark.
 */
export default function AnimatedLogo({ size = 88, still = false }) {
  const ring = useRef(new Animated.Value(still ? RING - 142 : RING)).current;
  const tick = useRef(new Animated.Value(still ? 0 : TICK)).current;
  useEffect(() => {
    if (still) return undefined;
    let loop;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled?.().then((reduce) => {
      if (cancelled) return;
      if (reduce) { ring.setValue(RING - 142); tick.setValue(0); return; }
      const ease = Easing.inOut(Easing.cubic);
      loop = Animated.loop(Animated.sequence([
        Animated.timing(ring, { toValue: RING - 142, duration: 1100, easing: ease, useNativeDriver: false }),
        Animated.timing(tick, { toValue: 0, duration: 650, easing: ease, useNativeDriver: false }),
        Animated.delay(1200),
        Animated.parallel([
          Animated.timing(ring, { toValue: RING, duration: 600, easing: ease, useNativeDriver: false }),
          Animated.timing(tick, { toValue: TICK, duration: 450, easing: ease, useNativeDriver: false }),
        ]),
      ]));
      loop.start();
    }).catch(warnQuiet('AnimatedLogo'));
    return () => { cancelled = true; if (loop) loop.stop(); };
  }, [still]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityRole="image" accessibilityLabel="Working Dashboard">
      <Defs>
        <LinearGradient id="wdLogo" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={BRAND.top} />
          <Stop offset="1" stopColor={BRAND.bottom} />
        </LinearGradient>
      </Defs>
      <Rect width="100" height="100" rx="23" fill="url(#wdLogo)" />
      <Circle cx="50" cy="50" r="30" fill="none" stroke={BRAND.mark} strokeOpacity={0.38} strokeWidth="8" />
      <AnimatedCircle cx="50" cy="50" r="30" fill="none" stroke={BRAND.mark} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${RING}`} strokeDashoffset={ring} transform="rotate(-90 50 50)" />
      <AnimatedPath d="M36 51l10 10 20-22" fill="none" stroke={BRAND.mark} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"
        strokeDasharray={`${TICK}`} strokeDashoffset={tick} />
    </Svg>
  );
}
