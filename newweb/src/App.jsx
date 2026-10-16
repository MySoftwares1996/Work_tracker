import { useEffect, useMemo, useState } from 'react';
import ClockPicker from './ClockPicker';
import Logo from './Logo';
import LoadingScreen from './LoadingScreen';
import AlertCenter from './AlertCenter';
import { planImport } from './importBackup';
import { askNotificationPermission, loadAlertSettings, saveAlertSettings } from './alerts';
import { copyText } from './clipboard';
import { THEMES, applyTheme, savedTheme } from './themes';
import { useStore } from './store';
import { finalNarration, planFormatSetup, placeholdersOf, renderTemplate, findFormat, unmatchedMarks, SAMPLE_FORMATS } from './reportFormats';
import { buildReport, REPORT_GROUPS, mergeAi, reportPrompt, reportCsvRows, reportHtml } from './reportEngine';
import { reportMailUrl } from '../../src/workingDashboardReport.js';
import { breakdown, subBreakdown, templateFrom, applyTemplate, saveTemplate, DUE_FILTERS, DONE_STATUS, applySubCategoryEdit, validateSubCategory, categoryAsksReminder, isReminderDue, reminderFrom, reminderLabel, toggleReminderCategory, addSubCategories, addSubCategory, categoryCarriesSubCategory, parseSubCategoryLines, subCategoriesFor, withCarrying, findSubCategory, removeSubCategory, subCategoryMissing, RECURRENCES, SORTS, addOption, blankTask, dayKey, dueLabel, filterTasks, isDueSoon, isDueToday, isOpen, isOverdue, pad, newId, removeOption, timeLabel, reportText, sortTasks, stats } from './data';

const TABS = [
  ['dashboard', 'Dashboard'], ['register', 'Register'], ['done', 'Completed'], ['holidays', 'Holidays'],
  ['bin', 'Bin'], ['report', 'Report'], ['links', 'Links'], ['config', 'Config'],
];
const tabFromHash = () => { const k = location.hash.replace('#', ''); return TABS.some(([t]) => t === k) ? k : 'dashboard'; };

export default function App() {
  const store = useStore();
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
        {!store.demo && !store.synced && !store.error && !store.slow ? <LoadingScreen stage="data" /> : screens[tab]}
      </main>
      <button className="fab" onClick={() => openForm()} aria-label="New entry">+ New entry</button>
      {form && <TaskForm initial={form} onClose={() => setForm(null)} />}
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
  const focus = sortTasks(open.filter((t) => isOverdue(t) || isDueToday(t) || isReminderDue(t)), 'due').slice(0, 8);
  const soon = sortTasks(open.filter((t) => isDueSoon(t)), 'due').slice(0, 5);
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
          <h2 className="h2">Needs attention</h2>
          {!focus.length && <Empty text="Nothing overdue or due today. Nice." />}
          <div className="list">{focus.map((t) => <TaskCard key={t.id} t={t} onEdit={onEdit} />)}</div>
        </section>
        <section>
          <h2 className="h2">Coming up</h2>
          {!soon.length && <Empty text="No tasks due in the next 7 days." />}
          <div className="list">{soon.map((t) => <TaskCard key={t.id} t={t} onEdit={onEdit} compact />)}</div>
        </section>
      </div>
    </div>
  );
}

/** The Dashboard's four breakdowns of the open tasks: by Category, Status, Pending with and Priority. A Category opens its Sub Category breakdown; the others open the Register filtered. */
function Breakdowns({ tasks, go }) {
  const [cat, setCat] = useState('');
  const cards = [
    { key: 'category', title: 'By category', field: 'category', hint: 'Click a category for its sub categories' },
    { key: 'status', title: 'By status', field: 'status' },
    { key: 'pendingWith', title: 'By pending with', field: 'pendingWith' },
    { key: 'priority', title: 'By priority', field: 'priority' },
  ];
  const rowsOf = useMemo(() => Object.fromEntries(cards.map((c) => [c.key, breakdown(tasks, c.field)])), [tasks]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = (c, row) => {
    if (!row.name) return;
    if (c.key === 'category') setCat(row.name);
    else go('register', { [c.key]: row.name });
  };
  return (
    <>
      <section className="breaks">
        {cards.map((c) => {
          const rows = rowsOf[c.key];
          const max = Math.max(1, ...rows.map((r) => r.count));
          return (
            <div key={c.key} className="card plain break-card">
              <h2 className="h2">{c.title}</h2>
              {!rows.length && <p className="muted">No open tasks.</p>}
              {rows.slice(0, 7).map((r) => (
                <button key={r.label} type="button" className={`break-row${r.name ? '' : ' none'}`} onClick={() => open(c, r)} disabled={!r.name} title={r.name ? (c.key === 'category' ? `Sub categories of ${r.name}` : `Open ${r.name} in the Register`) : ''}>
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
      </section>
      {cat && <CategoryPopup category={cat} tasks={tasks} onClose={() => setCat('')} go={go} />}
    </>
  );
}

/** The window a Category opens: its open tasks counted by Sub Category. A row opens the Register filtered to it. */
function CategoryPopup({ category, tasks, onClose, go }) {
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const rows = useMemo(() => subBreakdown(tasks, category), [tasks, category]);
  const total = rows.reduce((n, r) => n + r.count, 0);
  const max = Math.max(1, ...rows.map((r) => r.count));
  const to = (extra) => { onClose(); go('register', { category, ...extra }); };
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
  const shown = sortTasks(filterTasks(open, f), by);
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
      <p className="muted">{shown.length} of {open.length} open entries</p>
      {!shown.length && <Empty text="Nothing matches." />}
      {view === 'cards' ? <div className="grid">{shown.map((t) => <TaskCard key={t.id} t={t} onEdit={onEdit} />)}</div> : <Table rows={shown} onEdit={onEdit} />}
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
  return (
    <>
      <h1 className="h1">Completed</h1>
      <Filters f={f} setF={setF} lists={lists} />
      <p className="muted">{rows.length} completed</p>
      {!rows.length && <Empty text="No completed tasks yet." />}
      <div className="grid">
        {rows.map((t) => (
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

function Report() {
  const { tasks, lists, calendar, notify, reportFormats } = useStore();
  const [day, setDay] = useState(dayKey(new Date()));
  const flag = (k, dflt) => { try { const v = localStorage.getItem(k); return v === null ? dflt : v === '1'; } catch { return dflt; } };
  const [opts, setOpts] = useState(() => ({ headings: flag('report-headings', true), subFields: flag('report-sub-fields', true), pending: flag('report-pending', false) }));
  const setOpt = (k, storeKey) => (v) => { setOpts((o) => ({ ...o, [k]: v })); try { localStorage.setItem(storeKey, v ? '1' : '0'); } catch { /* not kept */ } };
  // Lines the person moved between the groups, per day, kept on this computer: { 'YYYY-MM-DD': { taskId: 'oth' | 'pay' | 'fol' | 'out' } }.
  const [allMoves, setAllMoves] = useState(() => { try { return JSON.parse(localStorage.getItem('report-moves') || '{}') || {}; } catch { return {}; } });
  const moves = allMoves[day] || {};
  const saveMoves = (next) => { setAllMoves(next); try { localStorage.setItem('report-moves', JSON.stringify(next)); } catch { /* not kept */ } };
  const moveTo = (id, group) => saveMoves({ ...allMoves, [day]: { ...moves, [id]: group } });
  const resetMoves = () => { const { [day]: _gone, ...rest } = allMoves; saveMoves(rest); };
  const [peek, setPeek] = useState('');
  const report = useMemo(() => buildReport(tasks, lists, calendar, day, { headings: opts.headings, subFields: opts.subFields, formats: reportFormats, moves }), [tasks, lists, calendar, day, opts.headings, opts.subFields, reportFormats, allMoves]); // eslint-disable-line react-hooks/exhaustive-deps
  const pending = useMemo(() => sortTasks(tasks.filter((t) => isOpen(t) && t.due && dayKey(t.due) <= day), 'priority'), [tasks, day]);
  const pendingText = pending.length ? `\n\nPending:\n${pending.map((t) => `* ${t.title}${t.priority ? ` [${t.priority}]` : ''}`).join('\n')}` : '';
  const draft = report.text + (opts.pending ? pendingText : '');
  // Gemini's version replaces the standard text until the report changes; it can be edited before copying.
  const [ai, setAi] = useState({ text: '', base: '', via: '', note: '' });
  const [edited, setEdited] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [showOriginal, setShowOriginal] = useState(false);
  const [extra, setExtra] = useState(() => { try { return localStorage.getItem('report-ai-instructions') || ''; } catch { return ''; } });
  const saveExtra = (v) => { setExtra(v); try { localStorage.setItem('report-ai-instructions', v); } catch { /* not kept */ } };
  const aiOn = !!ai.text && ai.base === report.text && !showOriginal;
  const text = aiOn ? (edited || ai.text) + (opts.pending ? pendingText : '') : draft;
  const [copied, setCopied] = useState(false);
  const shift = (n) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); setDay(dayKey(d)); };
  const rewrite = async () => {
    setBusy(true); setAiError('');
    try {
      const { rewriteWithGemini } = await import('./gemini');
      const forAi = buildReport(tasks, lists, calendar, day, { headings: true, subFields: opts.subFields, formats: reportFormats, moves });
      const got = await rewriteWithGemini(reportPrompt(forAi.model, forAi.text, extra));
      const merged = mergeAi(forAi.model, got.text, { headings: opts.headings });
      if (merged.error) { setAiError(merged.error); }
      else { setAi({ text: merged.text, base: report.text, via: got.via, note: merged.note }); setEdited(''); setShowOriginal(false); }
    } catch (e) { setAiError(String(e.message || e)); }
    setBusy(false);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { notify('Could not copy - select the text and copy it'); } };
  const title = `Daily Activity Report - ${day}`;
  const print = () => { const w = window.open('', '_blank'); if (!w) { notify('Allow pop-ups to print'); return; } w.document.write(reportHtml(title, text)); w.document.close(); w.focus(); w.print(); };
  const csv = () => {
    const { rows, columns } = reportCsvRows(aiOn ? null : report.model, text);
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const body = [columns.map(q).join(','), ...rows.map((r) => columns.map((c) => q(r[c])).join(','))].join('\r\n');
    const url = URL.createObjectURL(new Blob(['\ufeff', body], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `daily-report-${day}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const d = report.model.data;
  return (
    <>
      <h1 className="h1">Daily report</h1>
      <div className="filters report-bar">
        <button className="btn ghost" onClick={() => shift(-1)} aria-label="Previous day">‹</button>
        <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Report date" />
        <button className="btn ghost" onClick={() => shift(1)} aria-label="Next day">›</button>
        <button className="btn ghost" onClick={() => setDay(dayKey(new Date()))}>Today</button>
        <span className="grow" />
        <button className="btn" onClick={rewrite} disabled={busy} title="Rewrites the report as professional sentences with Gemini (free); every item and fact is kept">{busy ? 'Gemini is writing…' : '✨ Rewrite with Gemini'}</button>
        {ai.text && ai.base === report.text && <button className="btn ghost" onClick={() => setShowOriginal(!showOriginal)}>{showOriginal ? 'Show the Gemini version' : 'Show the original'}</button>}
        <button className="btn primary" onClick={copy}>{copied ? 'Copied ✓' : 'Copy report'}</button>
        <button className="btn" onClick={print}>Print / PDF</button>
        <button className="btn" onClick={csv}>Excel (CSV)</button>
        <a className="btn" href={reportMailUrl(title, text)}>Email</a>
      </div>
      <div className="report-opts">
        <label className="check-row"><input type="checkbox" checked={opts.headings} onChange={(e) => setOpt('headings', 'report-headings')(e.target.checked)} /> Section headings</label>
        <label className="check-row"><input type="checkbox" checked={opts.subFields} onChange={(e) => setOpt('subFields', 'report-sub-fields')(e.target.checked)} /> Include Sub Category fields (field name: value)</label>
        <label className="check-row"><input type="checkbox" checked={opts.pending} onChange={(e) => setOpt('pending', 'report-pending')(e.target.checked)} /> Add the pending list ({pending.length})</label>
      </div>
      <div className="report-stats">
        <button className="chip teal" onClick={() => setPeek('oth')} title="See the lines and move them">{d.others} other work</button>
        <button className="chip" onClick={() => setPeek('pay')} title="See the lines and move them">{d.payments} payment{d.payments === 1 ? '' : 's'}</button>
        <button className="chip amber" onClick={() => setPeek('fol')} title="See the lines and move them">{d.followed} followed up</button>
        <button className="chip" onClick={() => setPeek('out')} title="Completed with Done (not DAR): kept out of the report. Click to see them and move them in">{d.excluded} left out (Done, not DAR)</button>
        {d.skippedPayments > 0 && <span className="chip" title="Domestic and Urgent payments are not listed in the report">{d.skippedPayments} domestic / urgent payment(s) not listed</span>}
        {(report.model.missing || []).length > 0 && <span className="chip coral" title={report.model.missing.map((m) => `${m.title}: ${m.marks.join(', ')}`).join('\n')}>{report.model.missing.length} line(s) with a missing field [in brackets]</span>}
        {report.model.dupes > 0 && <button className="chip" onClick={() => setPeek('dup')} title="The same line twice is listed once. Click to see them and move them into a group">{report.model.dupes} duplicate line(s) merged</button>}
        {Object.keys(moves).length > 0 && <button className="chip ghost" onClick={resetMoves} title="Put every line back where the report placed it">Undo my moves ({Object.keys(moves).length})</button>}
      </div>
      {peek && <GroupPeek group={peek} groups={report.model.groups} onMove={moveTo} onClose={() => setPeek('')} />}
      <details className="muted ai-extra"><summary>Instructions for Gemini (optional, remembered on this computer)</summary>
        <textarea rows={3} value={extra} onChange={(e) => saveExtra(e.target.value)} placeholder="e.g. Two lines per task, formal tone, start with the bank's name" aria-label="Instructions for Gemini" />
      </details>
      {aiError && <div className="banner err" role="alert">{aiError}</div>}
      {aiOn ? (
        <>
          <textarea className="report report-edit" value={edited || ai.text} onChange={(e) => setEdited(e.target.value)} rows={Math.min(30, (edited || ai.text).split('\n').length + 2)} aria-label="The report, written by Gemini - you can edit it" />
          <p className="muted">{ai.note} Written by Gemini{ai.via === 'key' ? ' with your own API key (the free route was busy)' : ' (free)'}. Check it, and edit it here if you want, before you send it.</p>
        </>
      ) : (
        <div className="report-view">
          <div className="report-title">Daily Activity Report - {new Date(`${day}T12:00:00`).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          {report.model.sections.every((s) => !s.rows.length) && <p className="empty-note">No completed or updated entries for this date.</p>}
          {report.model.sections.filter((s) => s.rows.length).map((s) => (
            <section key={s.key} className="report-sec">
              {opts.headings && <h2 className="h2">{s.title}{s.key === 'pay' ? ` (${s.rows.length})` : ''}</h2>}
              <ul>
                {(s.intro || []).map((l, i) => <li key={`i${i}`}>{l}</li>)}
                {s.rows.map((r, i) => <li key={i}>{r.line}</li>)}
              </ul>
            </section>
          ))}
          {opts.pending && pending.length > 0 && (
            <section className="report-sec"><h2 className="h2">Pending</h2><ul>{pending.map((t) => <li key={t.id}>{t.title}{t.priority ? ` [${t.priority}]` : ''}</li>)}</ul></section>
          )}
        </div>
      )}
      <p className="muted">Built the way the phone app and the old website write it: tasks completed that day with "✓ DAR", the Payments lines from their Tally narration, bank follow-ups with the banker's update, then the tasks followed up that day. Domestic and Urgent payments are left out.</p>
    </>
  );
}

const GROUP_TITLES = { oth: 'Other work', pay: 'Payments', fol: 'Followed up / in progress', out: 'Left out (Done, not DAR)', dup: 'Duplicate lines merged' };

/** The lines inside one Report chip, each with a "Move to" choice. */
function GroupPeek({ group, groups, onMove, onClose }) {
  const items = groups[group] || [];
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" role="dialog" aria-modal="true" aria-label={GROUP_TITLES[group]} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head"><h2 className="h2">{GROUP_TITLES[group]} ({items.length})</h2><button className="btn ghost" onClick={onClose} aria-label="Close">✕</button></div>
        {!items.length && <p className="muted">Nothing here.</p>}
        <ul className="peek-list">
          {items.map((it, i) => (
            <li key={`${it.id}-${i}`}>
              <div className="peek-line"><b>{it.title}</b>{it.line && it.line !== it.title && <span className="muted">{it.line}</span>}{group === 'dup' && <span className="muted">Same as a line in {it.keptIn}</span>}</div>
              <label className="peek-move">Move to
                <select value={group === 'dup' ? '' : group} onChange={(e) => e.target.value && onMove(it.id, e.target.value)} aria-label={`Move ${it.title}`}>
                  {group === 'dup' && <option value="">Choose…</option>}
                  {REPORT_GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
                </select>
              </label>
            </li>
          ))}
        </ul>
      </div>
    </div>
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

function Config() {
  const { lists, user, signOut, demo, saveLists } = useStore();
  return (
    <>
      <h1 className="h1">Config</h1>
      <section className="card plain"><span className="card-title">{user.displayName || 'Signed in'}</span><span className="muted">{user.email}</span><div><button className="btn" onClick={signOut}>{demo ? 'Leave demo' : 'Sign out'}</button></div></section>
      <ImportBackup />
      <AlertSettings />
      <ReportFormats />
      <GeminiKey />
      <Appearance />
      <p className="muted">Add or delete the options used in the entry form. They are shared with the phone app and the old website. Tasks already using a deleted option keep it.</p>
      <section className="card plain">
        <h2 className="h2">Next reminder date &amp; time</h2>
        <p className="muted">Choose the categories that ask for a next reminder date and time in the entry form. The other categories do not show it.</p>
        <div className="chips">{lists.categories.map((c) => { const on = categoryAsksReminder(lists, c); return <button type="button" key={c} className={`chip toggle${on ? ' on' : ''}`} aria-pressed={on} onClick={() => saveLists(toggleReminderCategory(lists, c))}>{c}</button>; })}</div>
      </section>
      <section className="card plain"><h2 className="h2">Sub categories</h2><SubCategoryManager lists={lists} /></section>
      <div className="two">{LIST_META.map(([key, label]) => <section key={key} className="card plain"><h2 className="h2">{label}</h2><ListManager listKey={key} label={label} lists={lists} /></section>)}</div>
    </>
  );
}

/** Config > Import: bring the tasks, lists and Sub Categories of an older version into this account from its backup file. */
function ImportBackup() {
  const { tasks, lists, importPlan, demo } = useStore();
  const [plan, setPlan] = useState(null);
  const [overwrite, setOverwrite] = useState(false);
  const [file, setFile] = useState(null);
  const [state, setState] = useState({ busy: false, msg: '', error: '' });
  const ids = useMemo(() => new Set(tasks.map((t) => t.id)), [tasks]);
  const read = async (f, over = overwrite) => {
    setState({ busy: false, msg: '', error: '' });
    try { setPlan(planImport(JSON.parse(await f.text()), { ids, lists, overwrite: over })); setFile(f); }
    catch (e) { setPlan(null); setState({ busy: false, msg: '', error: e instanceof SyntaxError ? 'That file is not a backup (it is not valid JSON).' : e.message }); }
  };
  const run = async () => {
    setState({ busy: true, msg: '', error: '' });
    try { await importPlan(plan); setState({ busy: false, msg: `Imported ${plan.summary.tasks} task${plan.summary.tasks === 1 ? '' : 's'}, the lists and ${plan.summary.subCategories} Sub Categor${plan.summary.subCategories === 1 ? 'y' : 'ies'}.`, error: '' }); setPlan(null); setFile(null); }
    catch (e) { setState({ busy: false, msg: '', error: e?.message || String(e) }); }
  };
  const sm = plan && plan.summary;
  return (
    <section className="card plain">
      <h2 className="h2">Import from an older version</h2>
      <p className="muted">Pick the backup file from the phone app or the old website (Config &gt; Data Backup). Its tasks, categories, priorities, statuses, people, Sub Categories, narration types and holidays are added to this account. Nothing is deleted.{demo ? ' (Demo: nothing is saved.)' : ''}</p>
      <input type="file" accept=".json,application/json" aria-label="Backup file" onChange={(e) => { const f = e.target.files && e.target.files[0]; if (f) read(f); e.target.value = ''; }} />
      {sm && (
        <div className="import-summary" role="status">
          <b>Ready to import{sm.exportedAt ? ` (backup of ${new Date(sm.exportedAt).toLocaleDateString()})` : ''}:</b>
          <ul>
            <li>{sm.tasks} task{sm.tasks === 1 ? '' : 's'}{sm.skippedExisting ? `, ${sm.skippedExisting} already here (left as they are)` : ''}</li>
            <li>{plan.lists.categories.length} categories, {plan.lists.priorities.length} priorities, {plan.lists.statuses.length} statuses, {plan.lists.pendingWith.length} people</li>
            <li>{sm.subCategories} new Sub Categor{sm.subCategories === 1 ? 'y' : 'ies'}{sm.narrationTypes ? `, ${sm.narrationTypes} narration types` : ''}</li>
            {(sm.holidays || sm.leaveDays) > 0 && <li>{sm.holidays} holidays, {sm.leaveDays} leave days</li>}
          </ul>
          <label className="field check"><input type="checkbox" checked={overwrite} onChange={(e) => { setOverwrite(e.target.checked); if (file) read(file, e.target.checked); }} /> Replace tasks that are already here with the backup's copy</label>
          <div><button type="button" className="btn primary" onClick={run} disabled={state.busy}>{state.busy ? 'Importing...' : 'Import'}</button> <button type="button" className="btn" onClick={() => { setPlan(null); setFile(null); }}>Cancel</button></div>
        </div>
      )}
      {state.msg && <p className="banner ok" role="status">{state.msg}</p>}
      {state.error && <p className="banner err" role="alert">{state.error}</p>}
    </section>
  );
}

/** Config > Alerts: pop up a due alert, play a sound, and show a desktop notification when this tab is in the background. */
/** "Final Narration": the narration of the task's report line (after the dash), for tasks in a Payments category whose Sub Category has a report format. Read-only; follows the fields as they are typed. */
function NarrationBox({ t }) {
  const { reportFormats, notify } = useStore();
  const n = finalNarration(t, reportFormats);
  if (!n) return null;
  const copy = async () => { notify((await copyText(n.text)) ? 'Narration copied' : 'Could not copy the narration'); };
  return (
    <div className="narration">
      <div className="field-head"><b>Final Narration:</b><button type="button" className="mini" onClick={copy}>Copy</button></div>
      <p>{n.text}</p>
      {n.missing.length > 0 && <small className="muted">Still to fill: {n.missing.join(', ')}</small>}
    </div>
  );
}

/** Config > Report formats: the line the Daily report writes for a task, per Sub Category, with {Field name} marks filled from the task. */
function ReportFormats() {
  const { lists, saveLists, tasks, reportFormats, reportFormatsCustom, saveReportFormats } = useStore();
  const [open, setOpen] = useState('');
  const [draft, setDraft] = useState('');
  const subs = lists.subCategories || [];
  const rows = [
    ...subs.map((sc) => ({ key: `s-${sc.id || sc.name}`, sc, name: sc.name, category: sc.category || '', format: findFormat(reportFormats, sc.name) })),
    ...reportFormats.filter((f) => !subs.some((sc) => findFormat([f], sc.name))).map((f) => ({ key: `f-${f.id}`, sc: null, name: f.subCategory, category: f.category, format: f })),
  ];
  const everyFormat = () => (reportFormatsCustom ? reportFormats : SAMPLE_FORMATS);
  const setup = planFormatSetup(lists, reportFormats);
  const missingCount = setup.categories.length + setup.subCategories.length;
  const startEdit = (row) => { setOpen(open === row.key ? '' : row.key); setDraft(row.format ? row.format.template : ''); };
  const save = (row, template) => {
    const list = everyFormat().filter((f) => !(row.format && f.id === row.format.id));
    const text = template.trim();
    saveReportFormats(text ? [...list, { id: row.format ? row.format.id : `rf-${Date.now().toString(36)}`, category: row.category || (row.format && row.format.category) || '', subCategory: row.format ? row.format.subCategory : row.name, template: text }] : list);
  };
  const addFields = (row, marks) => saveLists({ ...lists, subCategories: subs.map((sc) => (sc === row.sc ? { ...sc, fields: [...sc.fields, ...marks.map((label) => ({ label }))] } : sc)) });
  const sample = (row) => { const mine = tasks.filter((t) => t.subCategory && row.sc && t.subCategory === row.sc.name && Object.keys(t.subCategoryFields || {}).length); return mine.length ? mine[0] : { subCategoryFields: {} }; };
  return (
    <section className="card plain">
      <h2 className="h2">Report formats</h2>
      <p className="muted">The line the Daily report writes for a task in each Sub Category. Write the sentence and put a task's own value where it goes in {'{'}braces{'}'} - for example <code>Being amount paid against Invoice No. {'{'}Invoice No{'}'}, amounting to ₹{'{'}Amount{'}'}.</code> Each {'{'}mark{'}'} is filled from the task's Sub Category field with that name (then its Key Points); a missing value shows as [mark] in the report. The sample formats from your Tally narration sheet are used until you change one.{reportFormatsCustom ? ' (Your own formats are saved.)' : ''}</p>
      <div className={`fmt-setup${missingCount ? ' todo' : ''}`}>
        {missingCount ? (
          <>
            <div><b>{setup.categories.length} categor{setup.categories.length === 1 ? 'y' : 'ies'} and {setup.subCategories.length} sub categor{setup.subCategories.length === 1 ? 'y' : 'ies'} from the formats are not in your lists yet.</b>
              <div className="muted fmt-missing">{setup.categories.length > 0 && <>Categories: {setup.categories.join(', ')}. </>}{setup.subCategories.length > 0 && <>Sub categories: {setup.subCategories.map((x) => `${x.name} (${x.category || 'no category'})`).join('; ')}.</>}</div>
              <div className="muted">Only what is missing is created, each new Sub Category with a field for every {'{'}mark{'}'} of its format. Nothing you already have is changed.</div></div>
            <button type="button" className="btn primary" onClick={() => saveLists(setup.lists)}>Create the missing ones</button>
          </>
        ) : <span className="muted">✓ Every category and sub category in the formats is already in your lists.</span>}
      </div>
      <div className="fmt-list">
        {rows.map((row) => {
          const labels = row.sc ? row.sc.fields.map((f) => f.label) : [];
          const marks = placeholdersOf(draft);
          const lack = row.sc ? unmatchedMarks(draft, labels) : [];
          const prev = renderTemplate(draft, sample(row));
          return (
            <div key={row.key} className={`fmt-row${open === row.key ? ' open' : ''}`}>
              <button type="button" className="fmt-head" onClick={() => startEdit(row)} aria-expanded={open === row.key}>
                <span><b>{row.name}</b>{row.category && <small className="muted"> · {row.category}</small>}</span>
                <span className={`chip ${row.format ? 'teal' : ''}`}>{row.format ? 'Format set' : 'No format'}</span>
              </button>
              {open === row.key && (
                <div className="fmt-edit">
                  <textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="e.g. Being amount paid against Invoice No. {Invoice No}, amounting to ₹{Amount}." aria-label={`Report format for ${row.name}`} />
                  {labels.length > 0 && <div className="fmt-chips"><span className="muted">Insert a field:</span>{labels.map((l) => <button key={l} type="button" className="chip" onClick={() => setDraft((d) => `${d}${d && !/\s$/.test(d) ? ' ' : ''}{${l.replace(/[\s:]+$/, '')}}`)}>{l.replace(/[\s:]+$/, '')}</button>)}</div>}
                  {lack.length > 0 && <div className="banner err">No field named {lack.map((m) => `"${m}"`).join(', ')} in this Sub Category yet. <button type="button" className="btn" onClick={() => addFields(row, lack)}>Add {lack.length === 1 ? 'it' : 'them'} to the Sub Category</button></div>}
                  {!row.sc && <p className="muted">There is no Sub Category with this name yet - add it under Sub categories (above) to fill these marks from a task.</p>}
                  <div className="fmt-prev"><span className="muted">Preview{sample(row).id ? ' with your latest task' : ''}:</span><p>{prev.text || '(empty - this Sub Category uses the standard line)'}</p></div>
                  <div className="row">
                    <button type="button" className="btn primary" onClick={() => { save(row, draft); setOpen(''); }}>Save format</button>
                    {row.format && <button type="button" className="btn" onClick={() => { save(row, ''); setOpen(''); }}>Remove format</button>}
                    {reportFormatsCustom && <button type="button" className="btn ghost" onClick={() => { if (window.confirm('Go back to the sample formats from the Tally narration sheet? Your own formats are removed.')) saveReportFormats([]); }}>Use the sample formats again</button>}
                    <span className="muted">{marks.length} mark(s)</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {!rows.length && <p className="muted">Add Sub categories first (above), then give each a format.</p>}
      </div>
    </section>
  );
}

function GeminiKey() {
  const [saved, setSaved] = useState(() => { try { return !!localStorage.getItem('wd-gemini-key'); } catch { return false; } });
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [state, setState] = useState({ busy: false, msg: '', bad: false });
  const save = async () => {
    const { saveGeminiKey } = await import('./gemini');
    saveGeminiKey(value);
    setSaved(!!value.trim()); setValue(''); setState({ busy: false, msg: value.trim() ? 'Saved on this computer.' : 'Removed.', bad: false });
  };
  const test = async () => {
    setState({ busy: true, msg: '', bad: false });
    try {
      const { generateWithKey, loadGeminiKey } = await import('./gemini');
      const key = value.trim() || loadGeminiKey();
      if (!key) throw new Error('Paste a key first.');
      const out = await generateWithKey('Reply with the single word: ready', key);
      setState({ busy: false, msg: `The key works (Gemini answered: ${out.slice(0, 40)}).`, bad: false });
    } catch (e) { setState({ busy: false, msg: String(e.message || e), bad: true }); }
  };
  return (
    <section className="card plain">
      <h2 className="h2">Gemini API key (backup for the report rewrite)</h2>
      <p className="muted">The report rewrite uses the free route first. Only if that is busy or fails, your own Gemini API key is used. The key is kept in this browser only (never in the database) and is sent only to Google's Gemini. Get one free at aistudio.google.com/apikey.</p>
      <div className="row key-row">
        <input type={show ? 'text' : 'password'} value={value} onChange={(e) => setValue(e.target.value)} placeholder={saved ? 'A key is saved - paste a new one to replace it' : 'Paste your Gemini API key'} aria-label="Gemini API key" autoComplete="off" spellCheck={false} />
        <button type="button" className="btn ghost" onClick={() => setShow(!show)}>{show ? 'Hide' : 'Show'}</button>
        <button type="button" className="btn primary" onClick={save} disabled={!value.trim()}>Save key</button>
        <button type="button" className="btn" onClick={test} disabled={state.busy || (!value.trim() && !saved)}>{state.busy ? 'Testing…' : 'Test key'}</button>
        {saved && <button type="button" className="btn ghost" onClick={async () => { const { saveGeminiKey } = await import('./gemini'); saveGeminiKey(''); setSaved(false); setState({ busy: false, msg: 'Removed.', bad: false }); }}>Remove key</button>}
      </div>
      {saved && <p className="muted">✓ A key is saved on this computer.</p>}
      {state.msg && <p className={state.bad ? 'banner err' : 'muted'} role="status">{state.msg}</p>}
    </section>
  );
}

function AlertSettings() {
  const [s, setS] = useState(loadAlertSettings);
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'));
  const set = (patch) => { const next = { ...s, ...patch }; setS(next); saveAlertSettings(next); window.dispatchEvent(new Event('wd-alert-settings')); };
  const enableNotify = async () => { const r = await askNotificationPermission(); setPerm(r); set({ notify: r === 'granted' }); };
  return (
    <section className="card plain">
      <h2 className="h2">Alerts</h2>
      <p className="muted">When a task is due (or its next reminder time comes) while this page is open, an alert appears with the task's details and the choices to mark it done, snooze, skip or move it. Keep this page open to get alerts; the phone app rings by itself.</p>
      <label className="field check"><input type="checkbox" checked={s.popup} onChange={(e) => set({ popup: e.target.checked })} /> Show an alert when a task is due</label>
      <label className="field check"><input type="checkbox" checked={s.sound} onChange={(e) => set({ sound: e.target.checked })} /> Play a sound (needs one click or key press on the page first)</label>
      <div className="add-row">
        <label className="field check"><input type="checkbox" checked={s.notify && perm === 'granted'} disabled={perm === 'unsupported' || perm === 'denied'} onChange={(e) => (e.target.checked ? enableNotify() : set({ notify: false }))} /> Desktop notification when this tab is in the background{perm === 'denied' ? ' (blocked in the browser settings)' : ''}</label>
      </div>
      <div><button type="button" className="btn" onClick={() => window.dispatchEvent(new Event('wd-test-alert'))}>Show a test alert</button></div>
    </section>
  );
}

/** Config > Appearance: pick a colour theme; it applies at once and is remembered on this device. */
function Appearance() {
  const [theme, setTheme] = useState(savedTheme);
  return (
    <section className="card plain">
      <h2 className="h2">Appearance</h2>
      <p className="muted">Pick a colour theme. It applies at once and is kept on this device.</p>
      <div className="themes">
        {THEMES.map((t) => (
          <button key={t.id} type="button" className="theme-card" aria-pressed={theme === t.id} onClick={() => setTheme(applyTheme(t.id))}>
            <span className="swatch" style={{ background: t.swatch.bg }}>
              <span className="sw-pill" style={{ background: t.swatch.card }}><i style={{ background: t.swatch.accent }} /><i style={{ background: t.swatch.tileInk[0], opacity: 0.25 }} /><i style={{ background: t.swatch.tileInk[3], opacity: 0.25 }} /></span>
              <span className="sw-tiles">{t.swatch.tiles.map((c, i) => <i key={i} style={{ background: c }} />)}</span>
              <span className="sw-card" style={{ background: t.swatch.card }} />
            </span>
            <span className="theme-name"><span>{t.name}<br /><small>{t.note}</small></span><i className="tick" /></span>
          </button>
        ))}
      </div>
    </section>
  );
}

/**
 * Sub Categories live under a category (Payments > Domestic Payment, Urgent Payment...). One group per category, each with its own
 * Sub Categories and an add box; "only" shows just one category's group (the entry form). Several can be pasted at once,
 * one per line, as "Name" or "Name: Field A, Field B".
 */
function SubCategoryManager({ lists, only }) {
  const { saveLists } = useStore();
  const [draft, setDraft] = useState({});       // per category: { name, fields, many }
  const [msg, setMsg] = useState('');
  const [editing, setEditing] = useState('');       // id of the Sub Category being edited
  const subs = lists.subCategories || [];
  const cats = only ? [only] : lists.categories;
  const get = (c) => draft[c] || { name: '', fields: '', many: '' };
  const set = (c, patch) => setDraft((d) => ({ ...d, [c]: { ...get(c), ...patch } }));
  const save = (next, cat) => saveLists({ ...lists, subCategories: next, subCategoryCategories: withCarrying(lists, cat) });
  const add = (cat) => {
    const d = get(cat);
    const next = addSubCategory(subs, d.name, d.fields.split(','), cat);
    if (next === subs) { setMsg(d.name.trim() ? `"${d.name.trim()}" already exists. A Sub Category name can be used once.` : ''); return; }
    setMsg(''); save(next, cat); set(cat, { name: '', fields: '' });
  };
  const addMany = (cat) => {
    const { list, added } = addSubCategories(subs, parseSubCategoryLines(get(cat).many), cat);
    setMsg(added ? `${added} added under ${cat}.` : 'Nothing new to add (the names already exist).');
    if (added) { save(list, cat); set(cat, { many: '' }); }
  };
  const remove = (sc) => { if (confirm(`Delete the Sub Category "${sc.name}"? Tasks using it keep it.`)) saveLists({ ...lists, subCategories: removeSubCategory(subs, sc.id) }); };
  const chip = (sc) => <span key={sc.id} className="chip removable" title={sc.fields.map((f) => f.label).join(', ')}>{sc.name}{sc.fields.length > 0 && <small>{sc.fields.length} field{sc.fields.length > 1 ? 's' : ''}</small>}<button type="button" className="edit-btn" onClick={() => setEditing(editing === sc.id ? '' : sc.id)} aria-label={`Edit ${sc.name}`} title="Edit the name and fields">✎</button><button type="button" onClick={() => remove(sc)} aria-label={`Delete ${sc.name}`}>✕</button></span>;
  const general = subs.filter((x) => !x.category);
  if (only === '') return <p className="muted">Choose a Category first. Sub Categories are kept under a category.</p>;
  return (
    <div className="manager">
      {msg && <p className="muted" role="status">{msg}</p>}
      {cats.map((cat) => {
        const own = subs.filter((x) => x.category === cat);
        const d = get(cat);
        return (
          <div key={cat} className="cat-group">
            <h3 className="cat-title">{cat} <small>{own.length ? `${own.length} Sub Categor${own.length > 1 ? 'ies' : 'y'}` : 'none yet'}</small></h3>
            <div className="chips">{own.map(chip)}</div>
            {own.filter((x) => x.id === editing).map((sc) => <SubCategoryEditor key={sc.id} sc={sc} subs={subs} onCancel={() => setEditing('')} onSave={(name, rows) => { saveLists({ ...lists, subCategories: applySubCategoryEdit(subs, sc.id, name, rows) }); setEditing(''); setMsg(`${name.trim()} saved.`); }} />)}
            <div className="add-row">
              <input value={d.name} onChange={(e) => set(cat, { name: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add(cat)} placeholder={`New Sub Category under ${cat}`} aria-label={`New Sub Category under ${cat}`} />
              <input value={d.fields} onChange={(e) => set(cat, { fields: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && add(cat)} placeholder="Fields to fill in (comma separated, optional)" aria-label={`Fields of the new Sub Category under ${cat}`} />
              <button type="button" className="btn primary" onClick={() => add(cat)} disabled={!d.name.trim()}>Add</button>
            </div>
            <details className="many">
              <summary>Add several at once</summary>
              <textarea rows={4} value={d.many} onChange={(e) => set(cat, { many: e.target.value })} placeholder={'One per line, for example:\nDomestic Payment: Vendor Name, Invoice No\nUrgent Payment\nImport Payment: Bill of Entry'} aria-label={`Several Sub Categories under ${cat}`} />
              <button type="button" className="btn" onClick={() => addMany(cat)} disabled={!d.many.trim()}>Add these</button>
            </details>
          </div>
        );
      })}
      {!only && general.length > 0 && (
        <div className="cat-group"><h3 className="cat-title">Not under a category <small>from the phone app or the old website, offered under every category</small></h3><div className="chips">{general.map(chip)}</div>{general.filter((x) => x.id === editing).map((sc) => <SubCategoryEditor key={sc.id} sc={sc} subs={subs} onCancel={() => setEditing('')} onSave={(name, rows) => { saveLists({ ...lists, subCategories: applySubCategoryEdit(subs, sc.id, name, rows) }); setEditing(''); setMsg(`${name.trim()} saved.`); }} />)}</div>
      )}
    </div>
  );
}

/** Edit one Sub Category: its name, and its fields - rename, delete, add, and give a field fixed choices ("TT, DD"). */
function SubCategoryEditor({ sc, subs, onSave, onCancel }) {
  const [name, setName] = useState(sc.name);
  const [rows, setRows] = useState(() => sc.fields.map((f) => ({ key: newId(), label: f.label, options: (f.options || []).join(', ') })));
  const [error, setError] = useState('');
  const setRow = (key, patch) => setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
  const save = () => {
    const msg = validateSubCategory(subs, sc.id, name, rows);
    if (msg) { setError(msg); return; }
    onSave(name, rows);
  };
  return (
    <div className="sc-editor" role="group" aria-label={`Edit ${sc.name}`}>
      <label className="field">Sub Category name<input value={name} onChange={(e) => setName(e.target.value)} aria-label="Sub Category name" /></label>
      <div className="field">Fields to fill in
        {rows.map((r) => (
          <div key={r.key} className="field-row">
            <input value={r.label} onChange={(e) => setRow(r.key, { label: e.target.value })} placeholder="Field name" aria-label="Field name" />
            <input value={r.options} onChange={(e) => setRow(r.key, { options: e.target.value })} placeholder="Choices, comma separated (optional)" aria-label="Choices for this field" />
            <button type="button" className="btn ghost" onClick={() => setRows((x) => x.filter((y) => y.key !== r.key))} aria-label={`Delete field ${r.label || ''}`}>✕</button>
          </div>
        ))}
        {!rows.length && <span className="muted">No fields yet.</span>}
        <div><button type="button" className="btn" onClick={() => setRows((x) => [...x, { key: newId(), label: '', options: '' }])}>+ Add field</button></div>
      </div>
      <p className="muted">Tasks already saved keep what they typed under the old field or Sub Category name.</p>
      {error && <p className="banner err" role="alert">{error}</p>}
      <div className="add-row"><button type="button" className="btn primary" onClick={save}>Save changes</button><button type="button" className="btn" onClick={onCancel}>Cancel</button></div>
    </div>
  );
}

const LIST_META = [['categories', 'Categories'], ['priorities', 'Priorities'], ['statuses', 'Statuses'], ['pendingWith', 'Pending with']];

/** Add and delete the options of one list (Category, Priority, Status, Pending with). onAdd gets the new value, so a form can pick it. */
function ListManager({ listKey, label, lists, onAdd }) {
  const { saveLists } = useStore();
  const [text, setText] = useState('');
  const list = lists[listKey] || [];
  const add = (e) => {
    e?.preventDefault();
    const next = addOption(list, text);
    if (next === list) { setText(''); return; }
    saveLists({ ...lists, [listKey]: next });
    if (onAdd) onAdd(next[next.length - 1]);
    setText('');
  };
  const remove = (v) => {
    if (listKey === 'statuses' && DONE_STATUS.test(v)) { alert(`"${v}" is what marks a task as done, so it cannot be deleted.`); return; }
    if ((listKey === 'priorities' || listKey === 'statuses') && list.length <= 1) { alert(`Keep at least one ${label.toLowerCase().replace(/es$|s$/, '')}.`); return; }
    if (confirm(`Delete "${v}" from ${label}? Tasks using it keep it.`)) saveLists({ ...lists, [listKey]: removeOption(list, v) });
  };
  return (
    <div className="manager">
      <div className="chips">
        {list.map((v) => <span key={v} className="chip removable">{v}<button type="button" onClick={() => remove(v)} aria-label={`Delete ${v}`}>✕</button></span>)}
        {!list.length && <span className="muted">None yet</span>}
      </div>
      <div className="add-row">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add(e)} placeholder={`Add to ${label}...`} aria-label={`Add to ${label}`} />
        <button type="button" className="btn primary" onClick={add} disabled={!text.trim()}>Add</button>
      </div>
    </div>
  );
}

const toInputDate = (d) => (d ? dayKey(d) : '');
const toInputTime = (t) => (t.due && t.hasTime ? `${pad(t.due.getHours())}:${pad(t.due.getMinutes())}` : '');

function TaskForm({ initial, onClose }) {
  const { tasks, lists, actions } = useStore();
  const isNew = !tasks.some((t) => t.id === initial.id);
  const [t, setT] = useState(initial);
  const [date, setDate] = useState(toInputDate(initial.due));
  const [time, setTime] = useState(toInputTime(initial));
  const [managing, setManaging] = useState('');       // the list whose options are being added / deleted
  const [step, setStep] = useState('');
  const [clockOpen, setClockOpen] = useState(false);
  const [remDate, setRemDate] = useState(initial.nextReminder ? dayKey(initial.nextReminder) : '');
  const [remTime, setRemTime] = useState(initial.nextReminder ? `${pad(initial.nextReminder.getHours())}:${pad(initial.nextReminder.getMinutes())}` : '');
  const [remClock, setRemClock] = useState(false);
  const { saveLists, templates, saveTemplates, notify } = useStore();
  const [tplName, setTplName] = useState(null);      // null = closed; a string = naming the template being saved
  const [att, setAtt] = useState({ title: '', url: '' });
  const [kp, setKp] = useState({ key: '', value: '' });
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const set = (k) => (e) => {
    const v = e.target.value;
    if (k === 'category' && t.subCategory && !subCategoriesFor(lists, v).some((x) => x.name === t.subCategory)) setT({ ...t, category: v, subCategory: '', subCategoryFields: {} });
    else setT({ ...t, [k]: v });
  };
  const opts = (list, cur) => (cur && !list.includes(cur) ? [cur, ...list] : list);
  const submit = (e) => {
    e.preventDefault();
    if (!t.title.trim()) return;
    if (/^completed$/i.test(t.status)) { const msg = subCategoryMissing(t, lists); if (msg) { setSubError(msg); return; } }
    setSubError('');
    const [h, m] = time ? time.split(':').map(Number) : [0, 0];
    const due = date ? new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h, m) : null;
    const next = { ...t, title: t.title.trim(), due, hasTime: !!(date && time), nextReminder: reminderFrom(remDate, remTime) };
    if (/^completed$/i.test(t.status) && !t.done) actions.complete(next, t.dar);
    else actions.save(next);
    onClose();
  };
  // A select with its own "Edit" link: add or delete the options right here.
  const pick = (key, label, field, blank) => (
    <div className="field">
      <span className="field-head">{label}<button type="button" className="mini" onClick={() => setManaging(managing === key ? '' : key)}>{managing === key ? 'Done' : '+ / − Edit'}</button></span>
      <select value={t[field]} onChange={set(field)} aria-label={label}>{blank && <option value="">-</option>}{opts(lists[key], t[field]).map((x) => <option key={x}>{x}</option>)}</select>
    </div>
  );
  const subs = subCategoriesFor(lists, t.category);
  const sc = findSubCategory(lists, t.subCategory);
  const needSub = categoryCarriesSubCategory(lists, t.category);
  const [subError, setSubError] = useState('');
  const subBlock = (
    <div className="manage-panel sub-panel">
      <div className="field-head"><span className="field">Sub category{t.category ? ` under ${t.category}` : ''}{needSub && <span className="muted"> (needed to mark Completed)</span>}</span><button type="button" className="mini" onClick={() => setManaging(managing === 'sub' ? '' : 'sub')}>{managing === 'sub' ? 'Done' : '+ / − Edit'}</button></div>
      {managing === 'sub' ? <SubCategoryManager lists={lists} only={t.category} /> : (
        <>
          <select value={t.subCategory} onChange={(e) => setT({ ...t, subCategory: e.target.value, subCategoryFields: e.target.value === t.subCategory ? t.subCategoryFields : {} })} aria-label="Sub category" disabled={!t.category && !t.subCategory}>
            <option value="">{t.category ? '-' : 'Choose a Category first'}</option>{(t.subCategory && !subs.some((x) => x.name === t.subCategory) ? [{ name: t.subCategory }, ...subs] : subs).map((x) => <option key={x.name}>{x.name}</option>)}
          </select>
          {sc && sc.fields.length > 0 && (
            <div className="fields">{sc.fields.map((f) => (
              <label className={`field${/^completed$/i.test(t.status) && !String((t.subCategoryFields || {})[f.label] || '').trim() ? ' need' : ''}`} key={f.label}><span className="flabel">{f.label}{/^completed$/i.test(t.status) && <span className="req"> *</span>}</span>
                {f.options && f.options.length ? <select value={(t.subCategoryFields || {})[f.label] || ''} onChange={(e) => setT({ ...t, subCategoryFields: { ...t.subCategoryFields, [f.label]: e.target.value } })}><option value="">-</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
                  : <input value={(t.subCategoryFields || {})[f.label] || ''} onChange={(e) => setT({ ...t, subCategoryFields: { ...t.subCategoryFields, [f.label]: e.target.value } })} />}
              </label>
            ))}</div>
          )}
          {t.category && !subs.length && <p className="muted">No Sub Categories under {t.category} yet. Use + / − Edit to add them.</p>}
        </>
      )}
    </div>
  );
  const manager = managing && managing !== 'sub' && (
    <div className="manage-panel"><ListManager listKey={managing} label={LIST_META.find(([k]) => k === managing)[1]} lists={lists} onAdd={(v) => setT((d) => ({ ...d, [{ categories: 'category', priorities: 'priority', statuses: 'status', pendingWith: 'pendingWith' }[managing]]: v }))} /></div>
  );
  const addStepNow = () => { if (step.trim()) { setT({ ...t, checklist: [...t.checklist, { id: newId(), text: step.trim(), done: false }] }); setStep(''); } };
  const addAtt = () => {
    const url = /^https?:\/\//i.test(att.url.trim()) ? att.url.trim() : `https://${att.url.trim()}`;
    if (!att.url.trim() || !/^https?:\/\/[^/.\s]+\.[^\s]+/i.test(url)) return;
    setT({ ...t, attachments: [...t.attachments, { id: newId(), title: att.title.trim() || url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/.*$/, ''), url }] });
    setAtt({ title: '', url: '' });
  };
  const addKp = () => { if (kp.key.trim() || kp.value.trim()) { setT({ ...t, keyPoints: [...t.keyPoints, { key: kp.key.trim(), value: kp.value.trim() }] }); setKp({ key: '', value: '' }); } };
  const repeatsEvery = t.recurrence === 'Hourly' || t.recurrence === 'Custom';
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet wide" onSubmit={submit} role="dialog" aria-modal="true" aria-label={isNew ? 'New entry' : 'Edit entry'}>
        <div className="sheet-head"><h2>{isNew ? 'New entry' : 'Edit entry'}</h2>
          <span className="tpl-head">
            {tplName === null
              ? <button type="button" className="btn" onClick={() => setTplName(t.title.trim())} title="Keep this entry's usual fields to start new entries from">Save as template</button>
              : <span className="tpl-save"><input autoFocus value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Template name" aria-label="Template name" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('tpl-ok')?.click(); } }} />
                <button type="button" id="tpl-ok" className="btn primary" onClick={() => { saveTemplates(saveTemplate(templates, templateFrom(t, tplName || t.title))); notify(`Template saved: ${tplName || t.title || 'Template'}`); setTplName(null); }}>Save</button>
                <button type="button" className="btn ghost" onClick={() => setTplName(null)}>Cancel</button></span>}
            <button type="button" className="btn ghost" onClick={onClose} aria-label="Close">✕</button>
          </span></div>
        {isNew && templates.length > 0 && (
          <div className="tpl-row"><span className="muted">Start from a template:</span>
            {templates.map((tp) => (
              <span key={tp.id} className="chip tpl-chip"><button type="button" onClick={() => setT((cur) => applyTemplate(cur, tp))} title="Fill the form from this template">{tp.name}</button><button type="button" className="tpl-x" aria-label={`Delete template ${tp.name}`} onClick={() => saveTemplates(templates.filter((x) => x.id !== tp.id))}>✕</button></span>
            ))}
          </div>
        )}
        <div className="cols3">
        <div className="col">
        <label className="field full">Task description<textarea rows={3} value={t.title} onChange={set('title')} autoFocus placeholder="What needs doing?" /></label>
        <div className="fields">
          {pick('categories', 'Category', 'category', true)}
          {pick('priorities', 'Priority', 'priority')}
          {pick('statuses', 'Status', 'status')}
          {pick('pendingWith', 'Pending with', 'pendingWith', true)}
        </div>
        {manager}
        {t.category && (
          <label className="field check ask-reminder"><input type="checkbox" checked={categoryAsksReminder(lists, t.category)} onChange={() => saveLists(toggleReminderCategory(lists, t.category))} /> Ask for a next reminder date &amp; time under {t.category}</label>
        )}
        {(categoryAsksReminder(lists, t.category) || remDate) && (
          <div className="manage-panel reminder-panel">
            <span className="field">Next reminder date &amp; time <span className="muted">(9:00 AM if no time)</span></span>
            <div className="fields">
              <label className="field">Date<input type="date" value={remDate} onChange={(e) => setRemDate(e.target.value)} /></label>
              <div className="field">Time
                <button type="button" className="time-btn" onClick={() => setRemClock(true)} disabled={!remDate} aria-label="Pick the reminder time on a clock">
                  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 7v5l3.5 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
                  <span>{timeLabel(remTime) || (remDate ? 'Set time' : 'Pick a date first')}</span>
                </button>
              </div>
              {remDate && <div className="field">&nbsp;<button type="button" className="btn ghost" onClick={() => { setRemDate(''); setRemTime(''); }}>Clear reminder</button></div>}
            </div>
          </div>
        )}
        <div className="fields">
          <label className="field">Due date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <div className="field">Due time
            <button type="button" className="time-btn" onClick={() => setClockOpen(true)} disabled={!date} aria-label="Pick the due time on a clock">
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 7v5l3.5 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              <span>{timeLabel(time) || (date ? 'Set time' : 'Pick a date first')}</span>
            </button>
          </div>
          <label className="field">Repeats<select value={t.recurrence} onChange={set('recurrence')}>{opts(RECURRENCES, t.recurrence).map((x) => <option key={x}>{x}</option>)}</select></label>
          {t.recurrence === 'Custom' && <label className="field">Every (minutes)<input type="number" min="1" value={t.recurrenceEveryMin || ''} onChange={(e) => setT({ ...t, recurrenceEveryMin: Number(e.target.value) || null })} /></label>}
        </div>
        {repeatsEvery && <p className="muted">Hourly and custom repeats are set here but are repeated by the phone app, not by this site.</p>}
        </div><div className="col">
        {subBlock}
        <NarrationBox t={t} />
        <div className="fields">
          <div className="field">Alert at the due time
            <div className="seg" role="group" aria-label="Alert at the due time" title="Alarm = pop-up + sound, Reminder = notification only">
              {[['', 'Default'], ['alarm', 'Alarm'], ['gentle', 'Reminder']].map(([v, l]) => <button type="button" key={v} className={t.alertMode === v ? 'on' : ''} onClick={() => setT({ ...t, alertMode: v })}>{l}</button>)}
            </div>
          </div>
          <label className="field check"><input type="checkbox" checked={t.dar} onChange={(e) => setT({ ...t, dar: e.target.checked })} /> Include in the daily report when done (DAR)</label>
        </div>
        <div className="field full">
          <span className="field-head">Mail chain<button type="button" className="mini" disabled={!t.reference.trim()} onClick={async () => { notify((await copyText(t.reference)) ? 'Mail chain copied' : 'Could not copy the mail chain'); }} title="Copy the mail chain">Copy</button></span>
          <input value={t.reference} onChange={set('reference')} placeholder="Paste or type the mail subject" aria-label="Mail chain" />
        </div>
        <div className="field full">Key points (go into the daily report line)
          {t.keyPoints.map((k, i) => (
            <div key={i} className="row"><span className="kp"><b>{k.key}</b>{k.key && k.value ? ': ' : ''}{k.value}</span><button type="button" className="btn ghost" onClick={() => setT({ ...t, keyPoints: t.keyPoints.filter((_, n) => n !== i) })} aria-label="Remove key point">✕</button></div>
          ))}
          <div className="add-row"><input value={kp.key} onChange={(e) => setKp({ ...kp, key: e.target.value })} placeholder="Label (e.g. Invoice no.)" /><input value={kp.value} onChange={(e) => setKp({ ...kp, value: e.target.value })} placeholder="Value" /><button type="button" className="btn" onClick={addKp} disabled={!kp.key.trim() && !kp.value.trim()}>Add</button></div>
        </div>
        <div className="field full">Attachment links (invoice, bank advice, Drive file...)
          {t.attachments.map((a) => (
            <div key={a.id} className="row"><a href={a.url} target="_blank" rel="noopener noreferrer" className="attach">{a.title}</a><button type="button" className="btn ghost" onClick={() => setT({ ...t, attachments: t.attachments.filter((x) => x.id !== a.id) })} aria-label={`Remove ${a.title}`}>✕</button></div>
          ))}
          <div className="add-row"><input value={att.title} onChange={(e) => setAtt({ ...att, title: e.target.value })} placeholder="Title (optional)" /><input value={att.url} onChange={(e) => setAtt({ ...att, url: e.target.value })} placeholder="https://..." /><button type="button" className="btn" onClick={addAtt} disabled={!att.url.trim()}>Add</button></div>
        </div>
        </div><div className="col">
        <label className="field full">Notes<textarea rows={4} value={t.notes} onChange={set('notes')} /></label>
        <div className="side-panel">
        <div className="field full">Checklist{t.checklist.length > 0 && <span className="muted"> ({t.checklist.filter((c) => c.done).length}/{t.checklist.length} done)</span>}
          {t.checklist.map((c) => (
            <div key={c.id} className="row">
              <label className="check-row"><input type="checkbox" checked={c.done} onChange={() => setT({ ...t, checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })} /><span className={c.done ? 'struck' : ''}>{c.text}</span></label>
              <button type="button" className="btn ghost" onClick={() => setT({ ...t, checklist: t.checklist.filter((x) => x.id !== c.id) })} aria-label={`Remove ${c.text}`}>✕</button>
            </div>
          ))}
          <div className="add-row"><input value={step} onChange={(e) => setStep(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStepNow(); } }} placeholder="Add a step..." /><button type="button" className="btn" onClick={addStepNow} disabled={!step.trim()}>Add</button></div>
        </div>
        </div>
        </div></div>
        {subError && <div className="banner err" role="alert">{subError}</div>}
        <div className="sheet-foot">
          {!isNew && !t.binned && <button type="button" className="btn danger" onClick={() => { actions.bin(t); onClose(); }}>Move to bin</button>}
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!t.title.trim()}>Save</button>
        </div>
      </form>
      {remClock && <ClockPicker value={remTime} onPick={(v) => { setRemTime(v); setRemClock(false); }} onClear={() => { setRemTime(''); setRemClock(false); }} onClose={() => setRemClock(false)} />}
      {clockOpen && <ClockPicker value={time} onPick={(v) => { setTime(v); setClockOpen(false); }} onClear={() => { setTime(''); setClockOpen(false); }} onClose={() => setClockOpen(false)} />}
    </div>
  );
}
