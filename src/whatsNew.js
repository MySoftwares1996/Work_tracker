/**
 * "What's new": one card on the Dashboard after an update, listing what changed, shown once per `id` (dismissing it
 * remembers the id). Change `id` and the items when a release is worth announcing.
 */
export const WHATS_NEW = {
  id: '2026-10-r3',
  title: "What's new",
  items: [
    ['🎨', 'Warm look', 'A new cream-and-orange look, with your name at the top right and simpler Home, Tasks and Done screens.'],
    ['🗓', 'Month end picks', 'In the task form, Month end -1 ... -5 gives the last working days of the month.'],
    ['🔕', 'Meeting mode', 'The bell in the header holds every alert for a while; they ring once when it ends.'],
    ['☑', 'Checklists and templates', 'In the task form: steps to tick, and "Save as template".'],
    ['↩️', 'Recent Changes and History', 'Config lists your last 25 changes with Restore; each task keeps its own history.'],
  ],
};
