/** Alert settings and the list of alerts already shown, kept on this device (localStorage, never required). */
const SETTINGS = 'wd-alert-settings';
const HANDLED = 'wd-alerts-handled';
const DEFAULTS = { popup: true, sound: true, notify: false, quietWhileVisible: false, snoozeHigh: 15, snoozeMedium: 30, snoozeLow: 60 };

export function loadAlertSettings() {
  try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(SETTINGS)) || {}) }; } catch { return { ...DEFAULTS }; }
}
export function saveAlertSettings(s) {
  try { localStorage.setItem(SETTINGS, JSON.stringify(s)); } catch { /* not remembered */ }
}

/** The Snooze length (minutes) an alert starts with for a task's priority: set in Config > Alerts (High 15, Medium 30, Low 60 unless changed). */
export function snoozeFor(priority, settings = loadAlertSettings()) {
  const k = /^high/i.test(priority || '') ? 'snoozeHigh' : /^low/i.test(priority || '') ? 'snoozeLow' : 'snoozeMedium';
  const v = Number(settings[k]);
  return v > 0 ? v : 30;
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
    if (!loadAlertSettings().notify) return;       // Config > Alerts > Desktop notification is off
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const n = new Notification(title, { body, tag: 'wd-alert' });
    n.onclick = () => { window.focus(); n.close(); if (onClick) onClick(); };
  } catch { /* not shown */ }
}

const EXPLAINER_SNOOZE = 'wd-notify-explainer-until';
const WEEK = 7 * 86400000;
/** True when the person pressed "Not now" on the notification explainer less than 7 days ago (the page then does not offer it by itself). */
export function explainerSnoozed(now = Date.now()) {
  try { return Number(localStorage.getItem(EXPLAINER_SNOOZE)) > now; } catch { return false; }
}
export function snoozeExplainer(now = Date.now()) {
  try { localStorage.setItem(EXPLAINER_SNOOZE, String(now + WEEK)); } catch { /* not remembered */ }
}
/** Whether the page may offer the explainer by itself: notifications are supported, not decided in the browser, switched off in Config and not snoozed. */
export function shouldOfferExplainer() {
  try { return 'Notification' in window && Notification.permission === 'default' && !loadAlertSettings().notify && !explainerSnoozed(); } catch { return false; }
}
/** The browser's own permission prompt. Call it only after the in-page explainer (NotifyExplainer) was accepted. */
export async function askNotificationPermission() {
  try { return 'Notification' in window ? await Notification.requestPermission() : 'denied'; } catch { return 'denied'; }
}
