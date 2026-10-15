/**
 * "What's new": one card on the Dashboard after an update, listing what changed, shown once per `id` (dismissing it
 * remembers the id). Change `id` and the items when a release is worth announcing.
 */
export const WHATS_NEW = {
  id: '2026-10-r2',
  title: "What's new",
  items: [
    ['⚡', 'Quick add', 'Type "Pay vendor tomorrow 5pm high" in the bar on the Dashboard - the form opens filled in.'],
    ['🔕', 'Meeting mode', 'The bell in the header holds every alert for a while; they ring once when it ends.'],
    ['☑', 'Checklists, templates and attachment links', 'In the task form: steps to tick, "Save as template", and links to the invoice or bank advice.'],
    ['💳', 'Payments by vendor', 'A Dashboard card with this month and last month.'],
    ['✨', 'AI summaries', 'Rewrite with AI now works on the weekly and monthly summary too.'],
    ['↩️', 'Recent Changes and History', 'Config lists your last 25 changes with Restore; each task keeps its own history.'],
  ],
};
