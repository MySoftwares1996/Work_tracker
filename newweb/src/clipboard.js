import { inApp, askNative } from './nativeBridge';

/** Copies text to the clipboard; resolves true when it worked (inside the Android app it asks the app). Falls back to a hidden textarea where the clipboard API is refused. */
export async function copyText(text) {
  const value = String(text ?? '');
  if (inApp() && (await askNative('copy', { text: value }, 5000)) === true) return true;
  try {
    if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(value); return true; }
  } catch { /* fall through to the older way */ }
  try {
    const box = document.createElement('textarea');
    box.value = value;
    box.setAttribute('readonly', '');
    box.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(box);
    box.select();
    const ok = document.execCommand('copy');
    box.remove();
    return ok;
  } catch { return false; }
}
