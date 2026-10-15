import { SOURCES, normaliseOptions, union, fixedSource } from '../../src/optionSources.js';

export async function run({ ck, section }) {
  const base = () => ({
    expenses: {
      txns: [
        { id: 1, type: 'spend', category: 'Food', sub: 'Lunch', main: 'Needs', mode: 'UPI', tags: ['office'], account: 'cash' },
        { id: 2, type: 'income', category: 'Salary', main: 'Needs', mode: 'Bank Transfer', account: 'hdfc' },
        { id: 3, type: 'spend', category: 'Pets', main: 'Wants', mode: 'GPay', tags: ['home'], account: 'cash' },
      ],
      categories: ['Food', 'Travel', 'Salary'],
      spendCategories: ['Food', 'Travel', 'Gym'],
      mainCategories: ['Needs'],
      tags: ['office'],
      accounts: [{ id: 'cash', name: 'Cash', kind: 'cash' }, { id: 'hdfc', name: 'HDFC', kind: 'bank' }],
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

  section('Options: spend categories, visible everywhere spend reads them');
  const r = SOURCES.spendCategory.add(n, 'Groceries');
  ck('adding returns the new value', r.value === 'Groceries');
  ck('it lands in the spend list', r.db.expenses.spendCategories.includes('Groceries'));
  ck('every spend reader sees it', SOURCES.spendCategory.read(r.db).some((o) => o.value === 'Groceries'));
  ck('it does not appear in the income list', !SOURCES.incomeCategory.read(r.db).some((o) => o.value === 'Groceries'));
  const dup = SOURCES.spendCategory.add(r.db, '  groceries ');
  ck('case/space duplicate reuses existing', dup.existed && dup.value === 'Groceries' && dup.db === r.db);
  ck('empty name rejected', !!SOURCES.spendCategory.add(n, '   ').error);

  const ic = SOURCES.incomeCategory.add(n, 'Bonus');
  ck('income category added to its own list', ic.db.expenses.incomeCategories.includes('Bonus'));
  ck('it does not appear in the spend list', !SOURCES.spendCategory.read(ic.db).some((o) => o.value === 'Bonus'));

  const m = SOURCES.mainCategory.add(n, 'Investments');
  ck('main category can be added (was blocked)', m.db.expenses.mainCategories.includes('Investments'));

  section('Options: categories are independent');
  const s1 = SOURCES.subCategoryList.add(n, 'Cab');
  ck('a sub-category is added to one flat list', s1.db.expenses.subCategoryList.includes('Cab'));
  ck('any category can be used with it', SOURCES.subCategoryList.read(s1.db).some((o) => o.value === 'Cab'));
  ck('old per-parent calls reach the same list', SOURCES.subCategory('Food') === SOURCES.subCategoryList && SOURCES.subCategory('Travel') === SOURCES.subCategoryList);
  ck('spend and income each have their own, independent category list', SOURCES.spendCategory !== SOURCES.incomeCategory && SOURCES.spendCategory.id === 'spendCategory' && SOURCES.incomeCategory.id === 'incomeCategory');

  section('Options: deleting');
  const del = SOURCES.tag.remove(n, 'OFFICE');
  ck('delete is case-insensitive', !del.db.expenses.tags.includes('office'));
  ck('records keep their value', del.db.expenses.txns[0].tags.includes('office'));
  ck('usage counted for the warning', SOURCES.tag.usage(n, 'office') === 1);

  section('Options: accounts');
  const a = SOURCES.account.add(n, 'ICICI Savings', { kind: 'bank', opening: 500 });
  const made = a.db.expenses.accounts.find((x) => x.id === a.value);
  ck('account created with kind and opening', made && made.kind === 'bank' && made.opening === 500);
  ck('read gives id as value, name as label', SOURCES.account.read(a.db).some((o) => o.value === a.value && o.label === 'ICICI Savings'));
  ck('account in use cannot be deleted', !!SOURCES.account.remove(n, 'hdfc').error);
  const freshDel = SOURCES.account.remove(a.db, a.value);
  ck('unused account can be deleted', !freshDel.error && !freshDel.db.expenses.accounts.some((x) => x.id === a.value));
  const solo = { expenses: { txns: [], accounts: [{ id: 'cash', name: 'Cash' }] } };
  ck('last account cannot be deleted', !!SOURCES.account.remove(solo, 'cash').error);

  section('Options: task categories');
  const tc = SOURCES.taskType.add(n, 'Anniversary');
  ck('a task category can be added', tc.db.taskTypes.includes('Anniversary'));
  ck('usage counts tasks of that type', SOURCES.taskType.usage(n, 'Renewal') === 1);

  section('Options: fixed lists');
  const f = fixedSource('p', 'Priority', ['High', 'Low']);
  ck('fixed list reads', f.read().length === 2);
  ck('fixed list refuses additions', !!f.add({}, 'x').error);

  section('Options: union');
  ck('dedupes case-insensitively, first spelling wins', JSON.stringify(union(['Food', 'food', ' FOOD '], ['Bills'])) === '["Food","Bills"]');
  ck('drops blanks and nulls', union(['', null, '  ', 'A']).length === 1);
}

export async function runExtra({ ck, section }) {
  section('Options: account add is repeatable with a fixed id');
  const db = { expenses: { txns: [], accounts: [{ id: 'cash', name: 'Cash' }] } };
  const first = SOURCES.account.add(db, 'Axis', { id: 'acct_axis_1' });
  const second = SOURCES.account.add(db, 'Axis', { id: 'acct_axis_1' });
  ck('same id both times', first.value === 'acct_axis_1' && second.value === 'acct_axis_1');
  ck('applying to already-updated db does not duplicate', SOURCES.account.add(first.db, 'Axis', { id: 'acct_axis_1' }).db.expenses.accounts.length === 2);

  section('Options: editing an account');
  const u = SOURCES.account.update(first.db, 'acct_axis_1', { opening: '2500', kind: 'wallet', name: 'Axis Savings' });
  const acc = u.db.expenses.accounts.find((a) => a.id === 'acct_axis_1');
  ck('opening balance set', acc.opening === 2500);
  ck('kind changed', acc.kind === 'wallet');
  ck('renamed, same id', acc.name === 'Axis Savings' && acc.id === 'acct_axis_1');
  ck('duplicate name refused', !!SOURCES.account.update(first.db, 'acct_axis_1', { name: 'cash' }).error);
  ck('non-number opening refused', !!SOURCES.account.update(first.db, 'acct_axis_1', { opening: 'abc' }).error);
  ck('missing account reported', !!SOURCES.account.update(first.db, 'nope', { opening: 1 }).error);
}
