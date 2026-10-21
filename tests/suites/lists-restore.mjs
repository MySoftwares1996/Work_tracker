import { backupLists, restoreFromBackup, subCategoriesFromTasks, optionsFromTasks } from '../../src/listsRestore.js';
import { keepFilledLists, listsOnReceive } from '../../src/firebaseSyncCore.js';

export async function run({ ck, section }) {
  section('Restore Sub Categories and narrations from a phone backup');
  const domestic = { id: 'sc1', name: 'Domestic Payment', category: 'Payments', fields: [{ label: 'Vendor Name' }, { label: 'Mode', options: ['TT', 'DD'] }] };
  const epfo = { id: 'sc2', name: 'EPFO', category: 'HR Statutory Payment', fields: [{ label: 'Month' }] };
  const nr = { id: 'nr1', name: 'Advance against Purchase Order', phrase: 'Advance paid against Po No: ', fields: [{ label: 'PO No' }] };
  const file = { app: 'My_Personal_Tracker', exportedAt: '2026-10-16T10:00:00.000Z', data: { workingDashboard: { categories: ['Payments', 'HR Statutory Payment'], subCategories: [domestic, epfo], subCategoryCategories: ['Payments', 'HR Statutory Payment'], narrationTypes: [nr], reminderCategories: ['Payments'], reportFormats: [{ category: 'Payments', subCategory: 'Domestic Payment', template: '{Vendor Name} paid' }] } } };
  const b = backupLists(file);
  ck('a backup file gives its Sub Categories, narration types and formats', b.subCategories.length === 2 && b.narrationTypes.length === 1 && b.reportFormats.length === 1 && b.savedAt === '2026-10-16T10:00:00.000Z');
  ck('a file without them gives empty lists, not an error', backupLists({ data: {} }).subCategories.length === 0 && backupLists(null).narrationTypes.length === 0);

  const nowLists = { categories: ['Payments', 'Bank'], subCategories: [{ id: 'x', name: 'EPFO', category: 'HR Statutory Payment', fields: [] }, { id: 'y', name: 'New one', fields: [] }], subCategoryCategories: ['Payments'], narrationTypes: [], reminderCategories: [], reportFormats: [] };
  const plan = restoreFromBackup(nowLists, b);
  const ep = plan.lists.subCategories.find((x) => x.name === 'EPFO');
  ck('every Sub Category comes back exactly as the backup had it (fields and choices)', plan.lists.subCategories[0] === domestic && ep === epfo);
  ck('one with the same name now is replaced by the backup\'s copy, not doubled', plan.lists.subCategories.filter((x) => x.name === 'EPFO').length === 1);
  ck('one added since the backup is kept', plan.lists.subCategories.some((x) => x.name === 'New one'));
  ck('the narration types come back as they were', plan.lists.narrationTypes.length === 1 && plan.lists.narrationTypes[0] === nr);
  ck('categories and the carrying list are joined, nothing removed', plan.lists.categories.join() === 'Payments,HR Statutory Payment,Bank' && plan.lists.subCategoryCategories.includes('HR Statutory Payment') && plan.lists.subCategoryCategories.includes('Payments'));
  ck('missing report formats are filled in; the counts say what came back', plan.reportFormats.length === 1 && plan.counts.newSubCategories === 1 && plan.counts.newNarrationTypes === 1 && plan.counts.formats === 1);
  ck('a format already there is left as it is now', restoreFromBackup({ reportFormats: [{ subCategory: 'domestic payment', template: 'edited' }] }, b).reportFormats === null);

  section('Rebuild Sub Categories from the tasks (no backup)');
  const entries = [
    { subCategory: 'Domestic Payment', category: 'Payments', subCategoryFields: { 'Vendor Name': 'ACME', 'Invoice No': '42' } },
    { subCategory: 'domestic payment', category: 'Payments', subCategoryFields: { 'Vendor Name': 'B', Amount: '9' } },
    { subCategory: 'EPFO', category: 'HR', subCategoryFields: {} },
    { subCategory: '', category: 'Payments' },
  ];
  const rebuilt = subCategoriesFromTasks(entries, [{ name: 'EPFO' }]);
  ck('a Sub Category the tasks use comes back once, under its category, with every field name the tasks filled', rebuilt.length === 1 && rebuilt[0].name === 'Domestic Payment' && rebuilt[0].category === 'Payments' && rebuilt[0].fields.map((f) => f.label).join() === 'Vendor Name,Invoice No,Amount');
  ck('one already in the list is not added again', !rebuilt.some((x) => x.name === 'EPFO'));

  section('Statuses and Pending with: restored, rebuilt, and never replaced by an empty or reset list');
  const phoneFile = { data: { workingDashboard: { categories: ['Payments'], priorities: ['High', 'Low'], statuses: ['Pending', 'With bank', 'Waiting for reply'], assignees: ['Accounts', 'HDFC'] } } };
  const pb = backupLists(phoneFile);
  ck('a phone backup gives its statuses and Pending with (kept as assignees there)', pb.statuses.length === 3 && pb.pendingWith.join() === 'Accounts,HDFC');
  const p2 = restoreFromBackup({ categories: [], priorities: ['High', 'Medium', 'Low'], statuses: ['Not Yet Started', 'In-Progress', 'Pending'], pendingWith: ['Self'] }, pb);
  ck('restoring puts the backup\'s statuses and names back first, keeps the ones there now', p2.lists.statuses.join() === 'Pending,With bank,Waiting for reply,Not Yet Started,In-Progress' && p2.lists.pendingWith.join() === 'Accounts,HDFC,Self' && p2.counts.newOptions === 5);
  const used = optionsFromTasks([{ status: 'With bank', pendingWith: 'HDFC', category: 'Payments', priority: 'High' }, { status: 'with bank', pendingWith: 'Self' }, { status: 'Pending' }], { categories: ['Payments'], priorities: ['High'], statuses: ['Pending'], pendingWith: ['Self'] });
  ck('the tasks give back the statuses and names they use that the lists lack, once each', used.statuses.join() === 'With bank' && used.pendingWith.join() === 'HDFC' && !used.categories.length && !used.priorities.length);
  const web = [['Payments'], ['High'], ['Pending', 'With bank'], ['Accounts', 'HDFC']];
  ck('an empty phone list never replaces the account\'s filled one', keepFilledLists([['Payments'], ['High'], [], []], web)[2].join() === 'Pending,With bank' && keepFilledLists([['Payments'], ['High'], [], []], web)[3].join() === 'Accounts,HDFC');
  ck('...a list the phone has stays its own', keepFilledLists([['A'], ['B'], ['Only this'], ['Me']], web)[2].join() === 'Only this');
  ck('a newer but empty phone copy does not win when the account\'s lists arrive', listsOnReceive(web, [['Payments'], ['High'], [], []], 1000, 2000)[2].join() === 'Pending,With bank');
}
