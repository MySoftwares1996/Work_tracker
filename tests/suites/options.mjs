import { SOURCES, normaliseOptions, union } from '../../src/optionSources.js';

export async function run({ ck, section }) {
  const base = () => ({
    expenses: {
      txns: [
        { id: 1, type: 'spend', category: 'Food', sub: 'Lunch', main: 'Needs', mode: 'UPI', tags: ['office'], account: 'cash' },
        { id: 2, type: 'income', category: 'Salary', main: 'Needs', mode: 'Bank Transfer', account: 'bank-a' },
        { id: 3, type: 'spend', category: 'Pets', main: 'Wants', mode: 'GPay', tags: ['home'], account: 'cash' },
      ],
      categories: ['Food', 'Travel', 'Salary'],
      spendCategories: ['Food', 'Travel', 'Gym'],
      mainCategories: ['Needs'],
      tags: ['office'],
      accounts: [{ id: 'cash', name: 'Cash', kind: 'cash' }, { id: 'bank-a', name: 'Bank A', kind: 'bank' }],
      subCategories: {},
    },
    investments: { txns: [{ assetType: 'Stock', assetName: 'INFY' }], assetTypes: ['Mutual Fund'], assetNames: [] },
    tasks: [{ type: 'Renewal' }],
    taskTypes: ['Task'],
    workTracker: { tasks: [{ category: 'Audit', status: 'Pending', assignee: 'Ravi' }], categories: [], statuses: [], assignees: [] },
    workingDashboard: { entries: [{ category: 'MIS', priority: 'High', status: 'Pending', pendingWith: 'Rami' }], categories: [], priorities: [], statuses: [], assignees: [] },
  });

  section('Options: repairing the split lists');
  const n = normaliseOptions(base());
  ck('spendCategories kept as its own list', n.expenses.spendCategories.includes('Gym'));
  ck('spend list also folds in every category a spend record used', n.expenses.spendCategories.includes('Pets') && n.expenses.spendCategories.includes('Food'));
  ck('income categories go to their own list, not the spend list', n.expenses.incomeCategories.includes('Salary') && !n.expenses.spendCategories.includes('Salary'));
  ck('salary never leaks into the spend list', !n.expenses.spendCategories.includes('Salary'));
  ck('a category only a record used is restored', n.expenses.categories.includes('Pets'));
  ck('combined categories still includes income categories, for filters', n.expenses.categories.includes('Salary'));
  ck('used main category restored', n.expenses.mainCategories.includes('Wants'));
  ck('used payment mode restored', n.expenses.paymentModes.includes('GPay'));
  ck('nothing injected: payment modes are only those records use', JSON.stringify(n.expenses.paymentModes) === '["UPI","Bank Transfer","GPay"]', JSON.stringify(n.expenses.paymentModes));
  ck('used tag restored', n.expenses.tags.includes('home'));
  ck('used sub-category kept, in the one flat list', n.expenses.subCategoryList.includes('Lunch'));
  ck('per-category map removed', !('subCategories' in n.expenses));
  ck('investment lists repaired', n.investments.assetTypes.includes('Stock') && n.investments.assetNames.includes('INFY'));
  ck('work tracker lists repaired', n.workTracker.categories.includes('Audit') && n.workTracker.assignees.includes('Ravi'));
  ck('working dashboard lists repaired', n.workingDashboard.categories.includes('MIS') && n.workingDashboard.priorities.includes('High') && n.workingDashboard.assignees.includes('Rami'));
  ck('task types repaired', n.taskTypes.includes('Renewal'));
  ck('idempotent', JSON.stringify(normaliseOptions(n)) === JSON.stringify(n));
  const delWd = SOURCES.wdCategory.remove(SOURCES.wdCategory.add(n, 'Query').db, 'MIS').db;
  ck('a working dashboard category deleted while an entry uses it stays deleted after a reload',
    JSON.stringify(normaliseOptions(delWd).workingDashboard.categories) === '["Query"]', JSON.stringify(normaliseOptions(delWd).workingDashboard.categories));

  section('Options: union');
  ck('dedupes case-insensitively, first spelling wins', JSON.stringify(union(['Food', 'food', ' FOOD '], ['Bills'])) === '["Food","Bills"]');
  ck('drops blanks and nulls', union(['', null, '  ', 'A']).length === 1);
}
