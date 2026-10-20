import Icon from './icons';

const NAMES = { check: 'circleCheck', search: 'search', inbox: 'inbox', bin: 'trash', calendar: 'calendar', link: 'link' };

/** A friendly empty state: a round icon, a serif title, one line and an optional action button ({ label, onClick, primary }). */
export default function EmptyState({ icon = 'inbox', title, text, action }) {
  return (
    <div className="empty empty-state">
      <span className="empty-icon" aria-hidden="true"><Icon name={NAMES[icon] || 'inbox'} size={40} /></span>
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
