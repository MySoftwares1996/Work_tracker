import { iconFor, withIcon, leadingEmoji, plainName } from '../../src/categoryIcons.js';

export async function run({ ck, section }) {
  section('Categories: a fitting symbol is added automatically');
  const cases = [
    ['FOOD & DRINKS', '🍽️'], ['MILK PRODUCTS', '🥛'], ['Vegetables', '🥦'], ['COOLDRINKS', '🥤'], ['House Shifting Expenses', '📦'],
    ['HOUSE HOLDING', '🏠'], ['TINKUCARE', '🧸'], ['Groceries', '🛒'], ['Petrol', '⛽'], ['Electricity bill', '💡'], ['Mobile recharge', '📱'],
    ['Medical', '💊'], ['Chemist', '💊'], ['School fees', '📚'], ['Cab', '🚕'], ['Rent', '🏠'], ['EMI', '🏦'], ['Salary', '💼'], ['Interest', '📈'],
    ['Needs', '🧺'], ['Wants', '🎁'], ['Savings', '💰'], ['Unknown', '❔'], ['Something odd', '🏷️'], ['Web hosting', '🏷️'], ['Car service', '🚗'],
  ];
  const wrong = cases.filter(([n, i]) => iconFor(n) !== i).map(([n, i]) => `${n}: got ${iconFor(n)}, want ${i}`);
  ck('each category gets a symbol that fits its name', !wrong.length, wrong.join('; '));
  ck('a name that already starts with an emoji keeps its own', iconFor('🐥 TINKUCARE') === '🐥' && withIcon('🍷 COOLDRINKS') === '🍷 COOLDRINKS' && leadingEmoji('🏠 HOUSE') === '🏠');
  ck('the label gets the symbol, the name itself is unchanged', withIcon('Milk products') === '🥛 Milk products');
  ck('emoji with a variation selector, a skin tone, a joined sequence or a flag are taken whole',
    leadingEmoji('🏷️ Misc') === '🏷️' && leadingEmoji('👍🏽 Good') === '👍🏽' && leadingEmoji('👨‍👩‍👧 Family') === '👨‍👩‍👧' && leadingEmoji('🇮🇳 India') === '🇮🇳');
  ck('text, digits and punctuation are not emoji', leadingEmoji('Food') === '' && leadingEmoji('1st') === '' && leadingEmoji('& more') === '' && leadingEmoji('  ') === '');
  ck('no Unicode property escapes in the file (the phone engine may not read them)', !/\\p\{/.test((await import('node:fs')).readFileSync(new URL('../../src/categoryIcons.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
  ck('the plain name drops a leading emoji only', plainName('🍷 COOLDRINKS') === 'COOLDRINKS' && plainName('Food') === 'Food');
  ck('blank stays blank', withIcon('') === '' && iconFor('') === '🏷️');
  const { SOURCES } = await import('../../src/optionSources.js');
  const opts = SOURCES.spendCategory.read({ expenses: { spendCategories: ['Petrol', '🍷 COOLDRINKS'] } });
  ck('dropdowns show the symbol but keep the plain value', opts[0].value === 'Petrol' && opts[0].label === '⛽ Petrol' && opts[1].label === '🍷 COOLDRINKS');
  const ui = (await import('node:fs')).readFileSync(new URL('../../src/ui.js', import.meta.url), 'utf8');
  ck('the picker also matches the stored name, so a symbol on the label never causes a duplicate "Add"', /named\(o\)\.includes\(q\)/.test(ui));
  ck('tags are left without symbols', SOURCES.tag.read({ expenses: { tags: ['home'] } })[0].label === 'home');
}
