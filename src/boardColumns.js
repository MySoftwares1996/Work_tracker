/**
 * The Register's three groups (Option 3, "Kanban & Split"): what is overdue, the dispatch approval queue, and everything else.
 * Shared by the phone app and the website. Pure.
 */
export const BOARD_COLUMNS = [
  { key: 'late', label: 'Overdue & Critical', icon: '🔴' },
  { key: 'dispatch', label: 'Dispatch Approval Queue', icon: '⚡' },
  { key: 'other', label: 'Vendor & Other Payments', icon: '💳' },
];
const DISPATCH = /pure\s*power|dispatch/i;
/** The group of a task: `late` is whether it is overdue. */
export const boardKey = (title, category, late) => (late ? 'late' : DISPATCH.test(`${title || ''} ${category || ''}`) ? 'dispatch' : 'other');
