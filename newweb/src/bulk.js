import { subCategoryMissing } from './data.js';

/** Toggles one id in a selection (a Set); returns a new Set. */
export function toggleSelected(selected, id) {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id); else next.add(id);
  return next;
}

/** The selected tasks that are still in `rows`, in the order of `rows` (a task filtered away or completed elsewhere drops out). */
export function selectedRows(rows, selected) {
  return rows.filter((t) => selected.has(t.id));
}

/** Splits tasks for a bulk Done / DAR: those whose Sub Category needs fields filled first (`subCategoryMissing`) are skipped. */
export function planBulkComplete(tasks, lists) {
  const doable = [];
  const skipped = [];
  tasks.forEach((t) => (subCategoryMissing(t, lists) ? skipped : doable).push(t));
  return { doable, skipped };
}

/** The toast after a bulk Done / DAR. */
export function bulkCompleteNote(done, skipped, dar) {
  const word = dar ? 'marked DAR' : 'marked done';
  const base = `${done} task${done === 1 ? '' : 's'} ${word}`;
  if (!skipped) return base;
  return `${done ? `${base}; ` : ''}${skipped} skipped - open ${skipped === 1 ? 'it' : 'them'} to fill the Sub Category fields first`;
}

/** The task moved to a new due date ("YYYY-MM-DD"), keeping its time of day. A task with no due date gets the date only. Bad input returns the task unchanged. */
export function moveDueDate(task, dateStr) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || ''));
  if (!m) return task;
  const old = task.due instanceof Date && !Number.isNaN(task.due.getTime()) ? task.due : null;
  const due = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), old && task.hasTime ? old.getHours() : 0, old && task.hasTime ? old.getMinutes() : 0, 0, 0);
  if (due.getMonth() !== Number(m[2]) - 1) return task;      // 2026-02-31 and the like
  return { ...task, due, hasTime: !!(old && task.hasTime), snoozeUntil: 0, lastAckDate: '' };      // like moveTask: a snooze for the old date no longer applies
}
