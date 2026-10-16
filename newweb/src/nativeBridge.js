/**
 * The link to the Android app when this site runs inside it (the app shows the site in a built-in browser and answers these messages:
 * src/screens/WebApp.js). In an ordinary browser none of it is active. A request is { id, type, ...data } sent to the app; the app
 * answers by calling window.__wdNative(id, value).
 */
export const inApp = () => typeof window !== 'undefined' && !!window.ReactNativeWebView;

const waiting = new Map();
let seq = 0;

if (typeof window !== 'undefined') {
  window.__wdNative = (id, value) => {
    const done = waiting.get(id);
    if (done) { waiting.delete(id); done(value); }
  };
}

/** Sends a request to the app; resolves with its answer, or null when there is no app or it did not answer in time. */
export function askNative(type, data = {}, timeoutMs = 120000) {
  return new Promise((resolve) => {
    if (!inApp()) { resolve(null); return; }
    seq += 1;
    const id = seq;
    const timer = setTimeout(() => { waiting.delete(id); resolve(null); }, timeoutMs);
    waiting.set(id, (value) => { clearTimeout(timer); resolve(value); });
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ id, type, ...data })); } catch { clearTimeout(timer); waiting.delete(id); resolve(null); }
  });
}
