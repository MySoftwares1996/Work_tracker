import { blankTask, addDays } from './data';

// Sample tasks for ?demo, so the look can be seen without signing in. Never written anywhere.
const now = new Date();
const at = (days, h = 0, m = 0) => { const d = addDays(now, days); d.setHours(h, m, 0, 0); return d; };
let n = 0;
const mk = (title, o) => ({ ...blankTask(), id: `demo-${n++}`, title, createdAt: at(-3), ...o, due: o.d === undefined ? null : at(o.d, o.h || 0, o.m || 0), hasTime: !!o.h });

export const demoTasks = [
  mk('Release vendor payment - ICICI invoice', { d: -2, h: 17, category: 'Payments', priority: 'High', pendingWith: 'Accounts', reference: 'RE: Invoice 4471 - approval' }),
  mk('Reply to the audit query on cash book', { d: -1, h: 11, category: 'Audit', priority: 'High', pendingWith: 'Auditor' }),
  mk('Bank reconciliation - HDFC current account', { d: 0, h: 15, category: 'Bank', priority: 'Medium', status: 'In Progress' }),
  mk('Call the branch about the cheque book', { d: 0, h: 11, m: 30, category: 'Follow-up', priority: 'Low' }),
  mk('Weekly status mail to the manager', { d: 1, h: 10, category: 'Other', priority: 'Medium', recurrence: 'Weekly' }),
  mk('Prepare month-end closing checklist', { d: 3, category: 'Audit', priority: 'High', notes: 'Cut-off on the 31st; get sign-off from finance.' }),
  mk('Team meeting - quarter plan', { d: 5, h: 14, category: 'Meeting', priority: 'Medium' }),
  mk('Update the vendor master list', { d: 9, category: 'Other', priority: 'Low' }),
  mk('Submit GST payment challan', { d: 0, category: 'Payments', priority: 'High', done: true, completedAt: at(0, 9, 40), status: 'Completed', notes: 'Paid and acknowledged.' }),
  mk('Send salary sheet to HR', { d: -1, category: 'Payments', priority: 'Medium', done: true, completedAt: at(-1, 16, 5), status: 'Completed' }),
  ...(typeof location !== 'undefined' && location.search.includes('alert') ? [mk('test', { d: 0, h: now.getHours(), m: now.getMinutes() - 1, category: 'Monthly Activity', priority: 'Medium', pendingWith: 'Self', status: 'Pending' })] : []),
  mk('Old reminder', { d: -8, category: 'Other', priority: 'Low', binned: true, binnedAt: at(-1) }),
];
