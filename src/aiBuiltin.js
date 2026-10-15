/**
 * The Daily Report's AI rewrite without an Apps Script: Gemini through Firebase AI Logic, in the app's own
 * Firebase project. Nothing for a person to set up; the owner turns it on once (docs/NEW_USERS.md). Used on the
 * phone and the web alike (the Firebase JS SDK, src/firebaseWebConfig.js).
 */
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { firebaseApp } from './firebaseWebConfig';

// Tried in order: a model that has been retired answers "not found", and the next one is used.
const MODELS = String(process.env.EXPO_PUBLIC_GEMINI_MODELS || 'gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash')
  .split(',').map((x) => x.trim()).filter(Boolean);

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
  if (/api.*(not been used|disabled)|PERMISSION_DENIED|403/i.test(msg)) throw new Error('the AI is not switched on for this app yet (Firebase AI Logic)');
  if (/failed to fetch|network/i.test(msg)) throw new Error('no internet connection to the AI');
  if (/429|quota|RESOURCE_EXHAUSTED/i.test(msg)) throw new Error('the AI is busy (free daily limit) - try again later');
  throw lastError || new Error('the AI gave no answer');
}
