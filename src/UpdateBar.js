import React from 'react';
import { View, Text } from 'react-native';
import { useTheme } from './theme';
import { fmtClock, estimateRemainingMs, fmtLeft } from './updateProgress';

/**
 * The bar at the top while the app updates itself: what it is doing, a progress bar, the time passed and the estimated
 * time left. phase: 'checking' | 'downloading' | 'ready' | 'error'. progress: 0..1 or undefined (unknown: the bar slides).
 */
export default function UpdateBar({ phase, progress, elapsedMs, top = 0 }) {
  const t = useTheme();
  const known = typeof progress === 'number' && progress > 0;
  const pct = known ? Math.min(100, Math.round(progress * 100)) : 0;
  const left = phase === 'downloading' ? fmtLeft(estimateRemainingMs(progress, elapsedMs)) : '';
  const title = { checking: 'Checking for a new version…', downloading: 'Updating the app…', ready: 'Update ready - restarting', error: 'The update did not finish - it will try again' }[phase] || '';
  const bad = phase === 'error';
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={`${title} ${known ? `${pct}%` : ''} ${left}`.trim()} pointerEvents="none"
      style={{ position: 'absolute', left: 12, right: 12, top: top + 8, zIndex: 50, padding: 12, borderRadius: t.radius, backgroundColor: t.surface, borderWidth: 1, borderColor: bad ? t.danger : t.border, gap: 8, ...t.shadow }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <Text style={{ flex: 1, color: bad ? t.danger : t.text, fontWeight: '800', fontSize: t.fs(14) }} numberOfLines={1}>{title}</Text>
        {phase === 'downloading' && known && <Text style={{ color: t.accent, fontWeight: '800', fontSize: t.fs(14) }}>{pct}%</Text>}
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surfaceAlt, overflow: 'hidden' }}>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: bad ? t.danger : t.accent, width: phase === 'ready' ? '100%' : known ? `${pct}%` : `${15 + ((Math.floor((elapsedMs || 0) / 400) % 10) * 8)}%`, marginLeft: known || phase === 'ready' ? 0 : `${(Math.floor((elapsedMs || 0) / 400) % 10) * 8}%` }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={{ color: t.textDim, fontSize: t.fs(12) }}>⏱ {fmtClock(elapsedMs)} elapsed</Text>
        <Text style={{ color: t.textDim, fontSize: t.fs(12) }}>{left}</Text>
      </View>
    </View>
  );
}
