/**
 * The pure part of the link between the phone app and the new website it shows (src/screens/WebApp.js; the site's side is
 * newweb/src/nativeBridge.js). Kept free of React Native so it can be tested.
 */
export const WEB_APP_URL = 'https://work-dashboard-3b728.web.app';

const ORIGIN = new URL(WEB_APP_URL).origin;

/** True for the site itself (and a blank page): only these may load inside the app; every other link opens in the phone's own browser or mail app. */
export function isOwnUrl(url) {
  const u = String(url || '');
  if (u === 'about:blank') return true;
  try { return new URL(u).origin === ORIGIN; } catch { return false; }
}

const TYPES = new Set(['token', 'signin', 'signout', 'copy', 'print', 'file', 'settings', 'classic']);

/** A message from the site: { id, type, ...data }, or null when it is not one the app answers. */
export function parseBridgeMessage(raw) {
  let m;
  try { m = JSON.parse(String(raw)); } catch { return null; }
  if (!m || typeof m !== 'object' || !Number.isFinite(Number(m.id)) || !TYPES.has(m.type)) return null;
  return { ...m, id: Number(m.id) };
}

/** The script that gives the site its answer. */
export function replyScript(id, value) {
  const json = JSON.stringify(value === undefined ? null : value).split('\u2028').join('\\u2028').split('\u2029').join('\\u2029');
  return `window.__wdNative&&window.__wdNative(${Number(id)},${json});true;`;
}

/** A file name a share target accepts. */
export const safeFileName = (name, fallback = 'file') => String(name || fallback).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || fallback;
