import { THEMES, THEME_SWATCHES, DEFAULT_THEME, darkTheme, themeKeyOf, fontFor, FONT_DISPLAY, ALARM_COLORS } from '../../src/themeTokens.js';

// WCAG contrast ratio of two #RRGGBB colours.
const lum = (hex) => { const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const x = lum(a); const y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

export async function run({ ck, section }) {
  section('Ledger: the six colour themes and Glass');
  const keys = Object.keys(THEMES);
  ck('seven themes: Forest, Harbour, Plum, Ember, Ink, Rose, Glass', keys.join() === 'forest,harbour,plum,ember,ink,rose,glass' && THEME_SWATCHES.map((s) => s.label).join() === 'Forest,Harbour,Plum,Ember,Ink,Rose,Glass');
  ck('Forest is the default', DEFAULT_THEME === 'forest' && themeKeyOf(undefined) === 'forest');
  ck('Forest uses the approved tokens', THEMES.forest.bg === '#F7F5EF' && THEMES.forest.primary === '#0B6B52' && THEMES.forest.primaryDark === '#123A2F' && THEMES.forest.tint === '#E3F1EC' && THEMES.forest.tintText === '#0B5A45' && THEMES.forest.mint === '#9BD3BF');
  ck('the other themes swap only primary / primaryDark / tint', THEMES.harbour.primary === '#2457C5' && THEMES.harbour.primaryDark === '#14284F' && THEMES.harbour.tint === '#E4ECFA' && THEMES.plum.primary === '#8A3FD1' && THEMES.ember.primary === '#C2410C' && THEMES.ink.primaryDark === '#0E1513' && THEMES.rose.primary === '#B42318');
  ck('every theme keeps the names the screens read', keys.every((k) => ['bg', 'surface', 'surfaceAlt', 'border', 'text', 'textDim', 'accent', 'accent2', 'danger', 'warn', 'ok', 'radius', 'shadow', 'bar', 'onAccent', 'fontDisplay', 'font'].every((n) => THEMES[k][n] !== undefined)));
  ck('cards 20, hero 24, buttons 14, fields 14, no shadow on cards', THEMES.forest.radius === 20 && THEMES.forest.heroRadius === 24 && THEMES.forest.btnRadius === 14 && THEMES.forest.fieldRadius === 14 && Object.keys(THEMES.forest.shadow).length === 0);

  section('Ledger: older stored themes');
  ck('the earlier default (warm) and the unmapped looks become Forest', ['warm', 'pearl', 'neu', 'clay', 'hero', 'aqua', 'nonsense', ''].every((k) => themeKeyOf(k) === 'forest'));
  ck('the ones that map sensibly keep their colour family', themeKeyOf('ocean') === 'harbour' && themeKeyOf('violet') === 'plum' && themeKeyOf('lilac') === 'plum' && themeKeyOf('sunset') === 'ember' && themeKeyOf('night') === 'ink');
  ck('a current key stays itself', keys.every((k) => themeKeyOf(k) === k));

  section('Glass: the APK look');
  const mix = (a, b, k) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('');
  const alphaOf = (rgba) => Number(/,\s*([\d.]+)\)$/.exec(rgba)[1]);
  ck('only Glass has the glass tokens', keys.every((k) => (k === 'glass') === !!THEMES[k].glass) && !!darkTheme('glass').glass);
  ck('Glass has opaque sheets and fields (its ground is plain hex)', ['bg', 'surface', 'surfaceAlt', 'border'].every((n) => /^#[0-9A-F]{6}$/i.test(THEMES.glass[n]) && /^#[0-9A-F]{6}$/i.test(darkTheme('glass')[n])));
  const glassBad = [];
  for (const [mode, t] of [['light', THEMES.glass], ['dark', darkTheme('glass')]]) {
    const g = t.glass;
    for (const [tone, [top, bottom]] of Object.entries(g.tiles)) {
      const mid = mix(mix(top, bottom, 0.5), g.sheen, g.tileSheen / 2);
      const lit = mix(top, g.sheen, g.tileSheen);
      if (ratio(g.tileInk, mid) < 4.5) glassBad.push(`${mode} ${tone} text mid ${ratio(g.tileInk, mid).toFixed(2)}`);
      if (ratio(g.tileInk, bottom) < 4.5) glassBad.push(`${mode} ${tone} label foot ${ratio(g.tileInk, bottom).toFixed(2)}`);
      if (ratio(g.tileInk, lit) < 3) glassBad.push(`${mode} ${tone} big number top ${ratio(g.tileInk, lit).toFixed(2)}`);
    }
    const heroTop = mix(g.tiles.hero[0], g.sheen, g.tileSheen);
    for (const [n, c] of [['mint', t.mint], ['heroDim', t.heroDim], ['white', '#FFFFFF']]) if (ratio(c, heroTop) < 4.5) glassBad.push(`${mode} hero ${n} ${ratio(c, heroTop).toFixed(2)}`);
    // A frosted panel over the base and over each glow at full strength, with the shine on top.
    const fillA = alphaOf(g.fill);
    for (const under of [g.base, ...g.orbs.map(([c]) => mix(g.base, c, g.glow))]) {
      const panel = mix(mix(under, '#FFFFFF', fillA), g.sheen, g.sheenOpacity);
      const plain = mix(under, '#FFFFFF', fillA);
      for (const ground of [panel, plain]) for (const [n, c] of [['text', t.text], ['textDim', t.textDim], ['primary', t.primary], ['danger', t.danger]]) if (ratio(c, ground) < 4.5) glassBad.push(`${mode} ${n} on glass ${ground} ${ratio(c, ground).toFixed(2)}`);
    }
  }
  ck('Glass: white text reads on every glossy tile, and the theme text on every frosted panel', !glassBad.length, glassBad.join('; '));

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
