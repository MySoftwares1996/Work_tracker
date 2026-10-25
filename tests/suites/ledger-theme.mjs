import { THEMES, THEME_SWATCHES, DEFAULT_THEME, darkTheme, themeKeyOf, fontFor, FONT_DISPLAY, ALARM_COLORS } from '../../src/themeTokens.js';

// WCAG contrast ratio of two #RRGGBB colours.
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

export async function run({ ck, section }) {
  section('Ledger: the six colour themes');
  const keys = Object.keys(THEMES);
  ck('eight themes: Pearl, Forest, Harbour, Plum, Ember, Ink, Glass, Rose', keys.join() === 'pearl,forest,harbour,plum,ember,ink,glass,rose' && THEME_SWATCHES.map((s) => s.label).join() === 'Pearl,Forest,Harbour,Plum,Ember,Ink,Glass,Rose');
  ck('Pearl is the default', DEFAULT_THEME === 'pearl' && themeKeyOf(undefined) === 'pearl');
  ck('Pearl uses the approved tokens (page #F0F1F7, white cards, line #E6E8F1, text #14132B, accent #4B33C8, teal #2EC4B6)', THEMES.pearl.bg === '#F0F1F7' && THEMES.pearl.surface === '#FFFFFF' && THEMES.pearl.surfaceAlt === '#F4F6FA' && THEMES.pearl.border === '#E6E8F1' && THEMES.pearl.text === '#14132B' && THEMES.pearl.primary === '#4B33C8' && THEMES.pearl.mint === '#2EC4B6' && THEMES.pearl.tile.navy === '#2F55D4' && THEMES.pearl.tile.violet === '#7B3FD0');
  ck('the other themes swap only primary / primaryDark / tint', THEMES.harbour.primary === '#2457C5' && THEMES.harbour.primaryDark === '#14284F' && THEMES.harbour.tint === '#E4ECFA' && THEMES.plum.primary === '#8A3FD1' && THEMES.ember.primary === '#C2410C' && THEMES.ink.primaryDark === '#0E1513' && THEMES.rose.primary === '#B42318');
  ck('every theme keeps the names the screens read', keys.every((k) => ['bg', 'surface', 'surfaceAlt', 'border', 'text', 'textDim', 'accent', 'accent2', 'danger', 'warn', 'ok', 'radius', 'shadow', 'bar', 'onAccent', 'fontDisplay', 'font'].every((n) => THEMES[k][n] !== undefined)));
  ck('cards 22, pill buttons, flat (no shadow on cards)', THEMES.pearl.radius === 22 && THEMES.pearl.btnRadius === 999 && Object.keys(THEMES.pearl.shadow).length === 0 && THEMES.pearl.toggleOn === '#2EC4B6');

  section('Ledger: older stored themes');
  ck('the earlier default (warm) and the unmapped looks become Pearl', ['warm', 'neu', 'clay', 'hero', 'aqua', 'nonsense', ''].every((k) => themeKeyOf(k) === 'pearl'));
  ck('the ones that map sensibly keep their colour family', themeKeyOf('ocean') === 'harbour' && themeKeyOf('violet') === 'plum' && themeKeyOf('lilac') === 'plum' && themeKeyOf('sunset') === 'ember' && themeKeyOf('night') === 'ink');
  ck('a current key stays itself', keys.every((k) => themeKeyOf(k) === k));

  ck('Glass is frosted (translucent cards over a backdrop); every other theme and Glass in the dark keep plain cards', THEMES.glass.glass === true && /^rgba/.test(THEMES.glass.cardFill) && keys.filter((k) => k !== 'glass').every((k) => !THEMES[k].glass && THEMES[k].cardFill === THEMES[k].surface) && !darkTheme('glass').glass);

  section('Ledger: text passes 4.5:1 in every theme, light and dark');
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
  ck('alert colours: High deep red, Medium amber-brown, Low deep green, none slate', ALARM_COLORS.priority.High.bottom === '#4A1712' && ALARM_COLORS.priority.Medium.bottom === '#4A2E0A' && ALARM_COLORS.priority.Low.bottom === '#123A2F' && ALARM_COLORS.priority.None.bottom === '#1F2F3F');
  ck('the dark twin (Aurora dark) has the dark ground', darkTheme('pearl').bg === '#0C1228' && darkTheme('pearl').surface === '#161E3B' && darkTheme('pearl').surfaceAlt === '#1D2648' && darkTheme('pearl').text === '#F2F4FF' && darkTheme('pearl').primary === '#A48BFF' && darkTheme('pearl').dark === true);

  section('Ledger: fonts');
  ck('Manrope weight by fontWeight (400/500 Medium, 600 SemiBold, 700 Bold, 800 ExtraBold)', fontFor('400') === 'Manrope_500Medium' && fontFor(500) === 'Manrope_500Medium' && fontFor('600') === 'Manrope_600SemiBold' && fontFor('700') === 'Manrope_700Bold' && fontFor('bold') === 'Manrope_700Bold' && fontFor('800') === 'Manrope_800ExtraBold' && fontFor(undefined) === 'Manrope_500Medium' && fontFor('normal') === 'Manrope_500Medium');
  ck('Fraunces 600 is the display face', FONT_DISPLAY === 'Fraunces_600SemiBold' && THEMES.forest.fontDisplay === FONT_DISPLAY);
}
