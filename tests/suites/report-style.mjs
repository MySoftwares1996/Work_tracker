import { parseReport, learnStyle, examplesFor, factsOf, checkFacts, buildStylePrompt } from '../../src/reportStyle.js';

export async function run({ ck, section }) {
  const past = `Daily Activity Report — Fri, 2 Oct 2026

Payments (2)
* Tech Profuse: Released payment of Rs 45,000 against invoice INV/2026/118

Other work completed
* Coordinated with HDFC Bank for LC opening documents and shared the checklist with the team.

* Followed up with Rami Reddy on the pending statutory auditor certificate.

Routine daily activities
* Checked bank balances and updated the daily cash position.`;

  section('Report style: reading a past report');
  const p = parseReport(past);
  ck('title found', /Daily Activity Report/.test(p.title));
  ck('sections and headings read', p.sections.map((s) => s.heading).join('|') === 'Payments|Other work completed|Routine daily activities');
  ck('bullets read without the bullet mark', p.sections[1].lines[0].startsWith('Coordinated with HDFC'));

  section('Report style: learning and examples');
  const st = learnStyle([past, { sampleText: '1. Followed up with ICICI Bank on the BG renewal.\n2. Prepared the MIS for September.' }]);
  ck('both samples learned (string and {sampleText})', st.samples === 2 && st.lines.length === 6);
  ck('openers learned', st.openers.includes('Followed up'));
  const ex = examplesFor({ section: 'Followed up / in progress', category: 'Bank Follow Up', text: 'Pending SA certificate: follow up with bank' }, st, 2);
  ck('closest past lines picked for a follow-up item', ex.length === 2 && ex.some((l) => /Followed up/.test(l)));
  ck('no samples -> no examples', examplesFor({ text: 'x' }, learnStyle([]), 2).length === 0);

  section('Report style: facts are never lost');
  ck('amounts, references and names extracted', (() => { const f = factsOf('Tech Profuse: paid Rs 45,000 for INV/2026/118 to Rami Reddy'); return f.includes('45000') && f.includes('INV/2026/118') && f.includes('Tech Profuse') && f.includes('Rami Reddy'); })());
  const model = { sections: [{ title: 'Other work completed', rows: [{ line: 'Paid Rs 45,000 to Tech Profuse against INV/2026/118' }] }] };
  ck('a rewrite keeping every fact passes', checkFacts(model, '* Released Rs 45,000 to Tech Profuse (invoice INV/2026/118).').ok);
  ck('a changed amount is caught', !checkFacts(model, '* Released Rs 54,000 to Tech Profuse (invoice INV/2026/118).').ok);
  ck('a dropped reference is caught', checkFacts(model, '* Released Rs 45,000 to Tech Profuse.').missing.some((m) => m.fact === 'INV/2026/118'));

  section('Report style: the prompt');
  const prompt = buildStylePrompt({ sections: [{ title: 'Other work completed', rows: [{ line: 'Bank follow up on SA certificate', entry: { category: 'Urgent Bank Follow Up' } }] }] }, 'DRAFT', st);
  ck('prompt has the rules, the per-item examples, the samples and the draft', /Keep every fact exactly/.test(prompt) && /Write it the way I wrote/.test(prompt) && /MY PAST REPORTS/.test(prompt) && prompt.trim().endsWith('DRAFT'));

  section('Instructions for AI are added to the rewrite prompt');
  const m0 = { sections: [{ title: 'Other work completed', rows: [{ line: 'Reviewed the file', entry: {} }] }] };
  ck('typed instructions reach the prompt', buildStylePrompt(m0, 'draft', null, 'Two lines for each task, formal.').includes('Two lines for each task, formal.'));
  ck('no instructions: no extra rule', !buildStylePrompt(m0, 'draft', null, '  ').includes('MY INSTRUCTIONS'));
}
