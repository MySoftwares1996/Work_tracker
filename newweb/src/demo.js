import { blankTask, addDays } from './data';

// Sample tasks for ?demo, so the look can be seen without signing in. Never written anywhere.
const now = new Date();
const at = (days, h = 0, m = 0) => { const d = addDays(now, days); d.setHours(h, m, 0, 0); return d; };
let n = 0;
const mk = (title, o) => ({ ...blankTask(), id: `demo-${n++}`, title, createdAt: at(-3), ...o, due: o.d === undefined ? null : at(o.d, o.h || 0, o.m || 0), hasTime: !!o.h });

export const demoTasks = [
  mk('Pay Delta Logistics - freight bill', { d: 1, category: 'Payments', subCategory: 'Invoice Payment', priority: 'Medium', pendingWith: 'Accounts', status: 'In Progress' }),
  mk('Remit advance to Vertex Pack', { d: 2, category: 'Payments', subCategory: 'Import Payment', priority: 'High', pendingWith: 'Koteswara Rao' }),
  mk('Pay Orion Steel - invoice 5521', { d: 0, category: 'Payments', priority: 'High', done: true, completedAt: at(0, 11, 20), status: 'Completed', subCategory: 'Invoice Payment', subCategoryFields: { 'Name of vendor': 'Orion Steel', 'Invoice No': 'INV-5521', Towards: 'steel coil supply' } }),
  mk('HDFC FD Statement Collation.', { d: 0, h: 10, m: 50, category: "Bank Follow-up's", priority: 'High', pendingWith: 'Pending at Bank', status: 'In Progress', createdAt: at(-6), bankFollowUps: [{ d: '2026-10-10', at: at(-6, 11).toISOString(), remarks: 'Banker will share the statement tomorrow', next: at(1, 10).toISOString() }] }),
  mk('ICICI LC amendment', { d: 2, h: 10, category: "Urgent Bank Follow Up's", priority: 'High', pendingWith: 'Pending at Bank', createdAt: at(-11), bankFollowUps: [{ d: '2026-10-12', at: at(-4, 12).toISOString(), remarks: 'Awaiting head office approval', next: at(2, 10).toISOString() }] }),
  mk('Pay ACME Traders - invoice 4471', { d: 0, category: 'Payments', priority: 'High', done: true, completedAt: at(0, 9, 10), status: 'Completed', keyPoints: [{ key: 'Amount', value: '₹4,35,000' }], notes: 'Paid through RTGS.' }),
  mk('Pay Orion Steel - advance', { d: -3, category: 'Payments', priority: 'High', done: true, completedAt: at(-3, 15), status: 'Completed', keyPoints: [{ key: 'Amount', value: '₹2,70,000' }] }),
  mk('Release vendor payment - ICICI invoice', { d: -2, h: 17, category: 'Payments', subCategory: 'Domestic Payment', priority: 'High', pendingWith: 'Accounts', reference: 'RE: Invoice 4471 - approval', checklist: [{ id: 'c1', text: 'Verify invoice', done: true }, { id: 'c2', text: 'Get approval', done: true }, { id: 'c3', text: 'Upload to bank', done: true }, { id: 'c4', text: 'Release', done: true }, { id: 'c5', text: 'Send advice', done: false }, { id: 'c6', text: 'File copy', done: false }] }),
  mk('Reply to the audit query on cash book', { d: -1, h: 11, category: 'Audit', priority: 'High', pendingWith: 'Auditor' }),
  mk('Bank reconciliation - HDFC current account', { d: 0, h: 15, category: 'Bank', priority: 'Medium', status: 'In Progress' }),
  mk('Call the branch about the cheque book', { d: 0, h: 11, m: 30, category: 'Follow-up', priority: 'Low' }),
  mk('Weekly status mail to the manager', { d: 1, h: 10, category: 'Other', priority: 'Medium', recurrence: 'Weekly' }),
  mk('Prepare month-end closing checklist', { d: 3, category: 'Audit', priority: 'High', notes: 'Cut-off on the 31st; get sign-off from finance.' }),
  mk('Team meeting - quarter plan', { d: 5, h: 14, category: 'Meeting', priority: 'Medium' }),
  mk('Update the vendor master list', { d: 9, category: 'Other', priority: 'Low' }),
  mk('Submit GST payment challan', { d: 0, category: 'Payments', priority: 'High', done: true, completedAt: at(0, 9, 40), status: 'Completed', notes: 'Paid and acknowledged.' }),
  mk('Send salary sheet to HR', { d: -1, category: 'Payments', priority: 'Medium', done: true, completedAt: at(-1, 16, 5), status: 'Completed' }),
  ...(typeof location !== 'undefined' && location.search.includes('alert') ? [mk('test', { d: 0, h: now.getHours(), m: now.getMinutes() - 1, category: 'Follow-up', priority: 'High', pendingWith: 'Pending at Bank', status: 'Pending', reference: '3333333333', subCategory: "Urgent Bank Follow Up's", subCategoryFields: {} })] : []),
  mk('Old reminder', { d: -8, category: 'Other', priority: 'Low', binned: true, binnedAt: at(-1) }),
];
