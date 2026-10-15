/**
 * An audit trail on every task: what changed, when, and from which device (the last 30 lines, on the task itself, so
 * both devices show the same history). Lines are short: "Status: Pending → In-Progress", "Due moved to 12 Oct 5:00 PM".
 */
const MAX = 30;
const FIELDS = [['title', 'Task'], ['category', 'Category'], ['priority', 'Priority'], ['status', 'Status'], ['pendingWith', 'Pending with'], ['recurrence', 'Repeat'], ['reference', 'Mail chain']];
const dt = (iso) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }); };
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Adds lines (strings) to an audit list: newest first, at most 30. */
export function addAudit(list = [], lines, by = 'phone', now = Date.now()) {
  const add = (Array.isArray(lines) ? lines : [lines]).filter(Boolean).map((what) => ({ at: now, by, what: String(what).slice(0, 160) }));
  return add.length ? [...add, ...(Array.isArray(list) ? list : [])].slice(0, MAX) : (Array.isArray(list) ? list : []);
}

/** What changed between two versions of a task, as short lines (nothing when nothing did). */
export function auditDiff(prev, next) {
  if (!prev) return ['Created'];
  const out = [];
  FIELDS.forEach(([k, label]) => {
    if (!same(prev[k], next[k])) out.push(k === 'title' ? 'Task text changed' : k === 'reference' ? 'Mail chain changed' : `${label}: ${prev[k] || '-'} → ${next[k] || '-'}`);
  });
  if (!same(prev.dueAt, next.dueAt)) out.push(next.dueAt ? `Due moved to ${dt(next.dueAt)}` : 'Due date cleared');
  if (!same(prev.deadlineAt, next.deadlineAt)) out.push(next.deadlineAt ? `Deadline set to ${dt(next.deadlineAt)}` : 'Deadline cleared');
  if (!same(prev.notes, next.notes)) out.push('Notes edited');
  if (!same(prev.checklist, next.checklist)) out.push('Checklist edited');
  if (!same(prev.keyPoints, next.keyPoints)) out.push('Key points edited');
  if (!same(prev.attachments, next.attachments)) out.push('Attachments changed');
  if (!same(prev.narration && prev.narration.text, next.narration && next.narration.text)) out.push('Narration changed');
  return out;
}

/** The audit line for a quick action ("complete", "reopen", "bin"...). */
export const ACTION_AUDIT = { complete: 'Marked done', reopen: 'Reopened', bin: 'Moved to the Bin', restore: 'Restored from the Bin' };
