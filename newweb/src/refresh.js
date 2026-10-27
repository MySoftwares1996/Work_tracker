import { syncNow } from './store';

/**
 * The Refresh button. First it asks the server which build of the site is live: when it is not the one running in this tab (a stale
 * copy kept by the browser or the service worker), the old caches are cleared and the page reloads on the new build. Otherwise it
 * re-reads every task and list from the server now.
 */
const runningEntry = () => [...document.scripts].map((s) => s.src).find((src) => /\/assets\/index-[^/]*\.js/.test(src)) || '';

export async function newVersionAvailable() {
  try {
    const res = await fetch('/index.html', { cache: 'no-store' });
    const live = (await res.text()).match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
    const mine = runningEntry();
    return !!(live && mine && !mine.endsWith(live[0]));
  } catch { return false; }
}

export async function reloadOnNewBuild() {
  try {
    const regs = (navigator.serviceWorker && (await navigator.serviceWorker.getRegistrations())) || [];
    await Promise.all(regs.map((r) => r.unregister()));
    if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
  } catch { /* reload anyway */ }
  window.location.reload();
}

/** 'reload' (a new build is on its way), 'synced' (data re-read from the server) or 'offline'. */
export async function refreshAll() {
  if (await newVersionAvailable()) { setTimeout(reloadOnNewBuild, 600); return 'reload'; }
  return (await syncNow()) ? 'synced' : 'offline';
}
