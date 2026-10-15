/** Alert settings and the list of alerts already shown, kept on this device (localStorage, never required). */
const SETTINGS = 'wd-alert-settings';
const HANDLED = 'wd-alerts-handled';
const DEFAULTS = { popup: true, sound: true, notify: false };

export function loadAlertSettings() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(SETTINGS)) || {}) }; } catch { return { ...DEFAULTS }; }
}
export function saveAlertSettings(s) {
  try { localStorage.setItem(SETTINGS, JSON.stringify(s)); } catch { /* not remembered */ }
}

/** Keys of alerts already shown (and when), so reloading the page does not show them again. Older than two days are dropped. */
export function loadHandled() {
  try {
    const raw = JSON.parse(localStorage.getItem(HANDLED)) || {};
    const keep = Date.now() - 2 * 86400000;
    return new Map(Object.entries(raw).filter(([, at]) => Number(at) > keep));
  } catch { return new Map(); }
}
export function saveHandled(map) {
  try { localStorage.setItem(HANDLED, JSON.stringify(Object.fromEntries(map))); } catch { /* not remembered */ }
}

let audio;
/** Three short beeps. Browsers only allow sound after the person has clicked or typed on the page once. */
export function playAlertSound() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    [0, 0.28, 0.56].forEach((at) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = 'sine'; o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, audio.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + at + 0.22);
      o.connect(g); g.connect(audio.destination);
      o.start(audio.currentTime + at); o.stop(audio.currentTime + at + 0.25);
    });
  } catch { /* no sound */ }
}

/** A desktop notification (when allowed and the page is in the background). */
export function showNotification(title, body, onClick) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const n = new Notification(title, { body, tag: 'wd-alert' });
    n.onclick = () => { window.focus(); n.close(); if (onClick) onClick(); };
  } catch { /* not shown */ }
}
export async function askNotificationPermission() {
  try { return 'Notification' in window ? await Notification.requestPermission() : 'denied'; } catch { return 'denied'; }
}
