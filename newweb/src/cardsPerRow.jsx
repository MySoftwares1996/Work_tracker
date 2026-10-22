import { useState } from 'react';

/**
 * "Cards per row": each list tab (Register, Completed, Bin, Links) remembers how many cards sit side by side - Auto (as many as
 * fit, the default) or a fixed 1 to 6. The choice is kept on this computer per tab; a narrow window shows fewer when they cannot fit.
 */
export const PER_ROW_OPTIONS = ['auto', '1', '2', '3', '4', '5', '6'];
const storeKey = (tab) => `wd-cols-${tab}`;

export const readPerRow = (tab) => {
  try { const v = localStorage.getItem(storeKey(tab)); return PER_ROW_OPTIONS.includes(v) ? v : 'auto'; } catch { return 'auto'; }
};

/** [value, setValue] for one tab. */
export function useCardsPerRow(tab) {
  const [value, set] = useState(() => readPerRow(tab));
  const change = (v) => {
    if (!PER_ROW_OPTIONS.includes(v)) return;
    set(v);
    try { localStorage.setItem(storeKey(tab), v); } catch { /* not remembered */ }
  };
  return [value, change];
}

/** The className and style that make a `.grid` hold at most `value` cards per row. */
export const gridProps = (value) => (value === 'auto' || !value
  ? { className: 'grid' }
  : { className: 'grid fixed-cols', style: { '--n': Number(value) } });

/** The small drop-down that sets it. */
export function PerRow({ value, onChange }) {
  return (
    <label className="perrow">
      <span>Per row</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label="Cards per row">
        {PER_ROW_OPTIONS.map((o) => <option key={o} value={o}>{o === 'auto' ? 'Auto' : `${o} ${o === '1' ? 'card' : 'cards'}`}</option>)}
      </select>
    </label>
  );
}
