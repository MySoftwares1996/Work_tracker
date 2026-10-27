import Icon from './icons';

/** The header of every page: a serif title with a muted line under it, and the primary "New entry" button when the page can add one. */
export function PageHead({ title, sub, onNew, children, className = '' }) {
  return (
    <div className={`head${className ? ` ${className}` : ''}`}>
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

/*
 * "Gradient bento" (G, the owner's pick): a category's gradient icon - known kinds by name, the rest by a stable hash of the
 * name. The same rules as the phone's src/gradient.js, so a category has the same colour on both.
 */
const CAT_GRADS = [['#8B5CF6', '#DB2777'], ['#F97316', '#DC2626'], ['#06B6D4', '#2563EB'], ['#10B981', '#4D7C0F'], ['#EC4899', '#9333EA'], ['#F59E0B', '#C2410C'], ['#14B8A6', '#0E7490'], ['#6366F1', '#7C3AED']];
const KINDS = [
  [/pay|vendor|invoice|tds|salary|imprest|advance/i, 'inbox', 0],
  [/gst|tax|compliance|statutory|return|audit/i, 'checklist', 1],
  [/bank|recon|treasury|lc|fd/i, 'calendar', 2],
  [/approv|sign|review/i, 'circleCheck', 3],
  [/mail|follow|call|meeting/i, 'mail', 4],
];
const hashOf = (s) => [...String(s || '')].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export function catLook(category) {
  const name = String(category || '').trim();
  if (!name) return { icon: 'list', g: ['#94A3B8', '#475569'] };
  const hit = KINDS.find(([re]) => re.test(name));
  return hit ? { icon: hit[1], g: CAT_GRADS[hit[2]] } : { icon: 'list', g: CAT_GRADS[hashOf(name) % CAT_GRADS.length] };
}
export function CatIcon({ category, size = 40 }) {
  const { icon, g } = catLook(category);
  return <span className="cat-ico" style={{ width: size, height: size, background: `linear-gradient(135deg, ${g[0]}, ${g[1]})`, boxShadow: `0 6px 14px ${g[0]}55` }} aria-hidden="true"><Icon name={icon} size={Math.round(size * 0.5)} /></span>;
}
