/**
 * web.app only: the macOS finish that react-native-web cannot express in a style object - smooth colour / shadow
 * changes on hover, a quiet focus ring, thin overlay scroll bars, the selection colour, text smoothing and the pop-in of
 * a dialog. One <style> tag, added once; skipped when the person asks for reduced motion.
 */
export function installWebStyle() {
  const d = globalThis.document;
  if (!d || d.getElementById('wd-mac-style')) return;
  const css = `
    html { -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; text-rendering: optimizeLegibility; }
    body { overscroll-behavior: none; }
    ::selection { background: rgba(10,132,255,0.28); }
    [role="button"], [role="tab"], [role="checkbox"], [role="link"], a { cursor: pointer; transition: background-color .16s ease, opacity .16s ease, box-shadow .2s ease, transform .18s cubic-bezier(.2,.9,.3,1.3), filter .16s ease; }
    [role="button"]:hover { filter: brightness(1.04); }
    :focus-visible { outline: 3px solid rgba(10,132,255,0.45); outline-offset: 1px; border-radius: 8px; }
    input:focus, textarea:focus { outline: none !important; }
    * { scrollbar-width: thin; scrollbar-color: rgba(128,128,128,0.45) transparent; }
    *::-webkit-scrollbar { width: 10px; height: 10px; }
    *::-webkit-scrollbar-thumb { background: rgba(128,128,128,0.4); border-radius: 8px; border: 3px solid transparent; background-clip: content-box; }
    *::-webkit-scrollbar-thumb:hover { background-color: rgba(128,128,128,0.65); }
    @keyframes wdPop { from { opacity: 0; transform: scale(0.96) translateY(6px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }
  `;
  const el = d.createElement('style');
  el.id = 'wd-mac-style';
  el.textContent = css;
  d.head.appendChild(el);
}
