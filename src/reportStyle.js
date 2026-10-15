/**
 * Learns how YOU write your Daily Activity Report from reports you wrote
 * before, and turns that into instructions + examples for the AI rewrite.
 *
 * Nothing here invents report content. The facts always come from the
 * report the app builds from your entries; your old reports only teach the
 * wording. For every item in today's report the closest lines you wrote
 * before (same task type / similar words) are picked as examples, so the AI
 * copies how you phrase a payment, a follow-up, a bank visit, and so on.
 *
 * `checkFacts` then guards accuracy: every amount, number, reference and
 * name in today's items must still be in the AI's text, or the rewrite is
 * thrown away and the standard report is kept.
 */

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const STOP = new Set('a an and the of to for in on at by with from as is was were be been has have had this that it its into via per our your their we i my me'.split(' '));
const BULLET = /^\s*(?:[*•\-–·▪●]|\d{1,3}[.)])\s+/;

export const tokens = (s) => clean(s).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(' ').filter((w) => w.length > 2 && !STOP.has(w));

/** One past report -> { title, sections: [{ heading, lines }] } (bullets or plain lines). */
export function parseReport(text) {
  const rows = String(text || '').replace(/\r/g, '').split('\n');
  const sections = [];
  let title = '';
  let cur = null;
  rows.forEach((raw) => {
    const line = raw.trim();
    if (!line) return;
    if (BULLET.test(line)) {
      if (!cur) { cur = { heading: '', lines: [] }; sections.push(cur); }
      cur.lines.push(clean(line.replace(BULLET, '')));
      return;
    }
    // A short line without a full stop is a heading; the very first line is the report's title.
    const looksHeading = line.length <= 70 && !/[.!?]$/.test(line);
    if (!title && !sections.length && /report|activity|daily|\d{4}/i.test(line)) { title = line; return; }
    if (looksHeading) { cur = { heading: clean(line.replace(/[:\-–]+$/, '').replace(/\s*\(\d+\)$/, '')), lines: [] }; sections.push(cur); return; }
    if (!cur) { cur = { heading: '', lines: [] }; sections.push(cur); }
    cur.lines.push(clean(line));
  });
  return { title, sections: sections.filter((s) => s.lines.length) };
}

/**
 * Everything learned from the samples: the headings you use, how you open a
 * line, average line length, and every past line (for picking examples).
 */
export function learnStyle(samples = []) {
  const texts = samples.map((s) => (typeof s === 'string' ? s : s && s.sampleText)).filter(Boolean);
  const lines = [];
  const headings = new Map();
  const openers = new Map();
  texts.forEach((txt, si) => {
    parseReport(txt).sections.forEach((sec) => {
      if (sec.heading) headings.set(sec.heading, (headings.get(sec.heading) || 0) + 1);
      sec.lines.forEach((l) => {
        lines.push({ text: l, section: sec.heading, sample: si, tok: tokens(`${sec.heading} ${l}`) });
        const first = l.split(' ').slice(0, 2).join(' ').replace(/[^A-Za-z ]/g, '').trim();
        if (first) openers.set(first, (openers.get(first) || 0) + 1);
      });
    });
  });
  const avgWords = lines.length ? Math.round(lines.reduce((n, l) => n + l.text.split(' ').length, 0) / lines.length) : 0;
  const top = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k]) => k);
  return { samples: texts.length, sampleTexts: texts, lines, headings: top(headings, 12), openers: top(openers, 10), avgWords };
}

/** The k past lines most like this item: same section/task type and shared words weigh most. */
export function examplesFor(item, style, k = 2) {
  if (!style || !style.lines.length) return [];
  const want = new Set(tokens(`${item.section || ''} ${item.category || ''} ${item.text || ''}`));
  const cat = String(item.category || '').toLowerCase();
  const sec = String(item.section || '').toLowerCase();
  const scored = style.lines.map((l) => {
    let hit = 0;
    l.tok.forEach((w) => { if (want.has(w)) hit++; });
    const union = new Set([...l.tok, ...want]).size || 1;
    let score = hit / union;
    if (cat && l.text.toLowerCase().includes(cat)) score += 0.25;
    if (sec && l.section && l.section.toLowerCase() === sec) score += 0.2;
    return { l, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  const out = [];
  const seen = new Set();
  for (const { l } of scored) {
    if (seen.has(l.text)) continue;
    seen.add(l.text);
    out.push(l.text);
    if (out.length >= k) break;
  }
  return out;
}

/** The facts that must survive a rewrite: amounts and other numbers, references (ABC/123, #12), and capitalised names. */
export function factsOf(line) {
  const s = String(line || '');
  const nums = (s.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => n.replace(/,/g, '')).filter((n) => n.length >= 2);
  const refs = s.match(/\b[A-Z]{2,}[A-Z0-9/_-]*\d[A-Z0-9/_-]*\b|#\s?\d+/g) || [];
  // A capitalised run of 2+ words is a name ("Tech Profuse", "Rami Reddy") - minus a sentence-opening verb or "Rs".
  const NOT_NAME = /^(?:[A-Z][a-z]+(?:ed|ing)|Paid|Sent|Made|Got|Did|Rs|The|This|That|Other|Daily|Routine)$/;
  const names = (s.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) || []).map((n) => {
    const w = n.split(/\s+/);
    while (w.length && NOT_NAME.test(w[0])) w.shift();
    return w.length >= 2 ? w.join(' ') : '';
  }).filter(Boolean);
  return [...new Set([...nums, ...refs.map((r) => r.replace(/\s/g, '')), ...names])];
}

/** Every fact of every item must appear in the AI text. Returns { ok, missing: [{ line, fact }] }. */
export function checkFacts(model, aiText) {
  const hay = String(aiText || '').replace(/,(?=\d{2,3}\b)/g, '').replace(/\s+/g, ' ');
  const lower = hay.toLowerCase();
  const missing = [];
  model.sections.forEach((s) => s.rows.forEach((r) => {
    factsOf(r.line).forEach((f) => {
      const ok = /^\d/.test(f) ? hay.includes(f) : lower.includes(f.toLowerCase());
      if (!ok) missing.push({ line: r.line, fact: f });
    });
  }));
  return { ok: !missing.length, missing };
}

/**
 * The full instruction for the AI: your rules, your past reports, and for
 * each of today's items the lines you wrote before that it should imitate.
 */
export function buildStylePrompt(model, draft, style, extra = '') {
  const items = [];
  model.sections.forEach((s) => s.rows.forEach((r) => items.push({ section: s.title, category: r.entry && r.entry.category, text: r.line })));
  const perItem = items.map((it, i) => {
    const ex = examplesFor(it, style, 2);
    return `${i + 1}. [${it.section}${it.category ? ` / ${it.category}` : ''}] ${it.text}${ex.length ? `\n   Write it the way I wrote: ${ex.map((e) => `"${e}"`).join(' | ')}` : ''}`;
  }).join('\n');
  const samples = style && style.samples ? style.lines.length : 0;
  return [
    'You rewrite my Daily Activity Report in MY OWN writing style.',
    'Rules - follow every one:',
    '1. Keep every item. One "* " bullet per item, in the same section, in the same order. Do not merge, split, add or drop items.',
    '2. Keep every fact exactly: amounts, numbers, dates, names, party/vendor names, references, ticket and invoice numbers. Never invent anything that is not in the draft.',
    '3. Payment lines must stay word for word.',
    '4. Keep the title line and the section headings exactly as in the draft.',
    '4b. Do NOT put the task name in front of a bullet (no "Task name:" prefix). Each bullet in Other work completed, Followed up and Other activities is one professional sentence about what was done, like "Prepared daily, monthly, and annual Cash Inflow & Outflow Statements to track fund movements and support budgeting, cash planning, and management decision-making." When the draft bullet is only a short task name, write that sentence from it, in my style, using any notes or narration in the draft - but no amounts, dates, names or references that are not in the draft.',
    '5. Only change wording: copy my phrasing, tense, verbs and level of detail from the examples. ' + (style && style.avgWords ? `My lines are usually about ${style.avgWords} words.` : ''),
    style && style.openers.length ? `6. I usually start lines like: ${style.openers.map((o) => `"${o}…"`).join(', ')}.` : '',
    '7. Reply with the report text only - no preface, no notes.',
    extra && extra.trim() ? `8. MY INSTRUCTIONS FOR THIS REPORT (they decide the wording, tone and length of each bullet, e.g. two lines per task; still one "* " bullet per item, and rules 1-3 win if they clash):\n${extra.trim()}` : '',
    '',
    'TODAY\'S ITEMS (with how I wrote similar ones before):',
    perItem || '(none)',
    '',
    samples ? `MY PAST REPORTS (style reference only - do not copy their facts):\n${(style.sampleTexts || []).slice(0, 4).join('\n\n---\n\n')}` : '',
    '',
    'DRAFT TO REWRITE:',
    draft,
  ].filter((x) => x !== '').join('\n');
}

/**
 * The weekly / monthly summary rewrite: same rules as the daily report - nothing dropped, no number changed - but one
 * short, professional paragraph or bullet list for management. `extra` = the person's own instructions.
 */
export function buildSummaryPrompt(draft, extra = '', kind = 'week') {
  return [
    `You rewrite my ${kind === 'month' ? 'monthly' : 'weekly'} activity summary for my manager.`,
    'Rules - follow every one:',
    '1. Keep every number, amount, count, date and name exactly. Never invent anything that is not in the draft.',
    '2. Keep the first line (the title with the period) as it is.',
    '3. Write in a professional, formal tone: short sentences, clear headings if the draft has them, bullets with "* ".',
    '4. Reply with the summary text only - no preface, no notes.',
    extra && String(extra).trim() ? `5. MY INSTRUCTIONS (they decide tone, length and layout; rules 1-2 win if they clash):\n${String(extra).trim()}` : '',
    '',
    'DRAFT TO REWRITE:',
    draft,
  ].filter((x) => x !== '').join('\n');
}

/** Numbers of 2+ digits in the draft that the rewrite lost - an empty list means it is safe to use. */
export function summaryNumbersLost(draft, ai) {
  const hay = String(ai || '').replace(/,(?=\d{2,3}\b)/g, '');
  const want = (String(draft || '').replace(/,(?=\d{2,3}\b)/g, '').match(/\d{2,}(?:\.\d+)?/g) || []);
  return [...new Set(want)].filter((n) => !hay.includes(n));
}
