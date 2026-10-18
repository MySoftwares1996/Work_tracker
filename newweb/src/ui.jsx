import Icon from './icons';

/** The header of every page: a serif title with a muted line under it, and the primary "New entry" button when the page can add one. */
export function PageHead({ title, sub, onNew, children }) {
  return (
    <div className="head">
      <div className="head-text">
        <h1 className="h1">{title}</h1>
        {sub ? <p className="sub">{sub}</p> : null}
      </div>
      <div className="head-actions">
        {children}
        {onNew && <button type="button" className="btn primary big" onClick={onNew}>New entry</button>}
      </div>
    </div>
  );
}

/** A small coloured pill (priority, category, due ...). tone: coral (high / late), amber, teal (done / low), slate, solid (overdue), or none. */
export function Chip({ children, tone, icon }) {
  return <span className={`chip ${tone || ''}`}>{icon ? <Icon name={icon} size={12} /> : null}{children}</span>;
}

export const priTone = (p) => ({ high: 'coral', medium: 'amber', low: 'teal' })[String(p).toLowerCase()] || '';
export const priDot = (p) => ({ high: 'high', medium: 'med', low: 'low' })[String(p).toLowerCase()] || '';
