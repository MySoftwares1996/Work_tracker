import { THEMES, THEME_SWATCHES, DEFAULT_THEME, darkTheme, themeKeyOf, fontFor, FONT_DISPLAY, ALARM_COLORS } from '../../src/themeTokens.js';

// WCAG contrast ratio of two #RRGGBB colours.
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

export async function run({ ck, section }) {
  section('Ledger: the six colour themes');
  const keys = Object.keys(THEMES);
  ck('six themes: Forest, Harbour, Plum, Ember, Ink, Rose', keys.join() === 'forest,harbour,plum,ember,ink,rose' && THEME_SWATCHES.map((s) => s.label).join() === 'Forest,Harbour,Plum,Ember,Ink,Rose');
  ck('Forest is the default', DEFAULT_THEME === 'forest' && themeKeyOf(undefined) === 'forest');
  ck('Forest uses the approved tokens', THEMES.forest.bg === '#F7F5EF' && THEMES.forest.primary === '#0B6B52' && THEMES.forest.primaryDark === '#123A2F' && THEMES.forest.tint === '#E3F1EC' && THEMES.forest.tintText === '#0B5A45' && THEMES.forest.mint === '#9BD3BF');
  ck('the other themes swap only primary / primaryDark / tint', THEMES.harbour.primary === '#2457C5' && THEMES.harbour.primaryDark === '#14284F' && THEMES.harbour.tint === '#E4ECFA' && THEMES.plum.primary === '#8A3FD1' && THEMES.ember.primary === '#C2410C' && THEMES.ink.primaryDark === '#0E1513' && THEMES.rose.primary === '#B42318');
  ck('every theme keeps the names the screens read', keys.every((k) => ['bg', 'surface', 'surfaceAlt', 'border', 'text', 'textDim', 'accent', 'accent2', 'danger', 'warn', 'ok', 'radius', 'shadow', 'bar', 'onAccent', 'fontDisplay', 'font'].every((n) => THEMES[k][n] !== undefined)));
  ck('cards 20, hero 24, buttons 14, fields 14, no shadow on cards', THEMES.forest.radius === 20 && THEMES.forest.heroRadius === 24 && THEMES.forest.btnRadius === 14 && THEMES.forest.fieldRadius === 14 && Object.keys(THEMES.forest.shadow).length === 0);

  section('Ledger: older stored themes');
  ck('the earlier default (warm) and the unmapped looks become Forest', ['warm', 'pearl', 'glass', 'neu', 'clay', 'hero', 'aqua', 'nonsense', ''].every((k) => themeKeyOf(k) === 'forest'));
  ck('the ones that map sensibly keep their colour family', themeKeyOf('ocean') === 'harbour' && themeKeyOf('violet') === 'plum' && themeKeyOf('lilac') === 'plum' && themeKeyOf('sunset') === 'ember' && themeKeyOf('night') === 'ink');
  ck('a current key stays itself', keys.every((k) => themeKeyOf(k) === k));

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
  ck('the dark twin has the dark ground', darkTheme('forest').bg === '#0F1714' && darkTheme('forest').surface === '#17211D' && darkTheme('forest').text === '#EAF2EE' && darkTheme('forest').dark === true);

  section('Ledger: fonts');
  ck('Manrope weight by fontWeight (400/500 Medium, 600 SemiBold, 700 Bold, 800 ExtraBold)', fontFor('400') === 'Manrope_500Medium' && fontFor(500) === 'Manrope_500Medium' && fontFor('600') === 'Manrope_600SemiBold' && fontFor('700') === 'Manrope_700Bold' && fontFor('bold') === 'Manrope_700Bold' && fontFor('800') === 'Manrope_800ExtraBold' && fontFor(undefined) === 'Manrope_500Medium' && fontFor('normal') === 'Manrope_500Medium');
  ck('Fraunces 600 is the display face', FONT_DISPLAY === 'Fraunces_600SemiBold' && THEMES.forest.fontDisplay === FONT_DISPLAY);
}
