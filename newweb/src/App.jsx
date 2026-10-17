import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import ClockPicker from './ClockPicker';
import Logo from './Logo';
import LoadingScreen from './LoadingScreen';
import AlertCenter from './AlertCenter';

import { copyText } from './clipboard';

import { useStore } from './store';

import { breakdown, subBreakdown, templateFrom, saveTemplate, DUE_FILTERS, isReminderDue, reminderLabel, subCategoryMissing, RECURRENCES, SORTS, blankTask, dueLabel, filterTasks, isDueSoon, isDueNextMonth, isDueThisMonth, isDueToday, isOpen, isOverdue, sortTasks, stats } from './data';

// The Report, Config and the entry form load when first opened (and are fetched quietly once the page is idle), so the page starts smaller.
const loadReport = () => import('./screens/Report');
const loadConfig = () => import('./screens/Config');
const loadForm = () => import('./screens/TaskForm');
const Report = lazy(loadReport);
const Config = lazy(loadConfig);
const TaskForm = lazy(loadForm);
const prefetch = () => { loadForm(); loadReport(); loadConfig(); };

const TABS = [
  ['dashboard', 'Dashboard'], ['register', 'Register'], ['done', 'Completed'], ['holidays', 'Holidays'],
  ['bin', 'Bin'], ['report', 'Report'], ['links', 'Links'], ['config', 'Config'],
];
const tabFromHash = () => { const k = location.hash.replace('#', ''); return TABS.some(([t]) => t === k) ? k : 'dashboard'; };

export default function App() {
  const store = useStore();
  useEffect(() => { const id = window.requestIdleCallback ? window.requestIdleCallback(prefetch, { timeout: 4000 }) : setTimeout(prefetch, 2500); return () => { if (window.cancelIdleCallback && window.requestIdleCallback) window.cancelIdleCallback(id); else clearTimeout(id); }; }, []);
  const [tab, setTab] = useState(tabFromHash);
  const [form, setForm] = useState(null);
  useEffect(() => { const f = () => setTab(tabFromHash()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const [preset, setPreset] = useState(null);       // a filter the Dashboard tile asked the Register to open with
  const go = (k, filter = null) => { setPreset(filter ? { ...filter, n: Date.now() } : null); location.hash = k; setTab(k); window.scrollTo({ top: 0 }); };

  if (store.user === undefined) return <LoadingScreen stage="auth" full />;
  if (store.demo && location.search.includes('loading')) return <LoadingScreen stage="data" full />;      // ?demo&loading previews the loading screen
  if (!store.user) return <SignIn />;

  const tasks = store.tasks;
  const counts = { register: tasks.filter(isOpen).length, done: tasks.filter((t) => t.done && !t.binned).length, bin: tasks.filter((t) => t.binned).length };
  const openForm = (t) => setForm(t || blankTask());
  const screens = {
    dashboard: <Dashboard onEdit={openForm} onNew={() => openForm()} go={go} />,
    register: <Register onEdit={openForm} preset={preset} />,
    done: <Completed onEdit={openForm} />,
    holidays: <Holidays />,
    bin: <Bin />,
    report: <Report />,
    links: <Links />,
    config: <Config />,
  };

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><Logo size={34} className="brand-logo" /><span className="brand-name">Working Dashboard</span></div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map(([k, label]) => (
            <button key={k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => go(k)} aria-current={tab === k ? 'page' : undefined}>
              {label}{counts[k] ? <span className="count">{counts[k]}</span> : null}
            </button>
          ))}
        </nav>
        <div className="who">
          {store.demo && <span className="pill demo">Demo data</span>}
          {!store.demo && <span className={`dot ${store.synced ? 'ok' : ''}`} title={store.synced ? `In sync${store.lastSyncAt ? ` - last update from the server ${new Date(store.lastSyncAt).toLocaleTimeString()}` : ''}` : 'Syncing...'} />}
          <span className="name" title={store.user.email}>{store.user.displayName || store.user.email}{store.user.email && store.user.displayName ? <small className="who-mail">{store.user.email}</small> : null}</span>
        </div>
      </header>
      <main className="page">
        {store.error && <div className="banner err" role="alert">{store.error}</div>}
        {!store.demo && store.slow && !store.synced && !store.error && <div className="banner err" role="status">Cannot reach the server yet - check your internet connection. Your tasks appear as soon as it answers; the numbers below may be incomplete until then.</div>}
        {!store.demo && !store.synced && !store.error && !store.slow ? <LoadingScreen stage="data" /> : <Suspense fallback={<LoadingScreen stage="data" />}>{screens[tab]}</Suspense>}
      </main>
      <button className="fab" onClick={() => openForm()} aria-label="New entry">+ New entry</button>
      {form && <Suspense fallback={null}><TaskForm initial={form} onClose={() => setForm(null)} /></Suspense>}
      <AlertCenter onOpen={openForm} />
    </div>
  );
}

function SignIn() {
  const { signIn, error } = useStore();
  return (
    <div className="center">
      <div className="signin">
        <Logo size={84} className="float" />
        <h1>Working Dashboard</h1>
        <p>Your tasks, deadlines and daily report - the same account as your phone.</p>
        <button className="btn primary" onClick={signIn}>Sign in with Google</button>
        {error && <p className="banner err" role="alert">{error}</p>}
      </div>
    </div>
  );
}

function Tile({ tone, label, value, sub, onClick }) {
  return (
    <button className={`tile ${tone}`} onClick={onClick}>
      <span className="tile-label">{label}</span>
      <span className="tile-value">{value}</span>
      <span className="tile-sub">{sub}</span>
    </button>
  );
}

function Dashboard({ onEdit, onNew, go }) {
  const { tasks, actions } = useStore();
  const [quick, setQuick] = useState('');
  const s = useMemo(() => stats(tasks), [tasks]);
  const open = tasks.filter(isOpen);
  const lateAll = sortTasks(open.filter((t) => isOverdue(t)), 'due');
  const todayAll = sortTasks(open.filter((t) => isDueToday(t) || (isReminderDue(t) && !isOverdue(t))), 'due');
  const late = lateAll.slice(0, 8);
  const today = todayAll.slice(0, 8);
  const addQuick = (e) => {
    e.preventDefault();
    const title = quick.trim();
    if (!title) return;
    actions.save({ ...blankTask(), title });
    setQuick('');
  };
  return (
    <div className="dash">
      <div className="dash-head">
      <h1 className="h1">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}</h1>
      <form className="quick" onSubmit={addQuick}>
        <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Quick add a task and press Enter..." aria-label="Quick add" />
        <button className="btn primary" disabled={!quick.trim()}>Add</button>
        <button type="button" className="btn" onClick={onNew}>Full form</button>
      </form>
      </div>
      <section className="tiles">
        <Tile tone="coral" label="Pending as on Today" value={s.pendingAsOnToday} sub="Overdue + due today" onClick={() => go('register', { due: 'pending' })} />
        <Tile tone="amber" label="Due Today" value={s.dueToday} sub="Still on the clock" onClick={() => go('register', { due: 'today' })} />
        <Tile tone="pink" label="Overdue" value={s.overdue} sub="Past the due time" onClick={() => go('register', { due: 'overdue' })} />
        <Tile tone="violet" label="Next 7 Days" value={s.dueSoon} sub="Coming up" onClick={() => go('register', { due: 'next7' })} />
        <Tile tone="blue" label="This Month" value={s.thisMonth} sub={`Due in ${new Date().toLocaleString([], { month: 'long' })}`} onClick={() => go('register', { due: 'month' })} />
        <Tile tone="violet" label="Next Month" value={s.nextMonth} sub={`Due in ${new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleString([], { month: 'long' })}`} onClick={() => go('register', { due: 'nextmonth' })} />
        <Tile tone="teal" label="No Due Date" value={s.noDueDate} sub="Needs a deadline" onClick={() => go('register', { due: 'none' })} />
        <Tile tone="amber" label="Pending" value={s.pending} sub="Status Pending" onClick={() => go('register', { status: 'Pending' })} />
        <Tile tone="coral" label="High priority" value={s.high} sub="Open tasks" onClick={() => go('register', { priority: 'High' })} />
        <Tile tone="blue" label="Open tasks" value={s.open} sub="In the register" onClick={() => go('register')} />
        <Tile tone="teal" label="Done today" value={s.doneToday} sub="Completed" onClick={() => go('done')} />
      </section>
      <Breakdowns tasks={tasks} go={go} />
      <div className="two">
        <section>
          <h2 className="h2 red">Needs attention <span className="muted">({lateAll.length} overdue)</span></h2>
          {!late.length && <Empty text="Nothing overdue. Nice." />}
          <div className="list">{late.map((t) => <CompactRow key={t.id} t={t} onEdit={onEdit} />)}</div>
        </section>
        <section>
          <h2 className="h2 amb">Due today <span className="muted">({todayAll.length})</span></h2>
          {!today.length && <Empty text="Nothing due today." />}
          <div className="list">{today.map((t) => <CompactRow key={t.id} t={t} onEdit={onEdit} />)}</div>
        </section>
      </div>
    </div>
  );
}

/** The Dashboard's four breakdowns of the open tasks: by Category, Status, Pending with and Priority. A Category opens its Sub Category breakdown; the others open the Register filtered. */
const BREAK_CARDS = [
  { key: 'category', title: 'By category', field: 'category', hint: 'Click a category for its sub categories' },
  { key: 'status', title: 'By status', field: 'status' },
  { key: 'pendingWith', title: 'By pending with', field: 'pendingWith' },
  { key: 'priority', title: 'By priority', field: 'priority' },
];

/** This month's open tasks by category, status, pending with and priority; next month's by category and priority. A row opens the Register on the same month. */
function Breakdowns({ tasks, go }) {
  const [pop, setPop] = useState(null);
  const monthName = (add) => new Date(new Date().getFullYear(), new Date().getMonth() + add, 1).toLocaleString([], { month: 'long' });
  const thisTasks = useMemo(() => tasks.filter((t) => isDueThisMonth(t)), [tasks]);
  const nextTasks = useMemo(() => tasks.filter((t) => isDueNextMonth(t)), [tasks]);
  const groups = [
    { due: 'month', name: monthName(0), title: `This month - ${monthName(0)}`, tasks: thisTasks, cards: BREAK_CARDS },
    { due: 'nextmonth', name: monthName(1), title: `Next month - ${monthName(1)}`, tasks: nextTasks, cards: BREAK_CARDS.filter((c) => c.key === 'category' || c.key === 'priority') },
  ];
  return (
    <>
      {groups.map((g) => (
        <section key={g.due} className="break-group">
          <h2 className="h2 break-title">{g.title} <span className="muted">({g.tasks.length} open)</span></h2>
          <div className={`breaks${g.cards.length < 4 ? ' two-up' : ''}`}>
            {g.cards.map((c) => {
              const rows = breakdown(g.tasks, c.field);
              const max = Math.max(1, ...rows.map((r) => r.count));
              const open = (row) => { if (!row.name) return; if (c.key === 'category') setPop({ category: row.name, due: g.due, tasks: g.tasks }); else go('register', { [c.key]: row.name, due: g.due }); };
              return (
                <div key={c.key} className="card plain break-card">
                  <h2 className="h2">{c.title}</h2>
                  {!rows.length && <p className="muted">No open tasks due in {g.name}.</p>}
                  {rows.slice(0, 7).map((r) => (
                    <button key={r.label} type="button" className={`break-row${r.name ? '' : ' none'}`} onClick={() => open(r)} disabled={!r.name} title={r.name ? (c.key === 'category' ? `Sub categories of ${r.name}` : `Open ${r.name} in the Register`) : ''}>
                      <span className="break-name">{r.label}</span>
                      <span className="break-bar"><i style={{ width: `${Math.max(6, Math.round((r.count / max) * 100))}%` }} /></span>
                      {r.overdue > 0 && <span className="chip coral" title="overdue">{r.overdue}</span>}
                      <b>{r.count}</b>
                    </button>
                  ))}
                  {rows.length > 7 && <p className="muted">+ {rows.length - 7} more</p>}
                  {c.hint && <p className="muted break-hint">{c.hint}</p>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      {pop && <CategoryPopup category={pop.category} tasks={pop.tasks} due={pop.due} onClose={() => setPop(null)} go={go} />}
    </>
  );
}

/** The window a Category opens: its open tasks counted by Sub Category. A row opens the Register filtered to it. */
function CategoryPopup({ category, tasks, due, onClose, go }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const rows = useMemo(() => subBreakdown(tasks, category), [tasks, category]);
  const total = rows.reduce((n, r) => n + r.count, 0);
  const max = Math.max(1, ...rows.map((r) => r.count));
  const to = (extra) => { onClose(); go('register', { category, due, ...extra }); };
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label={`${category} by sub category`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><div><h2>{category}</h2><span className="muted">{total} open task{total === 1 ? '' : 's'} by sub category</span></div><button type="button" className="btn ghost" onClick={onClose} aria-label="Close">✕</button></div>
        <div className="modal-body">
          {rows.map((r) => (
            <button key={r.label} type="button" className="break-row big" onClick={() => to({ subCategory: r.name || '__none' })}>
              <span className="break-name">{r.label}</span>
              <span className="break-bar"><i style={{ width: `${Math.max(6, Math.round((r.count / max) * 100))}%` }} /></span>
              {r.overdue > 0 && <span className="chip coral" title="overdue">{r.overdue} overdue</span>}
              <b>{r.count}</b>
            </button>
          ))}
        </div>
        <div className="modal-foot"><button type="button" className="btn primary" onClick={() => to({})}>Open all {category} tasks</button><button type="button" className="btn" onClick={onClose}>Close</button></div>
      </div>
    </div>
  );
}

const PAGE = 60;
/** Long lists draw the first page and add more on request, so hundreds of tasks do not slow the screen. The page starts over when `resetKey` changes. */
function usePaged(rows, resetKey) {
  const [limit, setLimit] = useState(PAGE);
  useEffect(() => { setLimit(PAGE); }, [resetKey]);
  const more = rows.length - limit;
  return { shown: rows.length > limit ? rows.slice(0, limit) : rows, more: more > 0 ? more : 0, showMore: () => setLimit((n) => n + PAGE) };
}
const MoreButton = ({ more, onClick }) => (more > 0 ? <div className="more-row"><button type="button" className="btn" onClick={onClick}>Show {Math.min(more, PAGE)} more ({more} left)</button></div> : null);

const Empty = ({ text }) => <div className="empty"><Logo size={40} className="float" /><p>{text}</p></div>;

function Chip({ children, tone }) { return <span className={`chip ${tone || ''}`}>{children}</span>; }
const priTone = (p) => ({ high: 'coral', medium: 'amber', low: 'teal' })[String(p).toLowerCase()] || '';

/** Completing a task from a card or row: a task whose Sub Category has fields needs all of them filled first, so it opens for filling instead. */
function useCompleter(onEdit) {
  const { actions, lists, notify } = useStore();
  return (t, dar) => {
    const msg = subCategoryMissing(t, lists);
    if (msg) { notify(msg); onEdit(t); return; }
    actions.complete(t, dar);
  };
}

/** A task as one compact line with Done and DAR (the Dashboard's Needs attention / Due today). */
function CompactRow({ t, onEdit }) {
  const complete = useCompleter(onEdit);
  return (
    <div className={`crow${isOverdue(t) ? ' late' : ''}`}>
      <button className="crow-main" onClick={() => onEdit(t)} aria-label={`Edit ${t.title}`}>
        <span className="crow-title">{t.title || '(no description)'}</span>
        <span className="crow-sub">{[t.category, dueLabel(t)].filter(Boolean).join(' • ')}</span>
      </button>
      <span className="crow-btns">
        <button className="btn ok" onClick={() => complete(t, false)} title="Done - kept out of the daily report">✓ Done</button>
        <button className="btn ok soft" onClick={() => complete(t, true)} title="Done and included in the daily report">✓ DAR</button>
      </span>
    </div>
  );
}

function TaskCard({ t, onEdit, compact }) {
  const { actions, notify, templates, saveTemplates } = useStore();
  const complete = useCompleter(onEdit);
  const late = isOverdue(t);
  return (
    <article className={`card pri-${String(t.priority).toLowerCase()}${t.done ? ' is-done' : ''}`}>
      <button className="card-main" onClick={() => onEdit(t)} aria-label={`Edit ${t.title}`}>
        <span className="card-title">{t.title || '(no description)'}</span>
        <span className="card-meta">
          {t.priority && <Chip tone={priTone(t.priority)}>{t.priority}</Chip>}
          {t.category && <Chip>{t.category}</Chip>}
          {t.pendingWith && <Chip>with {t.pendingWith}</Chip>}
          {!t.done && <Chip tone={late ? 'coral' : isDueToday(t) ? 'amber' : ''}>{dueLabel(t)}</Chip>}
          {t.done && t.completedAt && <Chip tone="teal">Done {t.completedAt.toLocaleDateString([], { day: 'numeric', month: 'short' })}</Chip>}
          {t.recurrence !== RECURRENCES[0] && <Chip>↻ {t.recurrence}</Chip>}
          {isOpen(t) && t.nextReminder && <Chip tone={isReminderDue(t) ? 'coral' : ''}>⏰ {reminderLabel(t)}</Chip>}
        </span>
        {Array.isArray(t.checklist) && t.checklist.length > 0 && (() => {
          const total = t.checklist.length;
          const n = t.checklist.filter((c) => c.done).length;
          return (
            <span className={`card-checklist${n === total ? ' all' : ''}`} title={t.checklist.map((c) => `${c.done ? '☑' : '☐'} ${c.text}`).join('\n')}>
              <span className="cl-label">Checklist ({n}/{total} done)</span>
              <span className="cl-bar" aria-hidden="true"><span style={{ width: `${Math.round((n / total) * 100)}%` }} /></span>
            </span>
          );
        })()}
        {!compact && t.reference && (
          <span className="card-note mail-copy" title="Click to copy the mail subject and open the task"
            onClick={async () => { notify((await copyText(t.reference)) ? 'Mail subject copied' : 'Could not copy the mail subject'); }}>✉ {t.reference}</span>
        )}
      </button>
      {isOpen(t) && (
        <div className="card-actions">
          <button className="btn ok" onClick={() => complete(t, false)} title="Done - kept out of the daily report">✓ Done</button>
          <button className="btn ok soft" onClick={() => complete(t, true)} title="Done and included in the daily report">✓ DAR</button>
          <button className="btn ghost" onClick={() => { saveTemplates(saveTemplate(templates, templateFrom(t))); notify(`Template saved: ${t.title}`); }} title="Save as template" aria-label="Save as template">📋</button>
          <button className="btn ghost" onClick={() => actions.bin(t)} aria-label="Move to bin">🗑</button>
        </div>
      )}
    </article>
  );
}

function Register({ onEdit, preset }) {
  const { tasks, lists } = useStore();
  const [f, setF] = useState(() => ({ q: '', priority: '', category: '', subCategory: '', pendingWith: '', status: '', due: '', ...(preset || {}) }));
  useEffect(() => { if (preset) setF({ q: '', priority: '', category: '', subCategory: '', pendingWith: '', status: '', due: '', ...preset }); }, [preset]);
  const [by, setBy] = useState('due');
  const [view, setView] = useState('cards');
  const open = tasks.filter(isOpen);
  const sorted = sortTasks(filterTasks(open, f), by);
  const { shown, more, showMore } = usePaged(sorted, JSON.stringify(f) + by);
  return (
    <>
      <h1 className="h1">Register</h1>
      {f.subCategory && <div className="filters"><span className="chip violet">Sub category: {f.subCategory === '__none' ? 'none chosen' : f.subCategory} <button type="button" className="chip-x" onClick={() => setF({ ...f, subCategory: '' })} aria-label="Clear the sub category filter">✕</button></span></div>}
      <Filters f={f} setF={setF} lists={lists} onClear={() => setF({ q: '', priority: '', category: '', subCategory: '', pendingWith: '', status: '', due: '' })} extra={(
        <>
          <select value={by} onChange={(e) => setBy(e.target.value)} aria-label="Sort">{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>Sort: {v}</option>)}</select>
          <div className="seg" role="group" aria-label="View"><button className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')}>Cards</button><button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Table</button></div>
        </>
      )} />
      <p className="muted">{sorted.length} of {open.length} open entries</p>
      {!sorted.length && <Empty text="Nothing matches." />}
      {view === 'cards' ? <div className="grid">{shown.map((t) => <TaskCard key={t.id} t={t} onEdit={onEdit} />)}</div> : <Table rows={shown} onEdit={onEdit} />}
      <MoreButton more={more} onClick={showMore} />
    </>
  );
}

function Filters({ f, setF, lists, extra, onClear }) {
  const active = ['q', 'priority', 'category', 'subCategory', 'pendingWith', 'status', 'due'].some((k) => f[k]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="filters">
      <input className="search" value={f.q} onChange={set('q')} placeholder="Search task, mail chain, notes..." aria-label="Search" />
      <select value={f.priority} onChange={set('priority')} aria-label="Priority"><option value="">All priorities</option>{lists.priorities.map((x) => <option key={x}>{x}</option>)}</select>
      <select value={f.category} onChange={set('category')} aria-label="Category"><option value="">All categories</option>{lists.categories.map((x) => <option key={x}>{x}</option>)}</select>
      {lists.pendingWith.length > 0 && <select value={f.pendingWith} onChange={set('pendingWith')} aria-label="Pending with"><option value="">Anyone</option>{lists.pendingWith.map((x) => <option key={x}>{x}</option>)}</select>}
      {f.due !== undefined && <select value={f.due || ''} onChange={set('due')} aria-label="Due"><option value="">Any due date</option>{DUE_FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
      {f.status !== undefined && <select value={f.status || ''} onChange={set('status')} aria-label="Status"><option value="">Any status</option>{lists.statuses.map((x) => <option key={x}>{x}</option>)}</select>}
      {onClear && <button type="button" className="btn ghost clear-filters" onClick={onClear} disabled={!active} title="Clear all filters" aria-label="Clear all filters">✕</button>}
      {extra}
    </div>
  );
}

function Table({ rows, onEdit, done }) {
  const { actions } = useStore();
  const complete = useCompleter(onEdit);
  return (
    <div className="table-wrap">
      <table>
        <thead><tr><th>Task</th><th>Priority</th><th>Category</th><th>With</th><th>{done ? 'Completed' : 'Due'}</th><th /></tr></thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td><button className="link" onClick={() => onEdit(t)}>{t.title || '(no description)'}</button></td>
              <td><Chip tone={priTone(t.priority)}>{t.priority || '-'}</Chip></td>
              <td>{t.category || '-'}</td>
              <td>{t.pendingWith || '-'}</td>
              <td className={isOverdue(t) ? 'late' : ''}>{done ? (t.completedAt ? t.completedAt.toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '-') : dueLabel(t)}</td>
              <td className="right">{done ? <button className="btn" onClick={() => actions.reopen(t)}>Reopen</button> : <><button className="btn ok" onClick={() => complete(t, false)}>✓</button> <button className="btn ok soft" onClick={() => complete(t, true)}>DAR</button></>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Completed({ onEdit }) {
  const { tasks, lists, actions } = useStore();
  const [f, setF] = useState({ q: '', priority: '', category: '', pendingWith: '' });
  const rows = filterTasks(tasks.filter((t) => t.done && !t.binned), f).sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0));
  const { shown, more, showMore } = usePaged(rows, JSON.stringify(f));
  return (
    <>
      <h1 className="h1">Completed</h1>
      <Filters f={f} setF={setF} lists={lists} />
      <p className="muted">{rows.length} completed</p>
      {!rows.length && <Empty text="No completed tasks yet." />}
      <div className="grid">
        {shown.map((t) => (
          <article key={t.id} className="card is-done">
            <button className="card-main" onClick={() => onEdit(t)}>
              <span className="card-title">{t.title}</span>
              <span className="card-meta">
                {t.category && <Chip>{t.category}</Chip>}
                {t.completedAt && <Chip tone="teal">{t.completedAt.toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Chip>}
                <Chip>{t.dar ? 'In daily report' : 'Done only'}</Chip>
              </span>
            </button>
            <div className="card-actions"><button className="btn" onClick={() => actions.reopen(t)}>Reopen</button><button className="btn ghost" onClick={() => actions.bin(t)} aria-label="Move to bin">🗑</button></div>
          </article>
        ))}
      </div>
      <MoreButton more={more} onClick={showMore} />
    </>
  );
}

function Holidays() {
  const { calendar } = useStore();
  const fmt = (d) => { const x = new Date(`${d}T00:00:00`); return Number.isNaN(x.getTime()) ? d : x.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }); };
  const block = (title, list, tone) => (
    <section>
      <h2 className="h2">{title}</h2>
      {!list.length && <Empty text={`No ${title.toLowerCase()} yet.`} />}
      <div className="list">{[...list].sort((a, b) => a.date.localeCompare(b.date)).map((h) => <div key={h.date + h.name} className={`card plain ${tone}`}><span className="card-title">{fmt(h.date)}</span>{h.name && <span className="muted">{h.name}</span>}</div>)}</div>
    </section>
  );
  return <><h1 className="h1">Holidays</h1><p className="muted">Set up on the phone app or the old website; shown here as they arrive.</p><div className="two">{block('Holidays', calendar.holidays, 'amber')}{block('Leave days', calendar.leaveDays, 'blue')}</div></>;
}

function Bin() {
  const { tasks, actions } = useStore();
  const rows = tasks.filter((t) => t.binned).sort((a, b) => (b.binnedAt?.getTime() || 0) - (a.binnedAt?.getTime() || 0));
  return (
    <>
      <h1 className="h1">Bin</h1>
      <p className="muted">Restore a task, or delete it forever (it then disappears on every device).</p>
      {!rows.length && <Empty text="The bin is empty." />}
      <div className="grid">
        {rows.map((t) => (
          <article key={t.id} className="card">
            <div className="card-main"><span className="card-title">{t.title}</span><span className="card-meta">{t.category && <Chip>{t.category}</Chip>}{t.binnedAt && <Chip>Binned {t.binnedAt.toLocaleDateString([], { day: 'numeric', month: 'short' })}</Chip>}</span></div>
            <div className="card-actions"><button className="btn" onClick={() => actions.restore(t)}>Restore</button><button className="btn danger" onClick={() => { if (confirm(`Delete "${t.title}" forever?`)) actions.purge(t); }}>Delete forever</button></div>
          </article>
        ))}
      </div>
    </>
  );
}

function Links() {
  const { links } = useStore();
  const folders = [...new Set(links.map((l) => l.folder))].sort();
  return (
    <>
      <h1 className="h1">Links</h1>
      {!links.length && <Empty text="No links yet. Links saved on the old website appear here." />}
      {folders.map((fo) => (
        <section key={fo || '-'}>
          {fo && <h2 className="h2">{fo}</h2>}
          <div className="grid">{links.filter((l) => l.folder === fo).map((l) => <a key={l.id} className="card plain linkcard" href={l.url} target="_blank" rel="noopener noreferrer"><span className="card-title">{l.title}</span><span className="muted">{l.url.replace(/^https?:\/\//, '')}</span></a>)}</div>
        </section>
      ))}
    </>
  );
}
