/**
 * The two network-only pieces of the Daily Report: style samples (saved on
 * the Apps Script sheet so the Gemini prompt can use them) and the AI
 * rewrite itself. Everything else about the report is built on-device by
 * workingDashboardReport.js.
 */
import { cloudRequest } from './cloudSync';

export async function listReportSamples(baseUrl, opts) {
  const data = await cloudRequest(baseUrl, { action: 'listReportSamples' }, opts);
  if (!data || data.status !== 'success') throw new Error((data && data.message) || 'Could not load report samples.');
  return data.samples || [];
}

export async function saveReportSample(baseUrl, sampleText, opts) {
  const data = await cloudRequest(baseUrl, { action: 'saveReportSample', sampleText }, opts);
  if (!data || data.status !== 'success') throw new Error((data && data.message) || 'Could not save the sample.');
  return data.id;
}

export async function deleteReportSample(baseUrl, id, opts) {
  await cloudRequest(baseUrl, { action: 'deleteReportSample', id }, opts);
}

/**
 * Sends the already-built report as `draft`; the AI only restyles it. Without an Apps Script (`baseUrl` empty) the
 * app's built-in Gemini does it (aiBuiltin.js) - `prompt` already holds the rules, the style and the draft.
 */
export async function rewriteReportWithAi(baseUrl, { date, draft, itemCount, prompt, examples }, opts) {
  if (!baseUrl) {
    const { generateWithGemini } = await import('./aiBuiltin');
    return generateWithGemini(prompt);
  }
  // prompt/examples carry the style learned from your past reports; a script that reads them follows them closely.
  const data = await cloudRequest(baseUrl, { action: 'generateDailyReport', date, draft, itemCount, prompt, styleExamples: examples, instructions: prompt }, opts);
  if (!data || data.status !== 'success') throw new Error((data && data.message) || 'AI rewrite failed.');
  return data.report || '';
}
