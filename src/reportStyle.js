/**
 * Guards the AI rewrite of the Daily Activity Report and builds its instruction.
 *
 * Nothing here invents report content. The facts always come from the report the app builds from the entries.
 * `checkFacts` guards accuracy: every amount, number, reference and name in today's items must still be in the AI's
 * text, or the rewrite is thrown away and the standard report is kept.
 */

/** The facts that must survive a rewrite: amounts and other numbers, references (ABC/123, #12), and capitalised names. */
export function factsOf(line) {
  const s = String(line || '');
  const nums = (s.match(/\d[\d,]*(?:\.\d+)?/g) || []).map((n) => n.replace(/,/g, '')).filter((n) => n.length >= 2);
  const refs = s.match(/\b[A-Z]{2,}[A-Z0-9/_-]*\d[A-Z0-9/_-]*\b|#\s?\d+/g) || [];
  // A capitalised run of 2+ words is a name ("Tech Profuse", "Rami Reddy") - minus a sentence-opening verb or "Rs".
  // Only real verbs and filler are stripped - a blanket "ends in -ed" rule would cut the name "Ahmed" ("Ahmed Khan").
  const NOT_NAME = /^(?:Paid|Sent|Made|Got|Did|Rs|The|This|That|Other|Daily|Routine|Prepared|Processed|Initiated|Followed|Updated|Shared|Verified|Released|Submitted|Completed|Reviewed|Coordinated|Provided|Modified|Reconciled|Checked|Received|Approved|Arranged|Collected|Filed|Cleared|Raised|Requested|Booked|Closed|Reported|Recorded|Uploaded|Scheduled|Visited|Discussed|[A-Z][a-z]{3,}ing)$/;
  const names = (s.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g) || []).map((n) => {
    const w = n.split(/\s+/);
    while (w.length && NOT_NAME.test(w[0])) w.shift();
    return w.length >= 2 ? w.join(' ') : '';
  }).filter(Boolean);
  return [...new Set([...nums, ...refs.map((r) => r.replace(/\s/g, '')), ...names])];
}

const escRe = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Every fact of every item must appear in the AI text. Returns { ok, missing: [{ line, fact }] }. */
export function checkFacts(model, aiText) {
  const hay = String(aiText || '').replace(/,(?=\d{2,3}\b)/g, '').replace(/\s+/g, ' ');
  const lower = hay.toLowerCase();
  const missing = [];
  model.sections.forEach((s) => s.rows.forEach((r) => {
    factsOf(r.line).forEach((f) => {
      // Whole tokens only: the fact 250 is not in 2500 or 250.50, and "Rami Reddy" is not inside "Ramiz Reddys".
      const ok = /^\d/.test(f)
        ? new RegExp(`(?<![\\d.])${escRe(f)}(?!\\d|\\.\\d)`).test(hay)
        : new RegExp(`(?<![a-z0-9])${escRe(f.toLowerCase())}(?![a-z0-9])`).test(lower);
      if (!ok) missing.push({ line: r.line, fact: f });
    });
  }));
  return { ok: !missing.length, missing };
}

/** The full instruction for the AI: the rules, the person's own instructions and the draft. */
export function buildStylePrompt(model, draft, extra = '') {
  const items = [];
  model.sections.forEach((s) => s.rows.forEach((r) => items.push({ section: s.title, category: r.entry && r.entry.category, text: r.line })));
  const perItem = items.map((it, i) => `${i + 1}. [${it.section}${it.category ? ` / ${it.category}` : ''}] ${it.text}`).join('\n');
  return [
    'You rewrite my Daily Activity Report in MY OWN writing style.',
    'Rules - follow every one:',
    '1. Keep every item. One "* " bullet per item, in the same section, in the same order. Do not merge, split, add or drop items.',
    '2. Keep every fact exactly: amounts, numbers, dates, names, party/vendor names, references, ticket and invoice numbers. Never invent anything that is not in the draft.',
    '3. Payment lines must stay word for word.',
    '4. Keep the title line and the section headings exactly as in the draft.',
    '4b. Do NOT put the task name in front of a bullet (no "Task name:" prefix). Each bullet in Other work completed, Followed up and Other activities is one professional sentence about what was done, like "Prepared daily, monthly, and annual Cash Inflow & Outflow Statements to track fund movements and support budgeting, cash planning, and management decision-making." When the draft bullet is only a short task name, write that sentence from it, in my style, using any notes or narration in the draft - but no amounts, dates, names or references that are not in the draft.',
    '5. Only change wording: copy my phrasing, tense, verbs and level of detail from the examples. ',
    '7. Reply with the report text only - no preface, no notes.',
    extra && extra.trim() ? `8. MY INSTRUCTIONS FOR THIS REPORT (they decide the wording, tone and length of each bullet, e.g. two lines per task; still one "* " bullet per item, and rules 1-3 win if they clash):\n${extra.trim()}` : '',
    '',
    'TODAY\'S ITEMS (with how I wrote similar ones before):',
    perItem || '(none)',
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
