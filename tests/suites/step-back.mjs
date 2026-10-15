import { backTab } from '../../src/stepBackCore.js';

export async function run({ ck, section }) {
  section('Back inside a tool: at most two presses');
  ck('from another tab, Back goes to the first tab', backTab('register', 'dashboard') === 'dashboard');
  ck('from the first tab, Back leaves the tool', backTab('dashboard', 'dashboard') === null);
  ck('however many tabs were visited, it is the first tab next, not each one in turn', backTab('done', 'dashboard') === 'dashboard');
}
