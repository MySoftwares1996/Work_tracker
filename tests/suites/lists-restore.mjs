import { backupLists, restoreFromBackup, subCategoriesFromTasks } from '../../src/listsRestore.js';

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
  ck('categories and the carrying list are joined, nothing removed', plan.lists.categories.join() === 'Payments,Bank,HR Statutory Payment' && plan.lists.subCategoryCategories.includes('HR Statutory Payment') && plan.lists.subCategoryCategories.includes('Payments'));
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
}
