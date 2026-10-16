import { useId } from 'react';

/**
 * The app's logo (check in a ring on a teal tile) as live SVG. `mode`: "draw" draws the ring and tick once and then breathes
 * softly (header, sign-in, alerts); "spin" turns the ring while something loads; "still" is static (empty states use "draw" too).
 */
export default function Logo({ size = 34, mode = 'draw', className = '' }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg className={`wd-logo wd-logo-${mode} ${className}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2fd6c1" /><stop offset="1" stopColor="#0e9487" /></linearGradient>
      </defs>
      <rect className="wd-logo-tile" width="100" height="100" rx="23" fill={`url(#g${id})`} />
      <circle className="wd-logo-ring" cx="50" cy="50" r="34" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" pathLength="100" transform="rotate(-90 50 50)" />
      <path className="wd-logo-tick" d="M35 51 L46 62 L66 38" fill="none" stroke="#fff" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" pathLength="100" />
    </svg>
  );
}
