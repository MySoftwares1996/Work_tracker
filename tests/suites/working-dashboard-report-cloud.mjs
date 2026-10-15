import { listReportSamples, saveReportSample, deleteReportSample, rewriteReportWithAi } from '../../src/workingDashboardReportCloud.js';

const fakeFetch = (text) => async () => ({ text: async () => text });
const url = 'https://script.google.com/macros/s/x/exec';

export async function run({ ck, section }) {
  section('Working Dashboard Report Cloud: report samples');
  const samples = await listReportSamples(url, { fetchImpl: fakeFetch('{"status":"success","samples":[{"id":"rs_1","sampleText":"Dear Sir,..."}]}') });
  ck('listReportSamples returns the saved samples', samples.length === 1 && samples[0].sampleText === 'Dear Sir,...');
  const id = await saveReportSample(url, 'A new sample', { fetchImpl: fakeFetch('{"status":"success","id":"rs_2"}') });
  ck('saveReportSample returns the new id', id === 'rs_2');
  let threw = false;
  try { await saveReportSample(url, '', { fetchImpl: fakeFetch('{"status":"error","message":"empty"}') }); } catch (e) { threw = true; }
  ck('a rejected save throws', threw);
  await deleteReportSample(url, 'rs_1', { fetchImpl: fakeFetch('{"status":"success"}') });
  ck('deleteReportSample resolves without throwing', true);

  section('Working Dashboard Report Cloud: AI rewrite');
  const text = await rewriteReportWithAi(url, { date: '2026-10-03', draft: 'Daily Activity Report...', itemCount: 4 }, { fetchImpl: fakeFetch('{"status":"success","report":"Rewritten report text"}') });
  ck('rewriteReportWithAi returns the rewritten text', text === 'Rewritten report text');
  let aiThrew = false;
  try { await rewriteReportWithAi(url, { date: '2026-10-03', draft: '', itemCount: 0 }, { fetchImpl: fakeFetch('{"status":"error","message":"GEMINI_API_KEY is not set"}') }); } catch (e) { aiThrew = true; }
  ck('a missing API key surfaces as a thrown error', aiThrew);
}
