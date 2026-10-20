import { useId } from 'react';

/**
 * The app's mark: a check in a ring on a rounded square (the Ledger look: dark green tile, mint ring), as live SVG.
 * `mode`: "draw" draws the ring and tick once and then breathes softly; "spin" turns the ring while something loads; "still" is static.
 * `tone="mint"` is the light tile with a dark ring, for use on a dark panel (the sign-in screen).
 */
export default function Logo({ size = 36, mode = 'draw', tone = 'dark', className = '' }) {
  const id = useId().replace(/:/g, '');
  const mint = tone === 'mint';
  return (
    <svg className={`wd-logo wd-logo-${mode} ${className}`} id={`l${id}`} width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <rect className="wd-logo-tile" width="100" height="100" rx="33" style={{ fill: mint ? 'var(--mint)' : 'var(--primary-dark)' }} />
      <g transform="translate(50 50) scale(2.9) translate(-12 -12)" style={{ stroke: mint ? 'var(--primary-dark)' : 'var(--mint)' }} fill="none" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <circle className="wd-logo-ring" cx="12" cy="12" r="8.5" pathLength="100" transform="rotate(-90 12 12)" />
        <path className="wd-logo-tick" d="m8.5 12.5 2.5 2.5 4.5-5" pathLength="100" />
      </g>
    </svg>
  );
}
