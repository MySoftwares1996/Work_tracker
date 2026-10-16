import test from 'node:test';
import assert from 'node:assert/strict';
import { planImport, rowToDoc, backupSection } from '../src/importBackup.js';
import { narrationOf, finalNarration, isPaymentCategory, planFormatSetup, placeholdersOf, renderTemplate, findFormat, unmatchedMarks, SAMPLE_FORMATS } from '../src/reportFormats.js';
import { breakdown, subBreakdown, bankFollowUpDesk, geminiText, buildReportPrompt, numbersLost, templateFrom, applyTemplate, saveTemplate, readTemplates, upcomingWarnings, dueResponse, isDueToday, pendingAlerts, dueAlertAt, alertHeading, moveTask, SNOOZES, validateSubCategory, applySubCategoryEdit, categoryAsksReminder, toggleReminderCategory, reminderFrom, isReminderDue, reminderLabel, subCategoriesFor, parseSubCategoryLines, addSubCategories, withCarrying, categoryCarriesSubCategory, subCategoryMissing, addSubCategory, removeSubCategory, normalizeSubCategories, splitTime, joinTime, timeLabel, dialAngle, angleToHour, angleToMinute, writeListsValue, addOption, removeOption, blankTask, dayKey, fromDoc, isOverdue, nextOccurrence, parseDue, readCalendar, readLinks, readLists, reportText, stats, toDoc, filterTasks, sortTasks, dueLabel } from '../src/data.js';

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

test('overdue, due today and pending as on today are counted as the phone app counts them', () => {
  // NOW is 15 Oct 2026 10:00
  const yesterday = task({ id: 'y', due: new Date(2026, 9, 14, 23, 0), hasTime: true });
  const todayPast = task({ id: 'tp', due: new Date(2026, 9, 15, 9, 0), hasTime: true });        // timed, its time has passed: overdue
  const todayLater = task({ id: 'tl', due: new Date(2026, 9, 15, 17, 0), hasTime: true });      // timed, still to come: due today
  const todayDateOnly = task({ id: 'td', due: new Date(2026, 9, 15), hasTime: false });          // a date only: due all today
  const yDateOnly = task({ id: 'yd', due: new Date(2026, 9, 14), hasTime: false });
  assert.equal(isOverdue(yesterday, NOW), true);
  assert.equal(isOverdue(todayPast, NOW), true);
  assert.equal(isOverdue(todayLater, NOW), false);
  assert.equal(isOverdue(todayDateOnly, NOW), false);
  assert.equal(isOverdue(yDateOnly, NOW), true);
  assert.equal(isDueToday(todayPast, NOW), false);          // overdue is not also "due today"
  assert.equal(isDueToday(todayLater, NOW), true);
  assert.equal(isDueToday(todayDateOnly, NOW), true);
  const rows = [yesterday, todayPast, todayLater, todayDateOnly, yDateOnly, task({ id: 'n7', due: new Date(2026, 9, 18) }), task({ id: 'nd', status: 'Pending' }), task({ id: 'dn', done: true, completedAt: new Date(2026, 9, 15, 8) }), task({ id: 'b', binned: true, due: new Date(2026, 9, 14) })];
  const s = stats(rows, NOW);
  assert.equal(s.overdue, 3);              // yesterday, today past, yesterday date-only
  assert.equal(s.dueToday, 2);
  assert.equal(s.pendingAsOnToday, 5);     // overdue + due today
  assert.equal(s.dueSoon, 1);
  assert.equal(s.noDueDate, 1);
  assert.equal(s.pending, 1);
  assert.equal(s.thisMonth, 6);
  assert.equal(s.open, 7);
  assert.equal(s.doneToday, 1);
});

test('the Register can be filtered by due bucket and status, as the Dashboard tiles open it', () => {
  const a = task({ id: 'a', title: 'A', due: new Date(2026, 9, 14, 9), hasTime: true, status: 'Pending' });
  const b = task({ id: 'b', title: 'B', due: new Date(2026, 9, 15, 17), hasTime: true, status: 'In Progress' });
  const c = task({ id: 'c', title: 'C', status: 'Pending' });
  const names = (o) => filterTasks([a, b, c], o, NOW).map((x) => x.title);
  assert.deepEqual(names({ due: 'pending' }), ['A', 'B']);
  assert.deepEqual(names({ due: 'overdue' }), ['A']);
  assert.deepEqual(names({ due: 'today' }), ['B']);
  assert.deepEqual(names({ due: 'none' }), ['C']);
  assert.deepEqual(names({ status: 'Pending' }), ['A', 'C']);
  assert.deepEqual(names({ due: 'pending', status: 'Pending' }), ['A']);
  assert.deepEqual(names({}), ['A', 'B', 'C']);
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
  assert.match(subCategoryMissing({ ...t, subCategory: 'Customs', subCategoryFields: { 'BE No': '1' } }, lists), /missing: Mode/);
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

test('the next reminder is asked only under the categories that need it', () => {
  const lists = readLists({ categories: ['Payments', 'Audit'], reminderCategories: ['Payments'] });
  assert.equal(categoryAsksReminder(lists, 'Payments'), true);
  assert.equal(categoryAsksReminder(lists, 'Audit'), false);
  assert.equal(categoryAsksReminder(readLists({ categories: ['Payments'] }), 'Payments'), false);     // nothing chosen yet = not asked
  assert.deepEqual(toggleReminderCategory(lists, 'Audit').reminderCategories, ['Payments', 'Audit']);
  assert.deepEqual(toggleReminderCategory(lists, 'Payments').reminderCategories, []);
  const out = writeListsValue({ narrationTypes: ['n'] }, { ...lists, reminderCategories: ['Audit'] });
  assert.deepEqual(out.reminderCategories, ['Audit']);
  assert.deepEqual(out.narrationTypes, ['n']);
});

test('a next reminder date and time is kept on the task, and shown as due once it has passed', () => {
  const d = reminderFrom('2026-10-20', '17:30');
  assert.equal(d.getHours(), 17);
  assert.equal(reminderFrom('2026-10-20', '').getHours(), 9);      // no time chosen = 9:00 AM
  assert.equal(reminderFrom('', '17:30'), null);
  const t = fromDoc('r', { description: 'x', status: 'Pending', nextReminderAt: d.toISOString() });
  assert.equal(t.nextReminder.getTime(), d.getTime());
  assert.equal(toDoc(t, NOW).nextReminderAt, d.toISOString());
  assert.equal(toDoc({ ...t, nextReminder: null }, NOW).nextReminderAt, null);                  // cleared on purpose, since the document had one
  assert.ok(!('nextReminderAt' in toDoc(task({}), NOW)));                                       // none invented
  assert.equal(isReminderDue(task({ nextReminder: new Date(2026, 9, 15, 9, 0) }), NOW), true);
  assert.equal(isReminderDue(task({ nextReminder: new Date(2026, 9, 15, 11, 0) }), NOW), false);
  assert.equal(isReminderDue(task({ done: true, nextReminder: new Date(2026, 9, 14) }), NOW), false);
  assert.match(reminderLabel(task({ nextReminder: new Date(2026, 9, 16, 9, 0) }), NOW), /^Tomorrow/);
});

test('a Sub Category can be edited: renamed, fields renamed, added and removed, with choices', () => {
  const list = [{ id: 'a', name: 'Domestic Payment', category: 'Payments', fields: [{ label: 'Vendor' }, { label: 'Inv No' }] }, { id: 'b', name: 'Urgent Payment', category: 'Payments', fields: [] }];
  assert.equal(validateSubCategory(list, 'a', ' ', []), 'Give the Sub Category a name.');
  assert.match(validateSubCategory(list, 'a', 'urgent payment', []), /already exists/);
  assert.equal(validateSubCategory(list, 'a', 'domestic payment', []), '');
  assert.match(validateSubCategory(list, 'a', 'X', [{ label: 'Vendor' }, { label: ' vendor ' }]), /same name/);
  assert.equal(validateSubCategory(list, 'a', 'X', [{ label: '' }, { label: '' }]), '');
  const out = applySubCategoryEdit(list, 'a', ' Domestic Pay ', [{ label: 'Vendor Name' }, { label: '' }, { label: 'Mode', options: 'TT, DD, ,' }, { label: 'Ref' }]);
  assert.equal(out[0].name, 'Domestic Pay');
  assert.deepEqual(out[0].fields, [{ label: 'Vendor Name' }, { label: 'Mode', options: ['TT', 'DD'] }, { label: 'Ref' }]);
  assert.equal(out[0].category, 'Payments');
  assert.equal(out[0].id, 'a');
  assert.equal(out[1], list[1]);
  assert.deepEqual(applySubCategoryEdit(list, 'a', 'X', []).find((x) => x.id === 'a').fields, []);
});

test('an alert comes at the due time, once, and respects snooze, silence and skip', () => {
  const now = new Date(2026, 9, 15, 18, 45, 30);
  const due = task({ id: 'd1', due: new Date(2026, 9, 15, 18, 45), hasTime: true, priority: 'Medium' });
  assert.equal(pendingAlerts([due], now).length, 1);
  assert.equal(alertHeading(pendingAlerts([due], now)[0]), 'Medium priority due now');
  assert.equal(pendingAlerts([{ ...due, due: new Date(2026, 9, 15, 18, 46) }], now).length, 0);               // not yet
  assert.equal(pendingAlerts([{ ...due, due: new Date(2026, 9, 15, 5, 0) }], now).length, 0);                  // fell due over 12 hours ago: not popped up on opening
  const key = pendingAlerts([due], now)[0].key;
  assert.equal(pendingAlerts([due], now, new Set([key])).length, 0);                                           // shown once
  assert.equal(pendingAlerts([{ ...due, snoozeUntil: now.getTime() + 600000 }], now).length, 0);               // snoozed
  const later = new Date(now.getTime() + 601000);
  const again = pendingAlerts([{ ...due, snoozeUntil: now.getTime() + 600000 }], later);
  assert.equal(again.length, 1);                                                                               // rings again when the snooze ends
  assert.notEqual(again[0].key, key);
  assert.equal(pendingAlerts([{ ...due, lastAckDate: '2026-10-15' }], now).length, 0);                          // silenced today
  assert.equal(pendingAlerts([{ ...due, skippedDates: ['2026-10-15'] }], now).length, 0);                       // skipped today
  assert.equal(pendingAlerts([{ ...due, done: true }], now).length, 0);
  assert.equal(pendingAlerts([{ ...due, binned: true }], now).length, 0);
});

test('a task with a date but no time alerts at 9:00 AM; a next reminder alerts too', () => {
  const dateOnly = task({ id: 'd2', due: new Date(2026, 9, 15), hasTime: false });
  assert.equal(dueAlertAt(dateOnly).getHours(), 9);
  assert.equal(pendingAlerts([dateOnly], new Date(2026, 9, 15, 8, 59)).length, 0);
  assert.equal(pendingAlerts([dateOnly], new Date(2026, 9, 15, 9, 1)).length, 1);
  const rem = task({ id: 'd3', nextReminder: new Date(2026, 9, 15, 10, 0) });
  const a = pendingAlerts([rem], new Date(2026, 9, 15, 10, 1));
  assert.equal(a.length, 1);
  assert.equal(a[0].kind, 'reminder');
  assert.equal(alertHeading(a[0]), 'Reminder due now');
  assert.equal(pendingAlerts([task({ id: 'd4' })], new Date()).length, 0);                                     // no due date, no alert
  assert.deepEqual(SNOOZES.map((x) => x[0]), [15, 30, 60, 120, 180, 300]);
});

test('snooze, silence and skip are saved with the task in the phone app\'s own fields; moving clears them', () => {
  const t = fromDoc('s', { description: 'x', status: 'Pending', dueDate: '2026-10-15', dueTime: '18:45', snoozeUntil: 1790000000000, lastAckDate: '2026-10-15', skippedDates: ['2026-10-14'] });
  assert.equal(t.snoozeUntil, 1790000000000);
  const out = toDoc(t, NOW);
  assert.equal(out.snoozeUntil, 1790000000000);
  assert.equal(out.lastAckDate, '2026-10-15');
  assert.deepEqual(out.skippedDates, ['2026-10-14']);
  const plain = toDoc(task({}), NOW);
  ['snoozeUntil', 'lastAckDate', 'skippedDates'].forEach((k) => assert.ok(!(k in plain), k));
  const moved = moveTask(t, '2026-10-16', '10:30', 'In Progress', 'Daily');
  assert.equal(moved.due.getHours(), 10);
  assert.equal(moved.status, 'In Progress');
  assert.equal(moved.recurrence, 'Daily');
  assert.equal(moved.snoozeUntil, 0);
  assert.equal(moved.lastAckDate, '');
  assert.equal(toDoc(moved, NOW).snoozeUntil, null);                                                           // cleared, since the document had one
});

test('the daily report carries the banker\'s reply (a sub category field) and the notes', () => {
  const day = new Date(2026, 9, 15, 12);
  const t = task({ title: 'HDFC FD Statement Collation.', category: "Bank Follow-up's", done: true, completedAt: new Date(2026, 9, 15, 9), dar: true, subCategory: "Urgent Bank Follow Up's", subCategoryFields: { "Banker's Reply's:": 'Need to collect on an urgent basis', Empty: ' ' }, notes: 'Called twice.\nStatement due tomorrow.' });
  const text = reportText([t], day);
  assert.match(text, /Urgent Bank Follow Up's - Banker's Reply's: Need to collect on an urgent basis/);
  assert.match(text, /Notes: Called twice\. Statement due tomorrow\./);
  assert.ok(!text.includes('Empty'));
  assert.ok(!reportText([t], day, { subFields: false }).includes("Banker's Reply's"));
  const only = reportText([task({ title: 'Plain', done: true, completedAt: new Date(2026, 9, 15, 9), dar: true, notes: 'n' })], day);
  assert.ok(!only.includes('undefined') && /Notes: n/.test(only));
});

const backup = () => ({
  app: 'My_Personal_Tracker', exportedAt: '2026-10-10T08:00:00.000Z',
  data: { workingDashboard: {
    categories: ['Payments', 'Audit'], priorities: ['High', 'Low'], statuses: ['Pending', 'Completed'], assignees: ['Accounts', 'Self'],
    subCategories: [{ id: 's1', name: 'Domestic Payment', fields: [{ label: 'Vendor' }] }, 'Urgent Payment'], subCategoryCategories: ['Payments'],
    narrationTypes: [{ name: 'Imports', fields: [] }], holidays: [{ date: '2026-01-26', name: 'Republic Day' }], leaveDays: [],
    entries: [
      { id: 'e1', title: 'Pay vendor', category: 'Payments', priority: 'High', status: 'Pending', pendingWith: 'Accounts', dueAt: '2026-10-20T11:30:00.000Z', reference: 'RE: inv', notes: 'n', recurrence: 'weekly', dar: false, subCategory: 'Domestic Payment', subCategoryFields: { Vendor: 'ACME' }, bankFollowUps: [{ d: '2026-10-09', remarks: 'called' }], narration: { typeName: 'Imports' }, updatedAt: 1760000000000 },
      { id: 'e2', title: 'Done thing', status: 'Completed', done: true, completedAt: '2026-10-09T10:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z' },
      { id: 'e3', title: 'Binned', binned: true, binnedAt: '2026-10-08T00:00:00.000Z' },
      { id: 'web1', description: 'From the website', status: 'Pending', dueDate: '2026-10-21', dueTime: '10:00', mailChain: 'x', category: 'Audit' },
      { id: 'gone', title: 'Purged', purged: true },
      { title: 'no id' },
    ],
  } },
});

test('a backup file becomes tasks, lists and sub categories to write', () => {
  const plan = planImport(backup(), { ids: new Set(['e2']), lists: { categories: ['Other', 'audit'], priorities: [], statuses: ['Pending'], pendingWith: ['Self'], subCategories: [] } }, NOW);
  assert.deepEqual(plan.tasks.map((x) => x.id), ['e1', 'e3', 'web1']);            // e2 exists, 'gone' was purged, the last row has no id
  assert.equal(plan.summary.skippedExisting, 1);
  assert.equal(plan.summary.notTasks, 2);
  const e1 = plan.tasks[0].doc;
  assert.equal(e1.description, 'Pay vendor');
  assert.equal(e1.dueDate.length, 10);
  assert.equal(e1.recurrence, 'Weekly');
  assert.equal(e1.darInclude, false);
  assert.equal(e1.subCategory, 'Domestic Payment');
  assert.deepEqual(e1.subCategoryFields, { Vendor: 'ACME' });
  assert.deepEqual(e1.bankFollowUps, [{ d: '2026-10-09', remarks: 'called' }]);         // carried over untouched
  assert.deepEqual(e1.narration, { typeName: 'Imports' });
  assert.equal(e1.updatedAt, 1760000000000);
  assert.equal(plan.tasks[1].doc.deleted, true);
  assert.equal(plan.tasks[2].doc.description, 'From the website');                    // a website-shaped row is written as it is
  assert.equal(JSON.stringify(plan).includes('undefined'), false);
  // lists are added to, never replaced; case-insensitive duplicates are not repeated
  assert.deepEqual(plan.lists.categories, ['Other', 'audit', 'Payments']);
  assert.deepEqual(plan.lists.pendingWith, ['Self', 'Accounts']);
  assert.deepEqual(plan.lists.subCategories.map((x) => [x.name, x.category]), [['Domestic Payment', 'Payments'], ['Urgent Payment', 'Payments']]);   // grouped under the one category that carries them
  assert.deepEqual(plan.lists.subCategoryCategories, ['Payments']);
  assert.equal(plan.lists.narrationTypes.length, 1);
  assert.equal(plan.calendar.holidays.length, 1);
  assert.ok(!('leaveDays' in plan.calendar));
  assert.equal(plan.summary.subCategories, 2);
});

test('importing again adds nothing twice, and overwrite replaces; a wrong file is refused', () => {
  const again = planImport(backup(), { ids: new Set(['e1', 'e2', 'e3', 'web1']), lists: { categories: ['Payments', 'Audit'], priorities: ['High', 'Low'], statuses: ['Pending', 'Completed'], pendingWith: ['Accounts', 'Self'], subCategories: [{ id: 'x', name: 'domestic payment', fields: [], category: 'Payments' }, { id: 'y', name: 'Urgent Payment', fields: [], category: 'Payments' }] } }, NOW);
  assert.equal(again.tasks.length, 0);
  assert.equal(again.summary.subCategories, 0);
  assert.equal(planImport(backup(), { ids: new Set(['e1']), overwrite: true }, NOW).tasks.some((x) => x.id === 'e1'), true);
  assert.throws(() => planImport({ nothing: 1 }), /not a Working Dashboard/);
  assert.equal(rowToDoc({ id: 'p', purged: true }), null);
  assert.equal(backupSection({ data: { workingDashboard: { entries: [] } } }).entries.length, 0);
  // two carrying categories: the sub categories are not guessed onto one of them
  const two = backup(); two.data.workingDashboard.subCategoryCategories = ['Payments', 'Audit'];
  assert.ok(planImport(two, {}, NOW).lists.subCategories.every((x) => x.category === ''));
});

test('a timed task gives a notification-only heads-up within the hour before it is due', () => {
  const now = new Date(2026, 9, 15, 10, 0);
  const t = task({ title: 'Call bank', due: new Date(2026, 9, 15, 10, 45), hasTime: true });
  assert.equal(upcomingWarnings([t], now).length, 1);
  assert.equal(upcomingWarnings([{ ...t, due: new Date(2026, 9, 15, 11, 30) }], now).length, 0);   // more than an hour away
  assert.equal(upcomingWarnings([{ ...t, hasTime: false }], now).length, 0);                       // date only: no heads-up
  assert.equal(upcomingWarnings([{ ...t, due: new Date(2026, 9, 15, 9, 59) }], now).length, 0);    // already due
  assert.equal(upcomingWarnings([t], now, new Set([upcomingWarnings([t], now)[0].key])).length, 0);
});

test('the due response follows the task\'s own alert choice', () => {
  assert.deepEqual(dueResponse({ alertMode: 'alarm' }, { popup: false, sound: false }), { popup: true, sound: true });
  assert.deepEqual(dueResponse({ alertMode: 'gentle' }, { popup: true, sound: true }), { popup: false, sound: false });
  assert.deepEqual(dueResponse({ alertMode: '' }, { popup: true, sound: false }), { popup: true, sound: false });
});

test('a template keeps the usual fields, never the dates, and starts a new task', () => {
  const src = task({ title: 'Month-end reconciliation', category: 'Payments', priority: 'High', notes: 'Check ledgers', due: new Date(2026, 9, 31), keyPoints: [{ key: 'Ledger', value: 'HDFC' }], checklist: [{ id: 'a', text: 'Export', done: true }] });
  const tpl = templateFrom(src);
  assert.equal(tpl.name, 'Month-end reconciliation');
  assert.ok(!('due' in tpl.fields) && !('dueDate' in tpl.fields));
  assert.deepEqual(tpl.fields.keyPoints, [{ key: 'Ledger', value: '' }]);
  assert.equal(tpl.fields.checklist[0].done, false);
  const fresh = applyTemplate(blankTask(), tpl);
  assert.equal(fresh.category, 'Payments');
  assert.equal(fresh.priority, 'High');
  assert.equal(fresh.due, null);
  const list = saveTemplate(saveTemplate([], tpl), { ...tpl, id: 'other' });                 // same name replaces
  assert.equal(list.length, 1);
  assert.deepEqual(readTemplates({ templates: list }).map((x) => x.name), ['Month-end reconciliation']);
});

test('the Gemini prompt keeps the draft and the person\'s instructions; lost numbers are found', () => {
  const p = buildReportPrompt('1. Paid vendor 12500 (Payments)', 'Two lines per task');
  assert.match(p, /Paid vendor 12500/);
  assert.match(p, /Two lines per task/);
  assert.ok(!/MY INSTRUCTIONS/.test(buildReportPrompt('x', '')));
  assert.deepEqual(numbersLost('Paid 12,500', 'Paid 12500'), []);
  assert.deepEqual(numbersLost('Paid 12,500 and 4471', 'Paid 12500'), ['4471']);
});

test('the Gemini API reply text is read from its parts', () => {
  assert.equal(geminiText({ candidates: [{ content: { parts: [{ text: 'Hello ' }, { text: 'world' }] } }] }), 'Hello world');
  assert.equal(geminiText({ candidates: [] }), '');
  assert.equal(geminiText(null), '');
});

test('the Dashboard bank desk lists open bank follow-ups, longest open first, with the banker\'s update', () => {
  const now = new Date(2026, 9, 16, 12);
  const old = task({ title: 'ICICI LC', category: "Bank Follow-up's", bankFollowUps: [{ d: '2026-10-05', at: new Date(2026, 9, 5, 10).toISOString(), remarks: 'Awaiting head office', next: new Date(2026, 9, 18, 10).toISOString() }] });
  const fresh = task({ title: 'HDFC FD', category: "Urgent Bank Follow Up's", createdAt: new Date(2026, 9, 14), subCategoryFields: { "Banker's Reply's:": 'Will share tomorrow' } });
  const other = task({ title: 'Not a bank task', category: 'Audit' });
  const rows = bankFollowUpDesk([fresh, other, old, { ...old, id: 'x', done: true }], now);
  assert.deepEqual(rows.map((r) => r.t.title), ['ICICI LC', 'HDFC FD']);
  assert.equal(rows[0].update, 'Awaiting head office');
  assert.equal(rows[0].days, 12);
  assert.equal(rows[1].update, 'Will share tomorrow');
});

test('a report format fills its marks from the Sub Category fields, then Key Points, and shows what is missing', () => {
  const e = { title: 'Pay ACME', subCategory: 'Invoice Payment', subCategoryFields: { 'Name of vendor or suppler:': 'ACME Traders', 'Invoice No': 'INV-4471', 'Amount paid': '' }, keyPoints: [{ key: 'Amount', value: '4,35,000' }] };
  assert.deepEqual(placeholdersOf('{Name}: Being paid against {Invoice No} for {Amount} {Amount}'), ['Name', 'Invoice No', 'Amount']);
  const r = renderTemplate('{Name}: - Being amount paid against Invoice No. {Invoice No} towards {Towards}, amounting to ₹{Amount}.', e);
  assert.equal(r.text, 'ACME Traders: - Being amount paid against Invoice No. INV-4471 towards [Towards], amounting to ₹4,35,000.');
  assert.deepEqual(r.missing, ['Towards']);
});

test('a format is found by Sub Category name, also when one name contains the other', () => {
  assert.equal(findFormat(SAMPLE_FORMATS, 'Imports Payment').subCategory, 'Imports Payment Initiation');
  assert.equal(findFormat(SAMPLE_FORMATS, 'invoice payment').subCategory, 'Invoice Payment');
  assert.equal(findFormat(SAMPLE_FORMATS, "Employee Advance's").subCategory, "Employee Advance's");
  assert.equal(findFormat(SAMPLE_FORMATS, 'Something else'), null);
  assert.equal(findFormat(SAMPLE_FORMATS, ''), null);
});

test('marks with no field in the Sub Category are listed, so they can be added', () => {
  assert.deepEqual(unmatchedMarks('{Name} paid {Invoice No} on {Date paid}', ['Name of vendor', 'Invoice no']), ['Date paid']);
});

test('the sample formats from the owner\'s sheet all have text and marks', () => {
  assert.ok(SAMPLE_FORMATS.length >= 23);
  assert.ok(SAMPLE_FORMATS.every((f) => f.subCategory && f.template.length > 20));
  const imp = renderTemplate(findFormat(SAMPLE_FORMATS, 'Imports Payment').template, { subCategoryFields: { 'Name of vendor or suppler:': 'Orion Steel', 'Payment type:': 'Advance', '% of payment:': '30', 'Type:': 'against dispatch', 'USD amount:': '12,000', 'Bank:': 'ICICI', 'Reference no:': 'RF-9', 'Current status:': 'Pending with bank for processing' } });
  assert.equal(imp.missing.length, 0);
  assert.match(imp.text, /in favour of Orion Steel towards the 30% Advance payment against dispatch for USD 12,000 through ICICI, Reference No\. RF-9\. Current Status: Pending with bank for processing\./);
});

test('the setup from the formats creates only the missing categories and sub categories, with a field for each mark', () => {
  const lists = { categories: ['Payments', 'Audit'], subCategories: [{ id: 'a', name: 'Invoice Payment', category: 'Payments', fields: [{ label: 'Name of vendor' }] }, { id: 'b', name: 'Imports Payment', category: 'Payments', fields: [] }], subCategoryCategories: ['Payments'] };
  const plan = planFormatSetup(lists, SAMPLE_FORMATS);
  assert.deepEqual(plan.categories, ['Import Payments', 'Duty Payments', 'HR Statutory Payment', 'Monthly Payments']);
  const names = plan.subCategories.map((x) => x.name);
  assert.ok(!names.includes('Invoice Payment') && !names.includes('Imports Payment Initiation'));   // already there (also by containment)
  assert.ok(names.includes('Custom Duty Payment') && names.includes('PO Advance Payment'));
  const po = plan.subCategories.find((x) => x.name === 'PO Advance Payment');
  assert.deepEqual(po.labels, ['Name', 'Advance %', 'PO No', 'Amount']);
  assert.equal(plan.lists.subCategories.find((x) => x.name === 'Invoice Payment').fields.length, 1);   // an existing one is not touched
  assert.ok(plan.lists.subCategoryCategories.includes('Duty Payments'));
  const again = planFormatSetup(plan.lists, SAMPLE_FORMATS);
  assert.equal(again.categories.length + again.subCategories.length, 0);                              // nothing left to create
});

test('the Dashboard breakdowns count open tasks by category, status, person and priority, and a category by sub category', () => {
  const now = new Date(2026, 9, 16, 12);
  const list = [
    task({ id: '1', category: 'Payments', subCategory: 'Invoice Payment', priority: 'High', status: 'Pending', pendingWith: 'Accounts', due: new Date(2026, 9, 14) }),
    task({ id: '2', category: 'Payments', subCategory: 'Invoice Payment', priority: 'Low', status: 'In Progress', pendingWith: 'Accounts', due: new Date(2026, 9, 20) }),
    task({ id: '3', category: 'Payments', subCategory: '', priority: 'High', status: 'Pending', pendingWith: '' }),
    task({ id: '4', category: 'Audit', priority: 'High', status: 'Pending', pendingWith: 'Auditor' }),
    task({ id: '5', category: 'Payments', subCategory: 'Invoice Payment', done: true }),
  ];
  assert.deepEqual(breakdown(list, 'category', now).map((r) => [r.name, r.count]), [['Payments', 3], ['Audit', 1]]);
  assert.deepEqual(breakdown(list, 'priority', now).map((r) => [r.name, r.count]), [['High', 3], ['Low', 1]]);
  assert.equal(breakdown(list, 'pendingWith', now).find((r) => r.name === '').label, 'Not set');
  assert.equal(breakdown(list, 'status', now)[0].count, 3);
  const subs = subBreakdown(list, 'Payments', now);
  assert.deepEqual(subs.map((r) => [r.label, r.count, r.overdue]), [['Invoice Payment', 2, 1], ['No sub category', 1, 0]]);
});

test('the Register filter can pick a sub category, or the tasks with none', () => {
  const list = [task({ id: 'a', category: 'P', subCategory: 'X' }), task({ id: 'b', category: 'P', subCategory: '' }), task({ id: 'c', category: 'P', subCategory: 'Y' })];
  assert.deepEqual(filterTasks(list, { category: 'P', subCategory: 'X' }).map((t) => t.id), ['a']);
  assert.deepEqual(filterTasks(list, { category: 'P', subCategory: '__none' }).map((t) => t.id), ['b']);
});

test('the Final Narration is what follows the dash of a payment line, for Payments categories only', () => {
  const entry = { category: 'Payments', subCategory: 'PO Advance Payment', subCategoryFields: { 'Name of vendor': 'Techwizer Infotech Private Limited', 'Advance %': '100', 'PO No': 'INPO/PP/26-27/0154', Amount: '16,22,933.00' } };
  const line = renderTemplate(findFormat(SAMPLE_FORMATS, 'PO Advance Payment').template, entry).text;
  assert.equal(line, 'Techwizer Infotech Private Limited: - Being 100% advance amount paid against the Po No: INPO/PP/26-27/0154 & Amount: 16,22,933.00/-');
  assert.equal(narrationOf(line), 'Being 100% advance amount paid against the Po No: INPO/PP/26-27/0154 & Amount: 16,22,933.00/-');
  assert.equal(finalNarration(entry, SAMPLE_FORMATS).text, narrationOf(line));
  assert.equal(finalNarration({ ...entry, category: 'Audit' }, SAMPLE_FORMATS), null);                    // not a Payments category
  assert.equal(finalNarration({ ...entry, subCategory: 'Something else' }, SAMPLE_FORMATS), null);       // no format
  assert.equal(narrationOf('Made the payment for TDS - with Month: Sept'), 'Made the payment for TDS - with Month: Sept');   // no ": -": the whole line
  assert.ok(isPaymentCategory('Import Payments') && isPaymentCategory('Monthly Payments') && !isPaymentCategory('Audit'));
  assert.deepEqual(finalNarration({ ...entry, subCategoryFields: {} }, SAMPLE_FORMATS).missing, ['Name', 'Advance %', 'PO No', 'Amount']);
});

test('HR Statutory and Monthly Payments formats: short names match exactly, the line is written from the fields', () => {
  const f = (name) => findFormat(SAMPLE_FORMATS, name);
  assert.equal(f('ESI').subCategory, 'ESI');
  assert.equal(f('PT').subCategory, 'PT');
  assert.equal(f('Prompt'), null);
  const entry = { category: 'HR Statutory Payment', subCategory: 'EPFO', subCategoryFields: { Month: 'September 2026', 'Liability Period': 'Aug 2026', 'Amount Paid': '1,00,000', 'Payment Date': '15-10-2026', Status: 'Completed' } };
  assert.equal(renderTemplate(f('EPFO').template, entry).text, 'Made the payment for EPFO for the month of September 2026 - with Month: September 2026, Liability Period: Aug 2026, Amount Paid: 1,00,000, Payment Date: 15-10-2026, Status: Completed.');
  assert.ok(f('Monthly TDS Payments by Section wise: ').template.includes('{TDS Section & Code}'));
});

test('Rent Payments format is written from its fields', () => {
  const f = findFormat(SAMPLE_FORMATS, 'Rent Payments');
  assert.equal(renderTemplate(f.template, { subCategoryFields: { Month: 'October 2026', Premises: 'Head Office', Amount: '85,000' } }).text, 'Being amount paid towards rent for the month of October 2026 for Head Office, amounting to ₹85,000.');
});
