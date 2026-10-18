import { useEffect, useRef } from 'react';
import { askNotificationPermission, snoozeExplainer } from './alerts';

/** A small card shown before the browser's own permission prompt. "Allow alerts" asks the browser; "Not now" is remembered for 7 days. */
export default function NotifyExplainer({ onDone }) {
  const allow = useRef(null);
  const card = useRef(null);
  const later = () => { snoozeExplainer(); onDone('later'); };
  useEffect(() => {
    const before = document.activeElement;
    allow.current && allow.current.focus();
    const key = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); later(); }
      if (e.key === 'Tab' && card.current) {
        const f = [...card.current.querySelectorAll('button')];
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    };
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('keydown', key, true); if (before && before.focus && document.contains(before)) before.focus(); };
  }, []);
  const accept = async () => onDone(await askNotificationPermission());
  return (
    <div className="modal-overlay" onClick={later}>
      <div ref={card} className="modal-card notify-card" role="dialog" aria-modal="true" aria-labelledby="notify-title" onClick={(e) => e.stopPropagation()}>
        <div className="notify-body">
          <span className="empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg></span>
          <h2 id="notify-title">Allow alerts?</h2>
          <p>Allow alerts so due tasks pop up even when this tab is in the background.</p>
        </div>
        <div className="modal-foot">
          <button type="button" ref={allow} className="btn primary" onClick={accept}>Allow alerts</button>
          <button type="button" className="btn" onClick={later}>Not now</button>
        </div>
      </div>
    </div>
  );
}
