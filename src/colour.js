/**
 * Blends a colour over a base and returns an OPAQUE hex.
 *
 * Translucent backgrounds (#RRGGBBAA) on an elevated view look muddy on
 * Android: the elevation shadow is drawn behind the view and shows through,
 * producing a grey box inside the card. Anything with a shadow needs an
 * opaque background, so tints are pre-blended here instead.
 */
export function blend(color, alpha, base = '#FFFFFF') {
  const hex = (c) => String(c || '').replace('#', '');
  const rgb = (c) => {
    let h = hex(c);
    if (h.length === 3) h = h.split('').map((x) => x + x).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return Number.isFinite(n) ? [(n >> 16) & 255, (n >> 8) & 255, n & 255] : [255, 255, 255];
  };
  const a = Math.max(0, Math.min(1, Number(alpha)));
  const [r1, g1, b1] = rgb(color);
  const [r2, g2, b2] = rgb(base);
  const mix = (x, y) => Math.round(x * a + y * (1 - a)).toString(16).padStart(2, '0');
  return `#${mix(r1, r2)}${mix(g1, g2)}${mix(b1, b2)}`.toUpperCase();
}

/**
 * "#RRGGBB" with a two-digit hex alpha appended. Any other form (the Glass
 * theme's rgba() surfaces, a name) is returned unchanged: appending to it made
 * an invalid colour.
 */
export function withAlpha(color, alphaHex) {
  const c = String(color || '');
  return /^#[0-9a-f]{6}$/i.test(c) ? c + alphaHex : color;
}

/** "#RRGGBBAA" -> opaque "#RRGGBB" over the base; anything else unchanged. */
export function opaque(color, base = '#FFFFFF') {
  const m = /^#([0-9a-f]{6})([0-9a-f]{2})$/i.exec(String(color || ''));
  if (!m) return color;
  return blend(`#${m[1]}`, parseInt(m[2], 16) / 255, base);
}
