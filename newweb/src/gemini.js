/**
 * The Daily report's AI rewrite: Gemini through Firebase AI Logic, in this app's own Firebase project (the free Gemini
 * Developer API tier - no key in the page). The owner switches it on once: docs/NEW_WEB.md, "Gemini for the report".
 */
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { firebaseApp } from './firebase';

// Tried in order: a model that has been retired answers "not found", and the next one is used.
const MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash'];

export async function generateWithGemini(prompt) {
  const ai = getAI(firebaseApp(), { backend: new GoogleAIBackend() });
  let lastError = null;
  for (const model of MODELS) {
    try {
      const result = await getGenerativeModel(ai, { model, generationConfig: { temperature: 0.4 } }).generateContent(prompt);
      const text = result?.response?.text?.() || '';
      if (text.trim()) return text;
    } catch (e) {
      lastError = e;
      if (!/not found|404|not supported/i.test(String(e?.message || ''))) break;    // only a missing model moves on
    }
  }
  const msg = String(lastError?.message || '');
  // The first words of Google's own reason are kept, so the real cause can be seen (switched off, key blocked, template-only mode...).
  const why = msg.replace(/\s+/g, ' ').slice(0, 260);
  if (/template/i.test(msg)) throw new Error(`Gemini refused the request: ${why} - in Firebase console > AI Logic > Settings, "Enforce template-only mode" must be Unenforced.`);
  if (/api.*(not been used|disabled)|api-not-enabled|firebasevertexai.*enabled/i.test(msg)) throw new Error(`Gemini is not switched on for this project yet (Firebase console > AI Logic > Get started; see docs/NEW_WEB.md). Details: ${why}`);
  if (/PERMISSION_DENIED|403|blocked|referer|API key|API_KEY/i.test(msg)) throw new Error(`Google refused the request (permission): ${why}`);
  if (/failed to fetch|network/i.test(msg)) throw new Error('No internet connection to Gemini.');
  if (/429|quota|RESOURCE_EXHAUSTED/i.test(msg)) throw new Error('Gemini is busy (free daily limit) - try again later.');
  throw lastError || new Error('Gemini gave no answer.');
}
