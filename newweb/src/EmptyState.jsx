const ICONS = {
  check: <path d="M20 6 9 17l-5-5" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.7 4H7.3a2 2 0 0 0-1.8 1.1z" /></>,
  bin: <><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="m19 6-1 14H6L5 6" /></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
  link: <><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" /></>,
};

/** A friendly empty state: a round icon, a title, one line and an optional action button ({ label, onClick, primary }). */
export default function EmptyState({ icon = 'inbox', title, text, action }) {
  return (
    <div className="empty empty-state">
      <span className="empty-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{ICONS[icon] || ICONS.inbox}</svg></span>
      <h3 className="empty-title">{title}</h3>
      {text && <p>{text}</p>}
      {action && <button type="button" className={`btn${action.primary === false ? '' : ' primary'}`} onClick={action.onClick}>{action.label}</button>}
    </div>
  );
}

/** Placeholder card rows shown until the first answer from the server arrives (shimmer; still when the person prefers less motion). */
export function SkeletonRows({ count = 5, compact }) {
  return (
    <div className={compact ? 'list skeleton-list' : 'grid skeleton-list'} role="status" aria-label="Loading tasks" aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card skeleton-card" aria-hidden="true"><i className="sk sk-title" /><i className="sk sk-line" /><i className="sk sk-chips" /></div>
      ))}
    </div>
  );
}
