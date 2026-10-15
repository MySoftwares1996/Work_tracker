/**
 * Client for the Google Apps Script webhook.
 * The same deployment serves the Work Tracker sync and (optionally) a full
 * app backup, keyed by profile name so a phone and a laptop share one tab.
 */

/**
 * Every request carries the shared secret from settings.apiToken. The webhook
 * is deployed as "Anyone", so without it anybody holding the URL could pull
 * your expense history and read your Gmail.
 */
let authToken = '';
export const setApiToken = (tok) => { authToken = tok || ''; };

async function call(url, body, ms = 20000) {
  if (!url) throw new Error('No Apps Script URL set');
  body = { ...body, token: authToken };
  // The timer is cleared once the request settles: left running, it rejected a promise nobody was
  // listening to any more after every successful call.
  let timer;
  const res = await Promise.race([
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids the CORS preflight Apps Script rejects
      body: JSON.stringify(body),
    }),
    new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('Sync timed out')), ms); }),
  ]).finally(() => clearTimeout(timer));
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error('Script replied with something that is not JSON'); }
  if (json.error) throw new Error(json.error);
  return json;
}

/** Last-write-wins on updatedAt, done server side. */
export const pushTasks = (url, profile, tasks) =>
  call(url, { action: 'pushTasks', profile, tasks });

export const pullTasks = (url, profile) =>
  call(url, { action: 'pullTasks', profile });

export const restoreProfile = (url, profile) =>
  call(url, { action: 'restore', profile });

export const pushBackup = (url, profile, payload) =>
  call(url, { action: 'pushBackup', profile, payload });

export const pullBackup = (url, profile) =>
  call(url, { action: 'pullBackup', profile });

export const fetchMail = (url, max = 15) =>
  call(url, { action: 'fetchMail', max });

export const mailBody = (url, id) =>
  call(url, { action: 'mailBody', id });

export const markMailRead = (url, id) =>
  call(url, { action: 'markRead', id });

export const ping = (url) => call(url, { action: 'ping' }, 10000);

export const getAdvice = (url, prompt, payload) =>
  call(url, { action: 'getAdvice', prompt, data: payload }, 45000);

/** Merge two task lists by id, newest updatedAt wins. */
export function mergeById(local, remote) {
  const map = new Map();
  for (const row of [...local, ...remote]) {
    const prev = map.get(row.id);
    if (!prev || new Date(row.updatedAt || 0) > new Date(prev.updatedAt || 0)) map.set(row.id, row);
  }
  return [...map.values()];
}
