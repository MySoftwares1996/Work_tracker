import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

/**
 * Ledger's line icons (the artboards' set): 24x24, a 1.8 stroke, round caps and joins. A string is a path, { c } a circle,
 * { r } a rectangle, { dot } a filled dot. Drawn with react-native-svg so they look the same on every phone and on the web.
 */
const SHAPES = {
  home: ['M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z'],
  tasks: [{ r: [5, 4, 14, 17, 2.5] }, 'M9 9h6M9 13h6M9 17h3'],
  report: ['M7 3h7l4 4v14H7z', 'M14 3v4h4M10 12h5M10 16h5'],
  done: [{ c: [12, 12, 9] }, 'm8 12.5 3 3 5-6'],
  more: [{ dot: [5.5, 12, 1.4] }, { dot: [12, 12, 1.4] }, { dot: [18.5, 12, 1.4] }],
  plus: ['M12 5v14M5 12h14'],
  search: [{ c: [11, 11, 6.5] }, 'm16 16 4 4'],
  close: ['m6 6 12 12M18 6 6 18'],
  chevronDown: ['m6 9 6 6 6-6'],
  chevronUp: ['m6 15 6-6 6 6'],
  chevronRight: ['m9 6 6 6-6 6'],
  back: ['m15 6-6 6 6 6'],
  list: ['M4 7h16M4 12h16M4 17h10'],
  checklist: [{ r: [4, 4, 16, 16, 3] }, 'm8 12.5 3 3 5-6'],
  clock: [{ c: [12, 12, 8.5] }, 'M12 7.5V12l3 2'],
  paperclip: ['m20 11.5-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8'],
  mail: [{ r: [3.5, 5.5, 17, 13, 2.5] }, 'm4 8 8 5 8-5'],
  calendar: [{ r: [4, 5, 16, 15, 3] }, 'M8 3v4M16 3v4M4 10h16'],
  link: ['M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1'],
  trash: ['M5 7h14M9 7V5h6v2M7 7l1 12h8l1-12'],
  gear: [{ c: [12, 12, 3] }, 'M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1'],
  download: ['M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19h14'],
  lock: [{ r: [5, 11, 14, 9, 2.5] }, 'M8 11V8a4 4 0 0 1 8 0v3'],
  alarm: [{ c: [12, 13, 7.5] }, 'M12 9.5V13l2.5 1.5', 'M5 4 3 6', 'm19 4 2 2'],
  bell: ['M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6zM10 19a2 2 0 0 0 4 0'],
  bellOff: ['M6 9a6 6 0 0 1 9.5-4.8M18 9c0 5 2 6 2 6H8M10 19a2 2 0 0 0 4 0', 'M4 4l16 16'],
  check: ['m5 12.5 4.5 4.5L19 7.5'],
  refresh: ['M20 11a8 8 0 0 0-14-4.5L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4.5L20 15M20 20v-5h-5'],
  sparkle: ['M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z', 'M19 16v4M17 18h4'],
  sliders: ['M4 7h9M17 7h3M4 17h3M11 17h9', { c: [15, 7, 2] }, { c: [9, 17, 2] }],
  phone: ['M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z'],
  copy: [{ r: [8, 8, 12, 12, 2.5] }, 'M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2'],
  edit: ['M4 20h4L19 9l-4-4L4 16z'],
  undo: ['M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3'],
  share: ['M12 16V4M7.5 8.5 12 4l4.5 4.5M5 13v6h14v-6'],
  alert: ['M12 4 3 20h18zM12 10v4M12 17h.01'],
  bank: ['M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18'],
  user: [{ c: [12, 8, 4] }, 'M4 20a8 8 0 0 1 16 0'],
  paste: [{ r: [6, 5, 12, 16, 2.5] }, 'M9 5V4h6v1M9 12h6M9 16h4'],
  moon: ['M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z'],
  star: ['m12 4 2.4 5 5.4.7-4 3.7 1 5.4-4.8-2.7-4.8 2.7 1-5.4-4-3.7 5.4-.7z'],
  repeat: ['M17 3l3 3-3 3M20 6H8a4 4 0 0 0-4 4v1M7 21l-3-3 3-3M4 18h12a4 4 0 0 0 4-4v-1'],
  folder: ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  info: [{ c: [12, 12, 9] }, 'M12 11v5M12 8h.01'],
};

export const ICON_NAMES = Object.keys(SHAPES);

export default function Icon({ name, size = 22, color = '#000', stroke = 1.8, style }) {
  const parts = SHAPES[name] || [];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" style={style} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {parts.map((p, i) => {
        if (typeof p === 'string') return <Path key={i} d={p} stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" fill="none" />;
        if (p.c) return <Circle key={i} cx={p.c[0]} cy={p.c[1]} r={p.c[2]} stroke={color} strokeWidth={stroke} fill="none" />;
        if (p.dot) return <Circle key={i} cx={p.dot[0]} cy={p.dot[1]} r={p.dot[2]} fill={color} />;
        if (p.r) return <Rect key={i} x={p.r[0]} y={p.r[1]} width={p.r[2]} height={p.r[3]} rx={p.r[4]} stroke={color} strokeWidth={stroke} fill="none" />;
        return null;
      })}
    </Svg>
  );
}
