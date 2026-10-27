import { THEMES, DEFAULT_THEME, darkTheme, fontFor, FONT_DISPLAY, ALARM_COLORS } from '../../src/themeTokens.js';

// WCAG contrast ratio of two #RRGGBB colours.
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

export async function run({ ck, section }) {
  section('Pearl: the one look');
  const keys = Object.keys(THEMES);
  ck('Pearl is the only theme: no colour choices, no swatches', keys.join() === 'pearl' && DEFAULT_THEME === 'pearl');
  ck('Gradient bento uses the approved tokens (page #F5F3FF, white cards, line #ECE8FA, ink #1E1B4B, accent #6D28D9)', THEMES.pearl.bg === '#F5F3FF' && THEMES.pearl.surface === '#FFFFFF' && THEMES.pearl.border === '#ECE8FA' && THEMES.pearl.text === '#1E1B4B' && THEMES.pearl.primary === '#6D28D9' && THEMES.pearl.grad.brand.join() === '#8B5CF6,#DB2777' && THEMES.pearl.grad.hero.length === 3);
  ck('every theme keeps the names the screens read', keys.every((k) => ['bg', 'surface', 'surfaceAlt', 'border', 'text', 'textDim', 'accent', 'accent2', 'danger', 'warn', 'ok', 'radius', 'shadow', 'bar', 'onAccent', 'fontDisplay', 'font'].every((n) => THEMES[k][n] !== undefined)));
  ck('cards 22, rounded-square buttons 16, a soft lift on cards, violet switches', THEMES.pearl.radius === 22 && THEMES.pearl.btnRadius === 16 && THEMES.pearl.lift.elevation > 0 && THEMES.pearl.toggleOn === '#7C3AED');
  // White text and icons sit on every gradient: the deep end of each must give large bold text 3:1 or more.
  const deepBad = Object.entries(THEMES.pearl.grad).concat(THEMES.pearl.catGrads.map((g, i) => [`cat${i}`, g])).filter(([, g]) => ratio('#FFFFFF', g[g.length - 1]) < 3).map(([k]) => k);
  ck('white reads on the deep end of every gradient (3:1, large bold text)', !deepBad.length, deepBad.join(', '));



  section('Pearl: text passes 4.5:1, light and dark');
  const bad = [];
  const need = (name, a, b, min = 4.5) => { if (ratio(a, b) < min) bad.push(`${name} ${a} on ${b} = ${ratio(a, b).toFixed(2)}`); };
  for (const k of keys) {
    for (const [mode, t] of [['light', THEMES[k]], ['dark', darkTheme(k)]]) {
      const n = `${k}/${mode}`;
      for (const ground of [t.bg, t.surface, t.surfaceAlt]) {
        need(`${n} text`, t.text, ground);
        need(`${n} textDim`, t.textDim, ground);
        need(`${n} danger`, t.danger, ground);
        need(`${n} warn`, t.warn, ground);
        need(`${n} ok`, t.ok, ground);
        if (ground !== t.surfaceAlt) need(`${n} primary`, t.primary, ground);
      }
      need(`${n} onAccent on primary`, t.onAccent, t.primary);
      need(`${n} tintText on tint`, t.tintText, t.tint);
      need(`${n} primary icon on tint`, t.primary, t.tint, 3);
      need(`${n} white on primaryDark`, '#FFFFFF', t.primaryDark);
      need(`${n} mint on primaryDark`, t.mint, t.primaryDark);
      need(`${n} heroDim on primaryDark`, t.heroDim, t.primaryDark);
      need(`${n} dangerText on dangerTint`, t.dangerText, t.dangerTint);
      need(`${n} warnText on warnTint`, t.warnText, t.warnTint);
      need(`${n} slateText on slateTint`, t.slateText, t.slateTint);
      need(`${n} okText on okTint`, t.okText, t.okTint);
      need(`${n} text on primaryDark chip (selected)`, '#FFFFFF', t.primaryDark);
    }
  }
  ck('all the colour pairs the screens use pass 4.5:1', bad.length === 0, bad.slice(0, 6).join(' | '));
  const alarmBad = Object.entries(ALARM_COLORS.priority).flatMap(([name, p]) => [['white', '#FFFFFF'], ['dim', p.dim]].filter(([, c]) => ratio(c, p.bottom) < 4.5).map(([w]) => `${name} ${w}`));
  ck('the full-screen alert text passes 4.5:1 on every priority colour', alarmBad.length === 0, alarmBad.join(', '));
  ck('alert colours: a gradient by priority, white text reads on its deep end', ['High', 'Medium', 'Low', 'None'].every((k) => ALARM_COLORS.priority[k].grad.length === 3 && ratio('#FFFFFF', ALARM_COLORS.priority[k].bottom) >= 4.5));
  ck('the dark twin has the dark ground', darkTheme('pearl').bg === '#110E27' && darkTheme('pearl').surface === '#1B1736' && darkTheme('pearl').text === '#F4F2FF' && darkTheme('pearl').primary === '#B79CFF' && darkTheme('pearl').dark === true);

  section('Ledger: fonts');
  ck('Manrope weight by fontWeight (400/500 Medium, 600 SemiBold, 700 Bold, 800 ExtraBold)', fontFor('400') === 'Manrope_500Medium' && fontFor(500) === 'Manrope_500Medium' && fontFor('600') === 'Manrope_600SemiBold' && fontFor('700') === 'Manrope_700Bold' && fontFor('bold') === 'Manrope_700Bold' && fontFor('800') === 'Manrope_800ExtraBold' && fontFor(undefined) === 'Manrope_500Medium' && fontFor('normal') === 'Manrope_500Medium');
  ck('bold Manrope is the display face (titles and big numbers)', FONT_DISPLAY === 'Manrope_800ExtraBold' && THEMES.pearl.fontDisplay === FONT_DISPLAY);
}
