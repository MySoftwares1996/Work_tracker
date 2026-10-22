/** Line icons (24px grid, 2px stroke) used by the screens instead of emoji. `Icon name="check" size={16}`. */
const PATHS = {
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  refresh: <path d="M20 11a8 8 0 0 0-14-4.5L4 9M4 4v5h5M4 13a8 8 0 0 0 14 4.5L20 15M20 20v-5h-5" />,
  x: <path d="m6 6 12 12M18 6 6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chevL: <path d="m15 6-6 6 6 6" />,
  chevR: <path d="m9 6 6 6-6 6" />,
  chevD: <path d="m6 9 6 6 6-6" />,
  list: <path d="M4 7h16M4 12h16M4 17h10" />,
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  checklist: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="m8 12.5 3 3 5-6" /></>,
  mail: <><rect x="3.5" y="5.5" width="17" height="13" rx="2.5" /><path d="m4 8 8 5 8-5" /></>,
  chat: <path d="M5 5h14v10H9l-4 4z" />,
  bell: <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6zM10 19a2 2 0 0 0 4 0" />,
  bellOff: <><path d="M6 9a6 6 0 0 1 9.5-4.8M18 9c0 3 .7 4.5 1.3 5.3M4 15s2-1 2-6M10 19a2 2 0 0 0 4 0" /><path d="m4 4 16 16" /></>,
  alarm: <><circle cx="12" cy="13" r="7.5" /><path d="M12 9v4l2.5 1.5M4 5.5 7 3M20 5.5 17 3" /></>,
  template: <><rect x="6" y="4.5" width="12" height="16" rx="2.5" /><path d="M9.5 4.5v-1h5v1M9.5 10h5M9.5 14h5" /></>,
  trash: <><path d="M4 7h16M9.5 7V4.5h5V7" /><path d="m6.5 7 .8 12.5h9.4L17.5 7" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></>,
  repeat: <><path d="M5 11V9.5A2.5 2.5 0 0 1 7.5 7H19l-3-3M19 13v1.5a2.5 2.5 0 0 1-2.5 2.5H5l3 3" /></>,
  sparkle: <path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.5l-1.9-5.7L4.5 11 10.1 9zM18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />,
  copy: <><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" /></>,
  calendar: <><rect x="3.5" y="4.5" width="17" height="16" rx="2.5" /><path d="M8 3v3M16 3v3M3.5 10h17" /></>,
  inbox: <><path d="M21 12h-5l-1.5 2.5h-5L8 12H3" /><path d="M5.5 5.5 3 12v5.5A1.5 1.5 0 0 0 4.5 19h15a1.5 1.5 0 0 0 1.5-1.5V12l-2.5-6.5A1.5 1.5 0 0 0 17.1 4.5H6.9a1.5 1.5 0 0 0-1.4 1z" /></>,
  link: <><path d="M10 13.5a4 4 0 0 0 5.7.3l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.1 1.1" /><path d="M14 10.5a4 4 0 0 0-5.7-.3l-2.8 2.8a4 4 0 0 0 5.7 5.7l1.1-1.1" /></>,
  circleCheck: <><circle cx="12" cy="12" r="9" /><path d="m8 12.5 3 3 5-6" /></>,
  pencil: <path d="m5 19 1-4 9.5-9.5 3 3L9 18zM13.5 7.5l3 3" />,
};

export default function Icon({ name, size = 16, className = '', strokeWidth = 2 }) {
  return (
    <svg className={`ico ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name] || PATHS.check}
    </svg>
  );
}
