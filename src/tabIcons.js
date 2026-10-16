/**
 * Line icons in the style of iOS tab bars (SF Symbols look): one stroke width,
 * rounded joins, and a filled variant for the selected tab. Drawn with
 * react-native-svg so they look the same on every phone, unlike emoji.
 */
import React from 'react';
import Svg, { Path, Rect, Circle, Line } from 'react-native-svg';

const SHAPES = {
  // house
  dashboard: (c, on) => (
    <>
      <Path d="M3.5 11.2 12 4l8.5 7.2" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M5.8 9.6V19a1 1 0 0 0 1 1h3.7v-5.2h3v5.2h3.7a1 1 0 0 0 1-1V9.6" stroke={c} strokeWidth={1.8} strokeLinejoin="round" fill={on ? c : 'none'} fillOpacity={on ? 0.18 : 0} />
    </>
  ),
  // clipboard with lines
  register: (c, on) => (
    <>
      <Rect x={5} y={4.5} width={14} height={16} rx={2.5} stroke={c} strokeWidth={1.8} fill={on ? c : 'none'} fillOpacity={on ? 0.18 : 0} />
      <Rect x={9} y={3} width={6} height={3.4} rx={1.2} stroke={c} strokeWidth={1.6} fill={on ? c : 'none'} />
      <Line x1={8.5} y1={10.5} x2={15.5} y2={10.5} stroke={c} strokeWidth={1.7} strokeLinecap="round" />
      <Line x1={8.5} y1={14} x2={15.5} y2={14} stroke={c} strokeWidth={1.7} strokeLinecap="round" />
      <Line x1={8.5} y1={17.5} x2={12.5} y2={17.5} stroke={c} strokeWidth={1.7} strokeLinecap="round" />
    </>
  ),
  // checkmark in a circle
  done: (c, on) => (
    <>
      <Circle cx={12} cy={12} r={8.6} stroke={c} strokeWidth={1.8} fill={on ? c : 'none'} />
      <Path d="m8.2 12.3 2.6 2.6 5-5.4" stroke={on ? '#fff' : c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  // calendar
  holidays: (c, on) => (
    <>
      <Rect x={3.8} y={5.2} width={16.4} height={15} rx={2.6} stroke={c} strokeWidth={1.8} fill={on ? c : 'none'} fillOpacity={on ? 0.18 : 0} />
      <Path d="M3.8 9.6h16.4" stroke={c} strokeWidth={1.8} />
      <Line x1={8} y1={3.4} x2={8} y2={6.6} stroke={c} strokeWidth={1.8} strokeLinecap="round" />
      <Line x1={16} y1={3.4} x2={16} y2={6.6} stroke={c} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={8.3} cy={13.4} r={1.05} fill={c} />
      <Circle cx={12} cy={13.4} r={1.05} fill={c} />
      <Circle cx={15.7} cy={13.4} r={1.05} fill={c} />
      <Circle cx={8.3} cy={16.9} r={1.05} fill={c} />
      <Circle cx={12} cy={16.9} r={1.05} fill={c} />
    </>
  ),
  // gear
  config: (c, on) => (
    <>
      <Path
        d="M10.3 3.6h3.4l.5 2.3 1.6.9 2.2-.8 1.7 2.9-1.8 1.6v1.9l1.8 1.6-1.7 2.9-2.2-.8-1.6.9-.5 2.3h-3.4l-.5-2.3-1.6-.9-2.2.8-1.7-2.9 1.8-1.6v-1.9L4.3 8.9 6 6l2.2.8 1.6-.9z"
        stroke={c} strokeWidth={1.7} strokeLinejoin="round" fill={on ? c : 'none'} fillOpacity={on ? 0.18 : 0}
      />
      <Circle cx={12} cy={12} r={2.7} stroke={c} strokeWidth={1.7} fill="none" />
    </>
  ),
  // trash can
  bin: (c, on) => (
    <>
      <Path d="M4.5 6.6h15" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M9.3 6.4V4.6a1 1 0 0 1 1-1h3.4a1 1 0 0 1 1 1v1.8" stroke={c} strokeWidth={1.7} fill="none" />
      <Path d="M6.4 6.8 7.3 19a1.6 1.6 0 0 0 1.6 1.5h6.2a1.6 1.6 0 0 0 1.6-1.5l.9-12.2" stroke={c} strokeWidth={1.8} strokeLinejoin="round" fill={on ? c : 'none'} fillOpacity={on ? 0.18 : 0} />
      <Line x1={10.2} y1={10} x2={10.4} y2={17} stroke={c} strokeWidth={1.6} strokeLinecap="round" />
      <Line x1={13.8} y1={10} x2={13.6} y2={17} stroke={c} strokeWidth={1.6} strokeLinecap="round" />
    </>
  ),
  // donut chart
  overview: (c, on) => (
    <>
      <Circle cx={12} cy={12} r={8} stroke={c} strokeWidth={1.8} fill={on ? c : 'none'} fillOpacity={on ? 0.18 : 0} />
      <Path d="M12 4v8l6.4 4.7" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  // list with bullets
  list: (c, on) => (
    <>
      <Rect x={3.6} y={4.2} width={16.8} height={15.6} rx={3} stroke={c} strokeWidth={1.8} fill={on ? c : 'none'} fillOpacity={on ? 0.18 : 0} />
      <Circle cx={7.8} cy={9} r={1} fill={c} />
      <Circle cx={7.8} cy={12.2} r={1} fill={c} />
      <Circle cx={7.8} cy={15.4} r={1} fill={c} />
      <Line x1={10.4} y1={9} x2={16.6} y2={9} stroke={c} strokeWidth={1.7} strokeLinecap="round" />
      <Line x1={10.4} y1={12.2} x2={16.6} y2={12.2} stroke={c} strokeWidth={1.7} strokeLinecap="round" />
      <Line x1={10.4} y1={15.4} x2={14.6} y2={15.4} stroke={c} strokeWidth={1.7} strokeLinecap="round" />
    </>
  ),
  // chain link
  links: (c) => (
    <>
      <Path d="M10.2 13.8a3.6 3.6 0 0 0 5.1 0l3-3a3.6 3.6 0 0 0-5.1-5.1l-1 1" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M13.8 10.2a3.6 3.6 0 0 0-5.1 0l-3 3a3.6 3.6 0 0 0 5.1 5.1l1-1" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  // bar chart
  chart: (c, on) => (
    <>
      <Rect x={4.4} y={12} width={3.6} height={7.6} rx={1.2} stroke={c} strokeWidth={1.7} fill={on ? c : 'none'} fillOpacity={on ? 0.25 : 0} />
      <Rect x={10.2} y={7.4} width={3.6} height={12.2} rx={1.2} stroke={c} strokeWidth={1.7} fill={on ? c : 'none'} fillOpacity={on ? 0.25 : 0} />
      <Rect x={16} y={4.4} width={3.6} height={15.2} rx={1.2} stroke={c} strokeWidth={1.7} fill={on ? c : 'none'} fillOpacity={on ? 0.25 : 0} />
    </>
  ),
  // funnel
  filter: (c, on) => (
    <Path d="M4.2 5.2h15.6l-6 7.2v5.6l-3.6 1.8v-7.4z" stroke={c} strokeWidth={1.8} strokeLinejoin="round" fill={on ? c : 'none'} fillOpacity={on ? 0.18 : 0} />
  ),
  // open book
  book: (c, on) => (
    <>
      <Path d="M12 6.6c-2-1.4-4.8-1.9-8-1.6v13.2c3.2-.3 6 .2 8 1.6 2-1.4 4.8-1.9 8-1.6V5c-3.2-.3-6 .2-8 1.6z" stroke={c} strokeWidth={1.8} strokeLinejoin="round" fill={on ? c : 'none'} fillOpacity={on ? 0.18 : 0} />
      <Line x1={12} y1={6.6} x2={12} y2={19.2} stroke={c} strokeWidth={1.7} />
    </>
  ),
  // target
  target: (c, on) => (
    <>
      <Circle cx={12} cy={12} r={8.2} stroke={c} strokeWidth={1.8} fill={on ? c : 'none'} fillOpacity={on ? 0.18 : 0} />
      <Circle cx={12} cy={12} r={4.6} stroke={c} strokeWidth={1.7} fill="none" />
      <Circle cx={12} cy={12} r={1.4} fill={c} />
    </>
  ),
  // rising line
  trend: (c, on) => (
    <>
      <Path d="M3.8 17.2 9.4 11.6l3.4 3.4 7-7" stroke={c} strokeWidth={on ? 2.3 : 1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M15.4 8h4.4v4.4" stroke={c} strokeWidth={on ? 2.3 : 1.9} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  // clock
  clock: (c, on) => (
    <>
      <Circle cx={12} cy={12} r={8.4} stroke={c} strokeWidth={1.8} fill={on ? c : 'none'} fillOpacity={on ? 0.18 : 0} />
      <Path d="M12 7.4V12l3.2 2" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  // heart with a pulse line
  heart: (c, on) => (
    <>
      <Path d="M12 19.6s-7.6-4.4-7.6-9.8A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.6 2.2c0 5.4-7.6 9.8-7.6 9.8z" stroke={c} strokeWidth={1.8} strokeLinejoin="round" fill={on ? c : 'none'} fillOpacity={on ? 0.18 : 0} />
      <Path d="M7 12.4h2.6l1.3-2.2 2 4 1.3-1.8H17" stroke={c} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  // document with lines (Report)
  report: (c, on) => (
    <>
      <Path d="M6.5 3.5h7.2l4.3 4.3V19a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 19V5a1.5 1.5 0 0 1 1.5-1.5z" stroke={c} strokeWidth={1.8} strokeLinejoin="round" fill={on ? c : 'none'} fillOpacity={on ? 0.18 : 0} />
      <Path d="M13.5 3.8V8h4.2" stroke={c} strokeWidth={1.7} strokeLinejoin="round" fill="none" />
      <Line x1={8.5} y1={12.5} x2={15.5} y2={12.5} stroke={c} strokeWidth={1.7} strokeLinecap="round" />
      <Line x1={8.5} y1={16} x2={15.5} y2={16} stroke={c} strokeWidth={1.7} strokeLinecap="round" />
    </>
  ),
  // three dots (More)
  more: (c) => (
    <>
      <Circle cx={5.5} cy={12} r={1.7} fill={c} />
      <Circle cx={12} cy={12} r={1.7} fill={c} />
      <Circle cx={18.5} cy={12} r={1.7} fill={c} />
    </>
  ),
  // lab flask
  flask: (c, on) => (
    <>
      <Path d="M9.6 3.8h4.8M10.4 3.8v5.4L5 18.2a1.4 1.4 0 0 0 1.2 2h11.6a1.4 1.4 0 0 0 1.2-2l-5.4-9V3.8" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <Path d="M7.4 14.6h9.2l1.6 2.8a.6.6 0 0 1-.5.9H6.3a.6.6 0 0 1-.5-.9z" fill={c} fillOpacity={on ? 0.9 : 0.35} />
    </>
  ),
};

export const TAB_ICON_NAMES = Object.keys(SHAPES);

export default function TabIcon({ name, color, size = 26, active = false }) {
  const shape = SHAPES[name];
  if (!shape) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {shape(color, active)}
    </Svg>
  );
}
