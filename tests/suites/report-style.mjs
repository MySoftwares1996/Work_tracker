import { factsOf, checkFacts, buildStylePrompt } from '../../src/reportStyle.js';

export async function run({ ck, section }) {
  section('Report style: facts are never lost');
  ck('amounts, references and names extracted', (() => { const f = factsOf('Tech Profuse: paid Rs 45,000 for INV/2026/118 to Rami Reddy'); return f.includes('45000') && f.includes('INV/2026/118') && f.includes('Tech Profuse') && f.includes('Rami Reddy'); })());
  const model = { sections: [{ title: 'Other work completed', rows: [{ line: 'Paid Rs 45,000 to Tech Profuse against INV/2026/118' }] }] };
  ck('a rewrite keeping every fact passes', checkFacts(model, '* Released Rs 45,000 to Tech Profuse (invoice INV/2026/118).').ok);
  ck('a changed amount is caught', !checkFacts(model, '* Released Rs 54,000 to Tech Profuse (invoice INV/2026/118).').ok);
  ck('a dropped reference is caught', checkFacts(model, '* Released Rs 45,000 to Tech Profuse.').missing.some((m) => m.fact === 'INV/2026/118'));

  section('Report style: the prompt');
  const prompt = buildStylePrompt({ sections: [{ title: 'Other work completed', rows: [{ line: 'Bank follow up on SA certificate', entry: { category: 'Urgent Bank Follow Up' } }] }] }, 'DRAFT');
  ck('prompt has the rules, the items and the draft', /Keep every fact exactly/.test(prompt) && /Bank follow up on SA certificate/.test(prompt) && prompt.trim().endsWith('DRAFT'));

  section('Instructions for AI are added to the rewrite prompt');
  const m0 = { sections: [{ title: 'Other work completed', rows: [{ line: 'Reviewed the file', entry: {} }] }] };
  ck('typed instructions reach the prompt', buildStylePrompt(m0, 'draft', 'Two lines for each task, formal.').includes('Two lines for each task, formal.'));
  ck('no instructions: no extra rule', !buildStylePrompt(m0, 'draft', '  ').includes('MY INSTRUCTIONS'));
}
