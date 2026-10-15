import test from 'node:test';
import assert from 'node:assert/strict';
import { subCategoriesFor, parseSubCategoryLines, addSubCategories, withCarrying, categoryCarriesSubCategory, subCategoryMissing, addSubCategory, removeSubCategory, normalizeSubCategories, splitTime, joinTime, timeLabel, dialAngle, angleToHour, angleToMinute, writeListsValue, addOption, removeOption, blankTask, dayKey, fromDoc, isOverdue, nextOccurrence, parseDue, readCalendar, readLinks, readLists, reportText, stats, toDoc, filterTasks, sortTasks, dueLabel } from '../src/data.js';

const NOW = new Date(2026, 9, 15, 10, 0);
const task = (o) => ({ ...blankTask(), title: 'T', ...o });

test('a due date and time are read from the document', () => {
  const d = parseDue('2026-10-15', '17:30');
  assert.equal(d.getHours(), 17);
  assert.equal(dayKey(d), '2026-10-15');
  assert.equal(parseDue('', ''), null);
  assert.equal(parseDue('nonsense', ''), null);
});

test('a document becomes a task and back, keeping the web-app field names', () => {
  const doc = { id: 'a1', description: 'Pay vendor', category: 'Payments', priority: 'High', status: 'Pending', dueDate: '2026-10-16', dueTime: '09:00', mailChain: 'RE: x', notes: 'n', recurrence: 'Daily', darInclude: false, deleted: false };
  const t = fromDoc('a1', doc);
  assert.equal(t.title, 'Pay vendor');
  assert.equal(t.hasTime, true);
  assert.equal(t.dar, false);
  const out = toDoc(t, NOW);
  assert.equal(out.description, 'Pay vendor');
  assert.equal(out.dueDate, '2026-10-16');
  assert.equal(out.dueTime, '09:00');
  assert.equal(out.mailChain, 'RE: x');
  assert.equal(out.darInclude, false);
  assert.equal(out.deleted, false);
  assert.equal(out.purged, false);
});

test('a completed status means done; reopening writes a pending status', () => {
  const t = fromDoc('b', { description: 'x', status: 'Completed', completedAt: '2026-10-15T09:40:00.000Z' });
  assert.equal(t.done, true);
  assert.equal(toDoc(t, NOW).status, 'Completed');
  assert.equal(toDoc({ ...t, done: false }, NOW).status, 'Pending');
  assert.equal(toDoc({ ...t, done: false }, NOW).completedAt, null);
});

test('the document is written without fields this app does not own (merge keeps the rest)', () => {
  const keys = Object.keys(toDoc(task({}), NOW));
  ['snoozeUntil', 'narration', 'subCategory', 'paymentDetails', 'checklist', 'attachments', 'keyPoints', 'alertMode'].forEach((k) => assert.ok(!keys.includes(k), k));
});

test('overdue and due-today count by calendar day', () => {
  const yesterday = task({ due: new Date(2026, 9, 14, 23, 0) });
  const today = task({ due: new Date(2026, 9, 15, 9, 0) });
  assert.equal(isOverdue(yesterday, NOW), true);
  assert.equal(isOverdue(today, NOW), false);
  const s = stats([yesterday, today, task({ due: new Date(2026, 9, 18) }), task({ done: true, completedAt: new Date(2026, 9, 15, 8) }), task({ binned: true })], NOW);
  assert.deepEqual([s.open, s.overdue, s.dueToday, s.dueSoon, s.doneToday], [3, 1, 1, 1, 1]);
});

test('sorting and filtering', () => {
  const a = task({ title: 'Alpha', priority: 'Low', due: new Date(2026, 9, 20) });
  const b = task({ title: 'Beta mail', priority: 'High', due: new Date(2026, 9, 25), reference: 'invoice 9' });
  assert.deepEqual(sortTasks([b, a], 'due').map((x) => x.title), ['Alpha', 'Beta mail']);
  assert.deepEqual(sortTasks([a, b], 'priority').map((x) => x.title), ['Beta mail', 'Alpha']);
  assert.deepEqual(filterTasks([a, b], { q: 'INVOICE' }).map((x) => x.title), ['Beta mail']);
  assert.deepEqual(filterTasks([a, b], { priority: 'Low' }).map((x) => x.title), ['Alpha']);
});

test('due labels', () => {
  assert.equal(dueLabel(task({ due: new Date(2026, 9, 12) }), NOW), 'Overdue 3 d');
  assert.match(dueLabel(task({ due: new Date(2026, 9, 16) }), NOW), /^Tomorrow/);
  assert.equal(dueLabel(task({}), NOW), 'No due date');
});

test('a repeating task makes its next occurrence, never in the past, never twice', () => {
  const t = task({ id: 'r1', title: 'Weekly mail', recurrence: 'Weekly', due: new Date(2026, 8, 1, 10) });
  const n = nextOccurrence(t, [], NOW);
  assert.ok(n.due >= new Date(2026, 9, 15));
  assert.equal(n.due.getDay(), t.due.getDay());
  assert.equal(n.seriesId, 'r1');
  assert.equal(n.done, false);
  assert.equal(nextOccurrence(t, [n], NOW), null);
  assert.equal(nextOccurrence(task({ recurrence: 'Hourly', due: NOW }), [], NOW), null);
  assert.equal(nextOccurrence(task({ recurrence: "Doesn't repeat", due: NOW }), [], NOW), null);
  const m = nextOccurrence(task({ recurrence: 'Monthly', due: new Date(2026, 0, 31, 9) }), [], new Date(2026, 0, 31));
  assert.equal(m.due.getMonth(), 1);
  assert.equal(m.due.getDate(), 28);
});

test('weekday repeats skip the weekend', () => {
  const fri = task({ recurrence: 'Weekdays', due: new Date(2026, 9, 16, 9) });       // a Friday
  const n = nextOccurrence(fri, [], new Date(2026, 9, 16));
  assert.equal(n.due.getDay(), 1);
});

test('the daily report lists the day\'s DAR tasks and leaves out "Done only"', () => {
  const day = new Date(2026, 9, 15, 12);
  const a = task({ title: 'Paid GST', done: true, completedAt: new Date(2026, 9, 15, 9), category: 'Payments', dar: true });
  const b = task({ title: 'Private chore', done: true, completedAt: new Date(2026, 9, 15, 9), dar: false });
  const c = task({ title: 'Other day', done: true, completedAt: new Date(2026, 9, 14, 9), dar: true });
  const text = reportText([a, b, c], day);
  assert.match(text, /1\. Paid GST \(Payments\)/);
  assert.ok(!text.includes('Private chore'));
  assert.ok(!text.includes('Other day'));
  assert.match(reportText([], day), /No completed activities/);
});

test('lists, calendar and links are read from their documents', () => {
  assert.deepEqual(readLists({ categories: ['A'], priorities: ['P'], statuses: ['S'], pendingWith: ['X'] }), { categories: ['A'], priorities: ['P'], statuses: ['S'], pendingWith: ['X'] });
  assert.deepEqual(readLists(JSON.stringify({ categories: ['A'], assignees: ['Z'] })).pendingWith, ['Z']);
  assert.deepEqual(readLists([['A'], ['P'], ['S'], ['X']]).categories, ['A']);
  assert.ok(readLists(null).categories.length > 0);
  assert.deepEqual(readCalendar({ holidays: ['2026-01-26', { date: '2026-08-15', name: 'Independence Day' }], leaveDays: [] }).holidays, [{ date: '2026-01-26', name: '' }, { date: '2026-08-15', name: 'Independence Day' }]);
  assert.equal(readLinks({ links: [{ id: '1', title: 'G', url: 'https://g.co' }, { id: '2', url: 'javascript:alert(1)' }] }).length, 1);
});

test('options are added once (any case) and removed', () => {
  assert.deepEqual(addOption(['A'], ' b '), ['A', 'b']);
  assert.deepEqual(addOption(['A'], 'a'), ['A']);
  assert.deepEqual(addOption(['A'], '   '), ['A']);
  assert.deepEqual(removeOption(['A', 'B'], 'A'), ['B']);
});

test('lists are written back in the form the document holds, keeping its other keys', () => {
  const lists = { categories: ['C1'], priorities: ['P1'], statuses: ['S1'], pendingWith: ['W1'] };
  const named = writeListsValue({ categories: ['x'], priorities: [], statuses: [], pendingWith: [], subCategories: [1] }, lists);
  assert.deepEqual(named, { categories: ['C1'], priorities: ['P1'], statuses: ['S1'], pendingWith: ['W1'], subCategories: [1] });
  const str = writeListsValue(JSON.stringify({ categories: [], assignees: ['old'], narrationTypes: ['n'] }), lists);
  assert.equal(typeof str, 'string');
  const parsed = JSON.parse(str);
  assert.deepEqual(parsed.assignees, ['W1']);
  assert.deepEqual(parsed.narrationTypes, ['n']);
  assert.deepEqual(writeListsValue({ 0: ['a'], 1: [], 2: [], 3: [] }, lists), { 0: ['C1'], 1: ['P1'], 2: ['S1'], 3: ['W1'] });
  assert.deepEqual(writeListsValue(null, lists), lists);
});

test('an emptied list stays empty instead of coming back as the defaults', () => {
  assert.deepEqual(readLists({ categories: [], priorities: ['High'], statuses: ['Pending'], pendingWith: [] }).categories, []);
});

test('checklist, attachments, key points, custom repeat and alert mode round-trip; empty ones are not invented', () => {
  const doc = { description: 'x', status: 'Pending', checklist: [{ id: 'c1', text: 'Step', done: true }], attachments: [{ id: 'a1', title: 'Inv', url: 'https://x.co/i' }, { id: 'bad', url: 'javascript:1' }], keyPoints: [{ key: 'Inv', value: '9' }], recurrence: 'Custom', recurrenceEveryMin: 45, alertMode: 'alarm' };
  const t = fromDoc('z', doc);
  assert.equal(t.attachments.length, 1);
  const out = toDoc(t, NOW);
  assert.deepEqual(out.checklist, [{ id: 'c1', text: 'Step', done: true }]);
  assert.deepEqual(out.attachments, [{ id: 'a1', title: 'Inv', url: 'https://x.co/i' }]);
  assert.deepEqual(out.keyPoints, [{ key: 'Inv', value: '9' }]);
  assert.equal(out.recurrenceEveryMin, 45);
  assert.equal(out.alertMode, 'alarm');
  const plain = toDoc(task({}), NOW);
  ['checklist', 'attachments', 'keyPoints', 'alertMode', 'recurrenceEveryMin'].forEach((k) => assert.ok(!(k in plain), k));
});

test('the clock picker converts between 24-hour and 12-hour time', () => {
  assert.deepEqual(splitTime('17:30'), { h12: 5, minute: 30, pm: true });
  assert.deepEqual(splitTime('00:05'), { h12: 12, minute: 5, pm: false });
  assert.deepEqual(splitTime('12:00'), { h12: 12, minute: 0, pm: true });
  assert.equal(splitTime(''), null);
  assert.equal(splitTime('25:00'), null);
  assert.equal(joinTime(12, 0, false), '00:00');
  assert.equal(joinTime(12, 0, true), '12:00');
  assert.equal(joinTime(5, 7, true), '17:07');
  for (const t of ['00:00', '06:15', '11:59', '12:30', '23:45']) { const s = splitTime(t); assert.equal(joinTime(s.h12, s.minute, s.pm), t); }
  assert.equal(timeLabel('17:30'), '5:30 PM');
  assert.equal(timeLabel('00:05'), '12:05 AM');
  assert.equal(timeLabel(''), '');
});

test('a point on the dial becomes an hour or a minute', () => {
  assert.equal(Math.round(dialAngle(0, -10)), 0);       // straight up = 12 o'clock
  assert.equal(Math.round(dialAngle(10, 0)), 90);       // right = 3 o'clock
  assert.equal(Math.round(dialAngle(0, 10)), 180);
  assert.equal(Math.round(dialAngle(-10, 0)), 270);
  assert.equal(angleToHour(0), 12);
  assert.equal(angleToHour(90), 3);
  assert.equal(angleToHour(359), 12);
  assert.equal(angleToMinute(0), 0);
  assert.equal(angleToMinute(180), 30);
  assert.equal(angleToMinute(359), 0);
  assert.equal(angleToMinute(138), 23);
});

import { readFileSync } from 'node:fs';
import { THEMES } from '../src/themes.js';
test('every theme in the chooser has its CSS and the tokens the screens use', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.ok(THEMES.length >= 6);
  THEMES.filter((t) => t.id !== 'violet').forEach((t) => {
    const m = new RegExp(`:root\\[data-theme="${t.id}"\\] \\{([^}]*)\\}`).exec(css);
    assert.ok(m, t.id);
    ['--bg', '--surface', '--ink', '--violet', '--on-accent', '--tile-coral', '--tile-teal-fg', '--danger-bg', '--shadow'].forEach((v) => assert.ok(m[1].includes(v + ':'), `${t.id} ${v}`));
  });
});

test('sub categories: read from the lists, shown for the right categories, required before Completed', () => {
  const lists = readLists({ categories: ['Duty Payment', 'Other'], priorities: ['High'], statuses: ['Pending'], pendingWith: [], subCategories: [{ id: 's1', name: 'Customs', fields: [{ label: 'BE No' }, { label: 'Mode', options: ['TT', 'DD'] }] }, 'Plain'], subCategoryCategories: ['Other'] });
  assert.equal(lists.subCategories.length, 2);
  assert.deepEqual(lists.subCategories[1].fields, []);
  assert.equal(categoryCarriesSubCategory(lists, 'Other'), true);
  assert.equal(categoryCarriesSubCategory(lists, 'Duty Payment'), false);      // the list names the categories, so the default is not used
  const t = task({ category: 'Other' });
  assert.match(subCategoryMissing(t, lists), /Select a Sub Category/);
  assert.match(subCategoryMissing({ ...t, subCategory: 'Customs', subCategoryFields: { 'BE No': '1' } }, lists), /Fill in Mode/);
  assert.equal(subCategoryMissing({ ...t, subCategory: 'Customs', subCategoryFields: { 'BE No': '1', Mode: 'TT' } }, lists), '');
  assert.equal(subCategoryMissing(task({ category: 'Duty Payment' }), lists), '');
  // with no list of categories, the phone's own default applies
  const dflt = readLists({ categories: ['Customs Duty', 'Domestic Payment', 'Other'], subCategories: ['X'] });
  assert.deepEqual(['Customs Duty', 'Domestic Payment', 'Other'].map((c) => categoryCarriesSubCategory(dflt, c)), [true, true, false]);
  assert.equal(categoryCarriesSubCategory(readLists({ categories: ['Customs Duty'] }), 'Customs Duty'), false);   // nothing to pick from
});

test('sub categories are added once and deleted, and written back with the lists', () => {
  const a = addSubCategory([], ' Customs ', ['BE No', ' ', 'Mode']);
  assert.equal(a.length, 1);
  assert.deepEqual(a[0].fields, [{ label: 'BE No' }, { label: 'Mode' }]);
  assert.equal(addSubCategory(a, 'customs'), a);
  assert.deepEqual(removeSubCategory(a, a[0].id), []);
  const out = writeListsValue({ categories: [], subCategories: [], narrationTypes: ['n'] }, { categories: ['C'], priorities: [], statuses: [], pendingWith: [], subCategories: a, subCategoryCategories: ['C'] });
  assert.equal(out.subCategories[0].name, 'Customs');
  assert.deepEqual(out.subCategoryCategories, ['C']);
  assert.deepEqual(out.narrationTypes, ['n']);
  assert.equal(normalizeSubCategories(['A', { name: '' }]).length, 1);
});

test('a task keeps its sub category and fields; none is invented', () => {
  const t = fromDoc('q', { description: 'x', status: 'Completed', subCategory: 'Customs', subCategoryFields: { 'BE No': '9' } });
  assert.equal(t.subCategory, 'Customs');
  const out = toDoc(t, NOW);
  assert.equal(out.subCategory, 'Customs');
  assert.deepEqual(out.subCategoryFields, { 'BE No': '9' });
  const plain = toDoc(task({}), NOW);
  assert.ok(!('subCategory' in plain) && !('subCategoryFields' in plain));
  assert.equal(toDoc({ ...t, subCategory: '' }, NOW).subCategory, null);          // cleared on purpose, since the document had one
});

test('sub categories are kept under a category', () => {
  const subs = [{ id: '1', name: 'Domestic Payment', category: 'Payments', fields: [] }, { id: '2', name: 'Statutory Audit', category: 'Audit', fields: [] }, { id: '3', name: 'Old one', category: '', fields: [] }];
  const lists = readLists({ categories: ['Payments', 'Audit', 'Other'], subCategories: subs });
  assert.deepEqual(subCategoriesFor(lists, 'Payments').map((x) => x.name), ['Domestic Payment', 'Old one']);
  assert.deepEqual(subCategoriesFor(lists, 'Audit').map((x) => x.name), ['Statutory Audit', 'Old one']);
  assert.equal(readLists({ subCategories: subs }).subCategories[0].category, 'Payments');
  // a category with sub categories of its own carries them, without being in any list of categories
  assert.equal(categoryCarriesSubCategory(lists, 'Payments'), true);
  assert.equal(categoryCarriesSubCategory(lists, 'Audit'), true);
  assert.equal(categoryCarriesSubCategory(lists, 'Other'), false);
  // written back with its category, and the carrying list gains it
  const out = writeListsValue({}, { categories: [], priorities: [], statuses: [], pendingWith: [], subCategories: lists.subCategories });
  assert.equal(out.subCategories[0].category, 'Payments');
  assert.ok(!('category' in out.subCategories[2]));
  assert.deepEqual(withCarrying({ categories: ['Payments'], subCategoryCategories: ['Audit'] }, 'Payments'), ['Audit', 'Payments']);
  assert.deepEqual(withCarrying({ categories: ['Customs Duty', 'Other'] }, 'Other'), ['Customs Duty', 'Other']);
});

test('several sub categories can be pasted at once', () => {
  const items = parseSubCategoryLines('Domestic Payment: Vendor Name, Invoice No\n\n  Urgent Payment \nImport Payment: Bill of Entry\n: junk');
  assert.deepEqual(items.map((x) => x.name), ['Domestic Payment', 'Urgent Payment', 'Import Payment']);
  const { list, added } = addSubCategories([], items, 'Payments');
  assert.equal(added, 3);
  assert.ok(list.every((x) => x.category === 'Payments'));
  assert.deepEqual(list[0].fields.map((f) => f.label), ['Vendor Name', 'Invoice No']);
  assert.equal(addSubCategories(list, items, 'Audit').added, 0);       // a name is kept once across categories
});
