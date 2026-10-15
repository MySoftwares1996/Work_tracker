/** A typed web address as a full link: https:// added when missing; '' when it is not an address. */
export function normalizeLink(raw) {
  const v = String(raw || '').trim();
  if (!v || /\s/.test(v)) return '';
  const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(v) ? v : `https://${v}`;
  return /^https?:\/\/[^/.]+\.[^/]+/i.test(url) || /^https?:\/\/localhost/i.test(url) ? url : '';
}

/** Folders in use, sorted; links with no folder are not listed here. */
export function linkFolders(links) {
  return [...new Set((links || []).map((x) => String(x.folder || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

const unescapeHtml = (v) => String(v).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
const escapeHtml = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Links from a browser bookmarks file (Netscape HTML, as Chrome / Edge / Firefox export it, folders become
 * `folder`), or from this tab's own export. Returns [{ title, url, folder }]; entries that are not web addresses are skipped.
 */
export function parseBookmarks(text) {
  const out = [];
  const stack = [];
  let pending = '';
  const re = /<(\/?)(H3|DL|A)\b([^>]*)>([^<]*)/gi;
  let m;
  while ((m = re.exec(String(text || '')))) {
    const tag = m[2].toUpperCase();
    if (tag === 'H3' && !m[1]) pending = unescapeHtml(m[4]).trim();
    else if (tag === 'DL') { if (m[1]) stack.pop(); else stack.push(pending); pending = ''; }
    else if (tag === 'A' && !m[1]) {
      const href = /href\s*=\s*"([^"]*)"/i.exec(m[3]);
      const url = href ? normalizeLink(unescapeHtml(href[1])) : '';
      if (url) out.push({ title: unescapeHtml(m[4]).trim() || url, url, folder: stack.filter(Boolean).slice(-1)[0] || '' });
    }
  }
  return out;
}

/** The links as a bookmarks file any browser can import; folders are kept. */
export function bookmarksHtml(links) {
  const row = (x) => `    <DT><A HREF="${escapeHtml(x.url)}">${escapeHtml(x.title)}</A>`;
  const loose = (links || []).filter((x) => !x.folder);
  const parts = ['<!DOCTYPE NETSCAPE-Bookmark-file-1>', '<TITLE>Bookmarks</TITLE>', '<H1>Bookmarks</H1>', '<DL><p>', ...loose.map(row)];
  linkFolders(links).forEach((f) => { parts.push(`    <DT><H3>${escapeHtml(f)}</H3>`, '    <DL><p>', ...(links || []).filter((x) => x.folder === f).map((x) => '    ' + row(x)), '    </DL><p>'); });
  parts.push('</DL><p>');
  return parts.join('\n');
}

/** Adds `incoming` links to `links`, skipping addresses already kept. Returns { links, added }. */
export function addLinks(links, incoming, idPrefix = 'lnk') {
  const have = new Set((links || []).map((x) => x.url.toLowerCase()));
  const fresh = [];
  (incoming || []).forEach((x, i) => {
    const k = x.url.toLowerCase();
    if (have.has(k)) return;
    have.add(k);
    fresh.push({ id: `${idPrefix}-${Date.now().toString(36)}-${i}`, title: x.title, url: x.url, ...(x.folder ? { folder: x.folder } : {}) });
  });
  return { links: [...(links || []), ...fresh], added: fresh.length };
}

/**
 * The web tools that follow the account (Links, task templates, the two AI instruction boxes, Meeting mode) - kept in
 * users/<uid>/meta/tools. Each item carries its OWN timestamp ("stamps"), so editing templates on the phone and links on
 * the website at the same time keeps both: per item, the newer copy wins. An older document with only `ts` counts as one
 * stamp for every item.
 */
export const TOOL_KEYS = ['links', 'templates', 'reportAiNotes', 'reportAiNotesSummary', 'holdUntil'];

/** The synced tool values of a Working Dashboard record. */
export const toolsValue = (wd = {}) => ({
  links: Array.isArray(wd.links) ? wd.links : [],
  templates: Array.isArray(wd.templates) ? wd.templates : [],
  reportAiNotes: wd.reportAiNotes || '',
  reportAiNotesSummary: wd.reportAiNotesSummary || '',
  holdUntil: Number((wd.alerts || {}).holdUntil) || 0,
});

/** The stamps after an edit: every item whose value changed gets `now`; the rest keep theirs. */
export function stampChanges(before, after, stamps = {}, now = Date.now()) {
  const out = { ...(stamps || {}) };
  TOOL_KEYS.forEach((k) => { if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) out[k] = now; });
  return out;
}

const cleanLink = (x) => ({ id: String(x.id || x.url), title: String(x.title || x.url), url: String(x.url), ...(x.folder ? { folder: String(x.folder) } : {}) });

/**
 * What to take from the account's copy: { patch: { links?, templates?, ... }, stamps } - only the items whose remote stamp is
 * newer than this device's - or null when nothing is newer. `localStamps` is this device's { item: ms }.
 */
export function toolsFromRemote(remote, localStamps = {}) {
  if (!remote) return null;
  const rs = remote.stamps && typeof remote.stamps === 'object' ? remote.stamps : {};
  const ts = Number(remote.ts) || 0;
  const patch = {};
  const stamps = { ...(localStamps || {}) };
  TOOL_KEYS.forEach((k) => {
    const at = Number(rs[k]) || ts;
    if (!at || at <= (Number(stamps[k]) || 0)) return;
    if (k === 'links') patch.links = Array.isArray(remote.links) ? remote.links.filter((x) => x && x.url).map(cleanLink) : [];
    else if (k === 'templates') patch.templates = Array.isArray(remote.templates) ? remote.templates.filter((x) => x && x.id && x.name) : [];
    else if (k === 'holdUntil') patch.holdUntil = Number(remote.holdUntil) || 0;
    else patch[k] = typeof remote[k] === 'string' ? remote[k] : '';
    stamps[k] = at;
  });
  return Object.keys(patch).length ? { patch, stamps } : null;
}

/** web.app: saves text as a file download. */
export function downloadText(name, text, type = 'text/html') {
  const d = globalThis.document;
  if (!d) return false;
  const url = globalThis.URL.createObjectURL(new globalThis.Blob([text], { type: `${type};charset=utf-8` }));
  const a = d.createElement('a');
  a.href = url; a.download = name;
  d.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => globalThis.URL.revokeObjectURL(url), 10000);
  return true;
}

/** web.app: asks for a file and resolves with its text ('' when cancelled). */
export function pickTextFile(accept = '.html,.htm,.json,.txt') {
  return new Promise((resolve) => {
    const d = globalThis.document;
    if (!d) return resolve('');
    const input = d.createElement('input');
    input.type = 'file'; input.accept = accept;
    input.onchange = () => { const f = input.files && input.files[0]; if (!f) return resolve(''); const r = new globalThis.FileReader(); r.onload = () => resolve(String(r.result || '')); r.onerror = () => resolve(''); r.readAsText(f); };
    input.click();
  });
}
