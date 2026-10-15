import { useEffect, useRef, useState } from 'react';
import { angleToHour, angleToMinute, dialAngle, joinTime, pad, splitTime } from './data';

const SIZE = 264;
const C = SIZE / 2;
const R_NUM = 98;       // radius of the numbers
const R_HAND = 98;
const polar = (deg, r) => [C + r * Math.sin((deg * Math.PI) / 180), C - r * Math.cos((deg * Math.PI) / 180)];

/**
 * An Android style round clock: pick the hour on the dial, then the minute (the dial turns to minutes by itself),
 * with AM / PM beside the time. Click or drag on the dial. value and the result are 24-hour "HH:MM".
 */
export default function ClockPicker({ value, onPick, onClear, onClose }) {
  const start = splitTime(value) || (() => { const d = new Date(); return { h12: d.getHours() % 12 || 12, minute: Math.round(d.getMinutes() / 5) * 5 % 60, pm: d.getHours() >= 12 }; })();
  const [h12, setH12] = useState(start.h12);
  const [minute, setMinute] = useState(start.minute);
  const [pm, setPm] = useState(start.pm);
  const [mode, setMode] = useState('hour');
  const svg = useRef(null);
  const dragging = useRef(false);

  useEffect(() => { const k = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } }; window.addEventListener('keydown', k, true); return () => window.removeEventListener('keydown', k, true); }, [onClose]);

  const fromPointer = (e, final) => {
    const r = svg.current.getBoundingClientRect();
    const k = SIZE / r.width;
    const deg = dialAngle((e.clientX - r.left) * k - C, (e.clientY - r.top) * k - C);
    if (mode === 'hour') { setH12(angleToHour(deg)); if (final) setMode('minute'); }
    else setMinute(angleToMinute(deg));
  };
  const down = (e) => { dragging.current = true; svg.current.setPointerCapture(e.pointerId); fromPointer(e, false); };
  const move = (e) => { if (dragging.current) fromPointer(e, false); };
  const up = (e) => { if (!dragging.current) return; dragging.current = false; fromPointer(e, true); };

  const handDeg = mode === 'hour' ? (h12 % 12) * 30 : minute * 6;
  const [hx, hy] = polar(handDeg, R_HAND);
  const marks = mode === 'hour' ? Array.from({ length: 12 }, (_, i) => ({ v: i + 1, deg: (i + 1) * 30, label: String(i + 1) })) : Array.from({ length: 12 }, (_, i) => ({ v: i * 5, deg: i * 30, label: pad(i * 5) }));
  const sel = mode === 'hour' ? h12 : minute;
  // A minute that is not on a number (23) shows as a dot on the rim, like the Android clock.
  const offMark = mode === 'minute' && minute % 5 !== 0;

  return (
    <div className="overlay clock-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="clock" role="dialog" aria-modal="true" aria-label="Pick a time">
        <div className="clock-head">
          <div className="clock-time" role="group" aria-label="Time">
            <button type="button" className={mode === 'hour' ? 'on' : ''} onClick={() => setMode('hour')} aria-label={`Hour ${h12}`}>{pad(h12)}</button>
            <span>:</span>
            <button type="button" className={mode === 'minute' ? 'on' : ''} onClick={() => setMode('minute')} aria-label={`Minute ${minute}`}>{pad(minute)}</button>
          </div>
          <div className="clock-ampm" role="group" aria-label="AM or PM">
            <button type="button" className={!pm ? 'on' : ''} onClick={() => setPm(false)}>AM</button>
            <button type="button" className={pm ? 'on' : ''} onClick={() => setPm(true)}>PM</button>
          </div>
        </div>
        <svg ref={svg} className="dial" viewBox={`0 0 ${SIZE} ${SIZE}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} role="img" aria-label={mode === 'hour' ? 'Hour dial' : 'Minute dial'}>
          <circle cx={C} cy={C} r={C - 2} className="dial-face" />
          <line x1={C} y1={C} x2={hx} y2={hy} className="dial-hand" />
          <circle cx={C} cy={C} r="4" className="dial-pin" />
          <circle cx={hx} cy={hy} r="21" className="dial-knob" />
          {offMark && <circle cx={hx} cy={hy} r="3" className="dial-dot" />}
          {marks.map((m) => {
            const [x, y] = polar(m.deg, R_NUM);
            const on = !offMark && m.v === sel;
            return <text key={m.v} x={x} y={y} textAnchor="middle" dominantBaseline="central" className={`dial-num${on ? ' on' : ''}`}>{m.label}</text>;
          })}
        </svg>
        <div className="clock-foot">
          <button type="button" className="btn ghost" onClick={onClear}>Clear</button>
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button type="button" className="btn primary" onClick={() => onPick(joinTime(h12, minute, pm))}>OK</button>
        </div>
      </div>
    </div>
  );
}
