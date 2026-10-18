import { blend, opaque } from '../../src/colour.js';

export async function run({ ck, section }) {
  section('Colour: opaque tints for elevated surfaces');
  ck('0% is the base', blend('#E9A400', 0, '#FFFFFF') === '#FFFFFF');
  ck('100% is the colour', blend('#E9A400', 1, '#FFFFFF') === '#E9A400');
  ck('12% amber over white is a light cream', blend('#E9A400', 0.12) === '#FCF4E0');
  ck('opaque() converts #RRGGBBAA', /^#[0-9A-F]{6}$/.test(opaque('#E9A4001F')));
  ck('opaque() leaves a solid colour alone', opaque('#2F6BFF') === '#2F6BFF');
  ck('opaque() leaves rgba/names alone', opaque('transparent') === 'transparent');
  ck('3-digit hex handled', blend('#fff', 1) === '#FFFFFF');
  ck('garbage never produces NaN', !/NaN/.test(blend('nonsense', 0.5)));
}

export async function runExtra({ ck, section }) {
  await runExtra2({ ck, section });
}

export async function runExtra2({ ck, section }) {
  const { withAlpha } = await import('../../src/colour.js');
  section('Colour: alpha is only appended to a plain hex colour');
  ck('a hex colour gets the alpha', withAlpha('#E5E5EA', '66') === '#E5E5EA66');
  ck('the Glass theme\'s rgba() border is left valid', withAlpha('rgba(255,255,255,0.75)', '66') === 'rgba(255,255,255,0.75)');
  ck('a missing colour stays missing', withAlpha(undefined, '66') === undefined);
}
