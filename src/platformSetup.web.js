/**
 * Browser-only set-up, loaded first by App.js (Metro picks this file over platformSetup.js on the web).
 *
 * React Native for Web's Alert.alert does nothing, and the app asks every "Delete?" / "Restore?" question
 * through it - so on the web each one would silently never happen. This shows the same title, message and
 * buttons in a small dialog of the page's own, and runs the chosen button's onPress, as the phone does.
 */
import { Alert } from 'react-native';
import { installWebStyle } from './webStyle';
import { narrationStyle } from './workingDashboardPayments';

installWebStyle();
narrationStyle.web = true;      // web.app writes Tally narrations with " & " between numbers and a PO No (workingDashboardPayments.js)

const css = `
.wd-alert-back{position:fixed;inset:0;background:rgba(0,0,0,.32);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;z-index:100000;padding:16px}
.wd-alert{background:var(--wd-alert-bg);color:var(--wd-alert-fg);border-radius:14px;max-width:420px;width:100%;padding:20px 20px 12px;box-shadow:0 0 0 .5px rgba(0,0,0,.12),0 20px 60px rgba(0,0,0,.28);animation:wdPop .22s cubic-bezier(.2,.9,.3,1.2);font-family:-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,Segoe UI,Roboto,sans-serif}
.wd-alert h2{font-size:17px;margin:0 0 8px;font-weight:700}
.wd-alert p{font-size:14.5px;margin:0 0 14px;line-height:1.45;white-space:pre-wrap;opacity:.85}
.wd-alert .row{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:6px}
.wd-alert button{border:0;background:transparent;color:#0A84FF;font-size:14px;font-weight:600;padding:7px 14px;border-radius:8px;cursor:pointer}
.wd-alert button:hover,.wd-alert button:focus-visible{background:rgba(79,140,255,.12);outline:none}
.wd-alert button.cancel{color:inherit;opacity:.7;font-weight:500}
.wd-alert button.destructive{color:#FF453A}
:root{--wd-alert-bg:#fff;--wd-alert-fg:#111}
@media (prefers-color-scheme: dark){:root{--wd-alert-bg:#1C2333;--wd-alert-fg:#F2F4F8}}
`;

function ensureStyle() {
  if (document.getElementById('wd-alert-style')) return;
  const el = document.createElement('style');
  el.id = 'wd-alert-style';
  el.textContent = css;
  document.head.appendChild(el);
}

function showAlert(title, message, buttons, options = {}) {
  if (typeof document === 'undefined') return;
  ensureStyle();
  const list = Array.isArray(buttons) && buttons.length ? buttons : [{ text: 'OK' }];
  const back = document.createElement('div');
  back.className = 'wd-alert-back';
  const box = document.createElement('div');
  box.className = 'wd-alert';
  box.setAttribute('role', 'alertdialog');
  box.setAttribute('aria-modal', 'true');
  if (title) { const h = document.createElement('h2'); h.textContent = String(title); box.appendChild(h); }
  if (message) { const p = document.createElement('p'); p.textContent = String(message); box.appendChild(p); }
  const row = document.createElement('div');
  row.className = 'row';

  const close = (button) => {
    document.removeEventListener('keydown', onKey, true);
    back.remove();
    if (button?.onPress) setTimeout(() => button.onPress(), 0);
    else if (!button && options.onDismiss) options.onDismiss();
  };
  const cancelButton = list.find((b) => b.style === 'cancel');
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(cancelButton || (options.cancelable ? null : list[list.length - 1])); }
  };

  list.forEach((b) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = b.text || 'OK';
    if (b.style) btn.className = b.style;
    btn.onclick = () => close(b);
    row.appendChild(btn);
  });
  box.appendChild(row);
  back.appendChild(box);
  back.onclick = (e) => { if (e.target === back && (options.cancelable || cancelButton)) close(cancelButton || null); };
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(back);
  const buttonsEls = row.querySelectorAll('button');
  buttonsEls[buttonsEls.length - 1]?.focus();
}

Alert.alert = showAlert;
