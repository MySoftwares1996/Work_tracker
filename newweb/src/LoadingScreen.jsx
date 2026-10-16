import { useEffect, useRef, useState } from 'react';
import Logo from './Logo';

const TIPS = [
  'Click a task\'s mail subject to copy it and open the task.',
  'The 📋 button on a card saves it as a template for new entries.',
  'The Report tab can rewrite your daily report with Gemini.',
  'Pick your colours in Config > Appearance.',
  'Mark a task Done, or DAR to put it in the daily report.',
  'Tap the logo - it likes it.',
];
const CHEERS = ['Ready when you are!', 'Nice tap!', 'Almost there…', 'Tasks incoming…', 'Whee!', 'Getting your day in order…'];
const reduced = () => typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The loading screen after a refresh: the logo draws itself, an orbit runs around it, it tilts towards the pointer and answers a tap
 * (spin + sparkles + a cheer). Two honest steps - "Signed in" (done once Google has answered) and "Loading your tasks" - and a tip that changes.
 * `stage`: 'auth' while checking the sign-in, 'data' while the tasks arrive. `full` fills the window (sign-in check), otherwise it sits in the page.
 */
export default function LoadingScreen({ stage = 'data', full = false }) {
  const box = useRef(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0, mx: 50, my: 50 });
  const [taps, setTaps] = useState(0);
  const [sparks, setSparks] = useState([]);
  const [cheer, setCheer] = useState('');
  const [tip, setTip] = useState(0);

  useEffect(() => { const id = setInterval(() => setTip((n) => (n + 1) % TIPS.length), 3200); return () => clearInterval(id); }, []);
  useEffect(() => { if (!cheer) return undefined; const id = setTimeout(() => setCheer(''), 1500); return () => clearTimeout(id); }, [cheer]);

  const move = (e) => {
    if (reduced() || !box.current) return;
    const r = box.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width;
    const py = (e.clientY - r.top) / r.height;
    setTilt({ x: (0.5 - py) * 26, y: (px - 0.5) * 26, mx: px * 100, my: py * 100 });
  };
  const leave = () => setTilt({ x: 0, y: 0, mx: 50, my: 50 });
  const tap = () => {
    setTaps((n) => n + 1);
    setCheer(CHEERS[(taps + 1) % CHEERS.length]);
    if (reduced()) return;
    const made = Array.from({ length: 16 }, (_, i) => ({ id: `${Date.now()}-${i}`, a: (360 / 16) * i + Math.random() * 12, d: 70 + Math.random() * 40, c: ['#2fd6c1', '#ffd166', '#ff6b8a', '#8b5cf6', '#4ea1ff'][i % 5] }));
    setSparks(made);
    setTimeout(() => setSparks([]), 900);
  };

  const authDone = stage !== 'auth';
  return (
    <div className={`loadscreen${full ? ' full' : ''}`} role="status" aria-live="polite" aria-label="Loading">
      <div className="ls-stage" ref={box} onPointerMove={move} onPointerLeave={leave}>
        <div className="ls-glow" aria-hidden="true" style={{ left: `${tilt.mx}%`, top: `${tilt.my}%` }} />
        <button type="button" className={`ls-logo${taps ? ' tapped' : ''}`} key={taps} onClick={tap} aria-label="The logo - tap it"
          style={{ transform: `perspective(600px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)` }}>
          <span className="ls-orbit" aria-hidden="true"><i /></span>
          <span className="ls-orbit ls-orbit2" aria-hidden="true"><i /></span>
          <Logo size={120} mode="draw" />
        </button>
        {sparks.map((s) => <i key={s.id} className="ls-spark" aria-hidden="true" style={{ '--a': `${s.a}deg`, '--d': `${s.d}px`, background: s.c }} />)}
        {cheer && <span className="ls-cheer" aria-hidden="true">{cheer}</span>}
      </div>
      <h2 className="ls-title">Working Dashboard</h2>
      <ol className="ls-steps">
        <li className={authDone ? 'done' : 'now'}><span className="ls-dot">{authDone ? '✓' : ''}</span>{authDone ? 'Signed in' : 'Signing you in'}</li>
        <li className={authDone ? 'now' : ''}><span className="ls-dot" />Loading your tasks</li>
      </ol>
      <div className="ls-bar" aria-hidden="true"><span /></div>
      <p className="ls-tip" key={tip}>{TIPS[tip]}</p>
    </div>
  );
}
