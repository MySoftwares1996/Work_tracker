/**
 * The Daily report's AI rewrite: Gemini through Firebase AI Logic, in this app's own Firebase project (the free Gemini
 * Developer API tier - no key in the page). The owner switches it on once: docs/NEW_WEB.md, "Gemini for the report".
 */
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai';
import { firebaseApp } from './firebase';
import { geminiText } from './data';

// Tried in order: a model that has been retired answers "not found", and the next one is used.
// Google retires models; its own error named gemini-3.8-flash as the current one (2.0 and older answer "no longer available").
// VITE_GEMINI_MODELS (comma separated) overrides the list at build time without a code change.
const MODELS = String(import.meta.env.VITE_GEMINI_MODELS || 'gemini-3.8-flash,gemini-flash-latest,gemini-2.5-flash,gemini-2.5-flash-lite')
  .split(',').map((x) => x.trim()).filter(Boolean);

// A model that is gone ("not found") or too busy ("high demand", 500 / 503) is skipped; the list is then tried once more after a pause.
const SKIP = /not found|404|not supported|no longer available|\b500\b|\b503\b|high demand|overloaded|UNAVAILABLE|try again later/i;

export async function generateWithGemini(prompt) {
  const ai = getAI(firebaseApp(), { backend: new GoogleAIBackend() });
  let lastError = null;
  for (let pass = 0; pass < 2; pass += 1) {
    if (pass) await new Promise((r) => setTimeout(r, 3000));
    for (const model of MODELS) {
      try {
        const result = await getGenerativeModel(ai, { model, generationConfig: { temperature: 0.4 } }).generateContent(prompt);
        const text = result?.response?.text?.() || '';
        if (text.trim()) return text;
      } catch (e) {
        lastError = e;
        if (!SKIP.test(String(e?.message || ''))) pass = 99;      // any other error (key, permission, quota) will not change on a retry
        if (pass === 99) break;
      }
    }
    if (pass === 99) break;
  }
  const msg = String(lastError?.message || '');
  // The first words of Google's own reason are kept, so the real cause can be seen (switched off, key blocked, template-only mode...).
  const why = msg.replace(/\s+/g, ' ').slice(0, 260);
  if (/template/i.test(msg)) throw new Error(`Gemini refused the request: ${why} - in Firebase console > AI Logic > Settings, "Enforce template-only mode" must be Unenforced.`);
  if (/api.*(not been used|disabled)|api-not-enabled|firebasevertexai.*enabled/i.test(msg)) throw new Error(`Gemini is not switched on for this project yet (Firebase console > AI Logic > Get started; see docs/NEW_WEB.md). Details: ${why}`);
  if (/PERMISSION_DENIED|403|blocked|referer|API key|API_KEY/i.test(msg)) throw new Error(`Google refused the request (permission): ${why}`);
  if (/failed to fetch|network/i.test(msg)) throw new Error('No internet connection to Gemini.');
  if (/\b500\b|\b503\b|high demand|overloaded|UNAVAILABLE/i.test(msg)) throw new Error('Gemini is very busy right now (Google side). Wait a minute and press the button again.');
  if (/429|quota|RESOURCE_EXHAUSTED/i.test(msg)) throw new Error('Gemini is busy (free daily limit) - try again later.');
  throw lastError || new Error('Gemini gave no answer.');
}

/* ---- The person's own Gemini API key (Config > Gemini API key). It stays in this browser only and is used ONLY when the free
   Firebase route above fails (busy, free limit, App Check...). ---- */
const KEY_STORE = 'wd-gemini-key';
export const loadGeminiKey = () => { try { return localStorage.getItem(KEY_STORE) || ''; } catch { return ''; } };
export const saveGeminiKey = (key) => { try { if (key) localStorage.setItem(KEY_STORE, key.trim()); else localStorage.removeItem(KEY_STORE); } catch { /* not kept */ } };

/** One call to the Gemini API with the person's key (direct, not through Firebase). Tries the model list like the free route. */
export async function generateWithKey(prompt, key) {
  let lastError = null;
  for (let pass = 0; pass < 2; pass += 1) {
    if (pass) await new Promise((r) => setTimeout(r, 3000));
    for (const model of MODELS) {
      try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.4 } }),
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(`[${res.status}] ${(json.error && json.error.message) || res.statusText}`);
        const text = geminiText(json);
        if (text) return text;
        lastError = new Error('Gemini gave no text (the reply was empty or blocked).');
      } catch (e) {
        lastError = e;
        if (/API key not valid|API_KEY_INVALID|\[400\]|\[401\]|\[403\]|PERMISSION_DENIED/i.test(String(e.message))) throw new Error(`Your Gemini API key was refused: ${String(e.message).slice(0, 200)}`);
        if (/failed to fetch|network/i.test(String(e.message))) throw new Error('No internet connection to Gemini.');
      }
    }
  }
  throw lastError || new Error('Gemini gave no answer.');
}

/** The report rewrite: the free Firebase route first; only when it fails, and a key is saved, the person's own key. Returns { text, via }. */
export async function rewriteWithGemini(prompt) {
  try {
    return { text: await generateWithGemini(prompt), via: 'free' };
  } catch (freeError) {
    const key = loadGeminiKey();
    if (!key) throw freeError;
    try {
      return { text: await generateWithKey(prompt, key), via: 'key' };
    } catch (keyError) {
      throw new Error(`${freeError.message}  |  Then your own key: ${keyError.message}`);
    }
  }
}
