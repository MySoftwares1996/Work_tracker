import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Logo from './Logo';
import Icon from './icons';
import LoadingScreen from './LoadingScreen';
import AlertCenter from './AlertCenter';
import EmptyState, { SkeletonRows } from './EmptyState';
import { PageHead, Chip, priTone, priDot } from './ui';
import { toggleSelected, selectedRows, planBulkComplete, bulkCompleteNote, moveDueDate } from './bulk';

import { copyText } from './clipboard';
import { useCardsPerRow, gridProps, PerRow } from './cardsPerRow';
import { refreshAll } from './refresh';
import { weeklyReview, slipReason } from '../../src/weeklyReview.js';

import { useStore } from './store';

import { breakdown, subBreakdown, templateFrom, saveTemplate, DUE_FILTERS, isReminderDue, reminderLabel, subCategoryMissing, RECURRENCES, SORTS, blankTask, dayKey, dueLabel, filterTasks, isDueNextMonth, isDueThisMonth, isDueToday, isOpen, isOverdue, sortTasks, stats } from './data';

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
  const tabRef = useRef(tab);       // the tab the app itself last opened: a hashchange to another one (Back / Forward) drops the old Register filter
  const [form, setForm] = useState(null);
  const [preset, setPreset] = useState(null);       // a filter the Dashboard tile asked the Register to open with (cleared when the address changes, e.g. Back)
  useEffect(() => { const f = () => { const k = tabFromHash(); setTab(k); if (k !== tabRef.current) setPreset(null); tabRef.current = k; }; window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  const go = (k, filter = null) => { tabRef.current = k; location.hash = k; setPreset(filter ? { ...filter, n: Date.now() } : null); setTab(k); window.scrollTo({ top: 0 }); };

  // Hooks first: the early returns below (loading, sign-in) must never change how many hooks run.
  const [refreshing, setRefreshing] = useState(false);
  const doRefresh = async () => {
    setRefreshing(true);
    const r = store.demo ? 'demo' : await refreshAll().catch(() => 'offline');
    store.notify(r === 'demo' ? 'Demo data - nothing to refresh' : r === 'reload' ? 'A new version is available - reloading' : r === 'synced' ? `Up to date - refreshed ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Could not reach the server - showing the last data received');
    setTimeout(() => setRefreshing(false), 600);
  };
  if (store.user === undefined) return <LoadingScreen stage="auth" full />;
  if (store.demo && location.search.includes('loading')) return <LoadingScreen stage="data" full />;      // ?demo&loading previews the loading screen
  if (!store.user) return <SignIn />;

  const booting = !store.hasLoaded && !store.error && !store.slow;      // the first server answer has not arrived: Dashboard / Register show placeholder rows
  const tasks = store.tasks;
  const counts = { register: tasks.filter(isOpen).length, done: tasks.filter((t) => t.done && !t.binned).length, bin: tasks.filter((t) => t.binned).length };
  const openForm = (t) => setForm(t || blankTask());
  const onNew = () => openForm();
  const screens = {
    dashboard: <Dashboard onEdit={openForm} onNew={onNew} go={go} />,
    register: <Register onEdit={openForm} onNew={onNew} preset={preset} />,
    done: <Completed onEdit={openForm} onNew={onNew} />,
    holidays: <Holidays onNew={onNew} />,
    bin: <Bin onNew={onNew} />,
    report: <Report />,
    links: <Links onNew={onNew} />,
    config: <Config />,
  };
  const name = store.user.displayName || store.user.email || '';

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><Logo size={36} className="brand-logo" /><span className="brand-name">Working Dashboard</span></div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map(([k, label]) => (
            <button key={k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => go(k)} aria-current={tab === k ? 'page' : undefined}>
              {label}{counts[k] ? <span className="count">{counts[k]}</span> : null}
            </button>
          ))}
        </nav>
        <div className="who">
          {store.demo && <span className="pill demo">Demo data</span>}
          {!store.demo && store.hasLoaded && !store.synced && <span className="pill demo" role="status" title="Offline: showing the last data received. Changes are sent when the connection returns.">Offline</span>}
          {!store.demo && <span className={`dot ${store.synced ? 'ok' : ''}`} title={store.synced ? `In sync${store.lastSyncAt ? ` - last update from the server ${new Date(store.lastSyncAt).toLocaleTimeString()}` : ''}` : store.hasLoaded ? 'Offline - showing the last data received' : 'Syncing...'} />}
          <button type="button" className={`refresh-btn${refreshing ? ' spin' : ''}`} onClick={doRefresh} disabled={refreshing} aria-label="Refresh" title="Refresh: read the latest from the server and check for a new version"><Icon name="refresh" size={20} /></button>
          <span className="me" title={store.user.email || name}><i className="me-av" aria-hidden="true">{(name.trim().charAt(0) || '?').toUpperCase()}</i><span className="me-name">{name}</span></span>
        </div>
      </header>
      <main className="page">
        {store.error && <div className="banner err" role="alert">{store.error}</div>}
        {!store.demo && store.slow && !store.hasLoaded && !store.error && <div className="banner err" role="status">Cannot reach the server yet - check your internet connection. Your tasks appear as soon as it answers; the numbers below may be incomplete until then.</div>}
        {booting && !['dashboard', 'register'].includes(tab) ? <LoadingScreen stage="data" /> : <Suspense fallback={<LoadingScreen stage="data" />}>{screens[tab]}</Suspense>}
      </main>
      {form && <Suspense fallback={null}><TaskForm initial={form} onClose={() => setForm(null)} /></Suspense>}
      <AlertCenter onOpen={openForm} />
    </div>
  );
}

function SignIn() {
  const { signIn, error } = useStore();
  const points = [
    'Alarms that ring on time, even on the lock screen',
    'One tap to finish a task, or add it to the daily report',
    'The same data on every device you sign in on',
  ];
  return (
    <div className="welcome">
      <div className="welcome-in">
        <Logo size={68} tone="mint" mode="still" className="welcome-logo" />
        <h1>Your work, always in step.</h1>
        <p className="lead">Tasks, alerts and the daily report - on your phone and on the web, kept in sync.</p>
        <div className="pts">{points.map((p) => <div key={p}><i><Icon name="check" size={15} strokeWidth={2.6} /></i>{p}</div>)}</div>
        <button type="button" className="g-btn" onClick={signIn}><b aria-hidden="true">G</b>Sign in with Google</button>
        {error && <p className="banner err" role="alert">{error}</p>}
        <p className="fine">Your tasks stay in your own private space.</p>
      </div>
    </div>
  );
}

/** A fresh "now" every 60 s, so a tab left open past a due time or midnight recounts Overdue / Due Today. */
function useMinute() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(id); }, []);
  return now;
}

/** A coloured count tile (Overdue, Due today, Next 7 days, This month): opens the Register on that filter. */
function Stat({ tone, label, value, loading, onClick }) {
  return (
    <button type="button" className={`st ${tone}`} onClick={onClick}>
      <span>{label}</span>
      <b>{loading ? '–' : value}</b>
    </button>
  );
}

function Dashboard({ onEdit, onNew, go }) {
  const { tasks, actions, user } = useStore();
  const loading = useLoading();
  const [quick, setQuick] = useState('');
  const now = useMinute();
  const s = useMemo(() => stats(tasks, now), [tasks, now]);
  const open = tasks.filter(isOpen);
  const lateAll = sortTasks(open.filter((t) => isOverdue(t, now)), 'due');
  const todayAll = sortTasks(open.filter((t) => isDueToday(t, now) || (isReminderDue(t) && !isOverdue(t, now))), 'due');
  const late = lateAll.slice(0, 8);
  const today = todayAll.slice(0, 8);
  const addQuick = (e) => {
    e.preventDefault();
    const title = quick.trim();
    if (!title) return;
    actions.save({ ...blankTask(), title });
    setQuick('');
  };
  const hour = now.getHours();
  const first = String((user && user.displayName) || '').trim().split(/\s+/)[0];
  const monthName = (add) => new Date(now.getFullYear(), now.getMonth() + add, 1).toLocaleString([], { month: 'long' });
  const todayKey = dayKey(now);
  const doneTodayDar = tasks.filter((t) => t.done && !t.binned && !t.purged && t.completedAt && dayKey(t.completedAt) === todayKey && t.dar).length;
  const need = s.pendingAsOnToday;
  const dayTotal = need + s.doneToday;
  const pct = dayTotal ? Math.round((s.doneToday / dayTotal) * 100) : 0;
  return (
    <div className="dash">
      <PageHead title={`Good ${hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'}${first ? `, ${first}` : ''}`} sub={now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} onNew={onNew} />
      <form className="quick" onSubmit={addQuick}>
        <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Quick add a task and press Enter..." aria-label="Quick add" />
        <button className="btn primary" disabled={!quick.trim()}>Add</button>
      </form>
      <section className="tiles" aria-label="Today at a glance">
        <div className="hero">
          <span className="hero-k">TODAY</span>
          <button type="button" className="hero-n" onClick={() => go('register', { due: 'pending' })} title="Overdue plus due today: open them in the Register">
            <b>{loading ? '–' : need}</b><span>{need === 1 ? 'task needs you' : 'tasks need you'}</span>
          </button>
          <div className="bar" role="progressbar" aria-label="Done today" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>
          <div className="hero-f">
            <button type="button" className="hero-link" onClick={() => go('done')}>{loading ? '–' : `${s.doneToday} of ${dayTotal}`} done today</button>
            <span>{loading ? '–' : doneTodayDar} in the daily report</span>
          </div>
        </div>
        <Stat loading={loading} tone="danger" label="Overdue" value={s.overdue} onClick={() => go('register', { due: 'overdue' })} />
        <Stat loading={loading} tone="amber" label="Due today" value={s.dueToday} onClick={() => go('register', { due: 'today' })} />
        <Stat loading={loading} tone="slate" label="Next 7 days" value={s.dueSoon} onClick={() => go('register', { due: 'next7' })} />
        <Stat loading={loading} tone="green" label="This month" value={s.thisMonth} onClick={() => go('register', { due: 'month' })} />
      </section>
      <section className="more-tiles" aria-label="More counts">
        {[
          ['Next month', s.nextMonth, `Due in ${monthName(1)}`, () => go('register', { due: 'nextmonth' })],
          ['No due date', s.noDueDate, 'Needs a deadline', () => go('register', { due: 'none' })],
          ['Pending', s.pending, 'Status Pending', () => go('register', { status: 'Pending' })],
          ['High priority', s.high, 'Open tasks', () => go('register', { priority: 'High' })],
          ['Open tasks', s.open, 'In the register', () => go('register')],
        ].map(([label, value, sub, onClick]) => (
          <button key={label} type="button" className="mt" onClick={onClick} title={sub}><b>{loading ? '–' : value}</b><span>{label}</span></button>
        ))}
      </section>
      <div className="cols">
        <div className="left">
          <section>
            <div className="sec"><h2 className="h2">Needs attention <span className="muted">({lateAll.length} overdue)</span></h2><button type="button" className="link-btn" onClick={() => go('register', { due: 'overdue' })}>Open the register</button></div>
            {loading && <SkeletonRows count={4} compact />}
            {!loading && !late.length && <Empty icon="check" title="Nothing overdue" text="Nothing is past its due time. Nice." />}
            <div className="list">{late.map((t) => <AttentionRow key={t.id} t={t} onEdit={onEdit} />)}</div>
          </section>
          <section>
            <div className="sec"><h2 className="h2">Due today <span className="muted">({todayAll.length})</span></h2></div>
            {loading && <SkeletonRows count={4} compact />}
            {!loading && !today.length && <Empty icon="calendar" title="Nothing due today" text="Today's list is clear." />}
            <div className="list">{today.map((t) => <AttentionRow key={t.id} t={t} onEdit={onEdit} />)}</div>
          </section>
        </div>
        <aside className="right">
          {!loading && <WeeklyReview tasks={tasks} now={now} onEdit={onEdit} />}
          {!loading && <Breakdowns tasks={tasks} go={go} part="side" />}
        </aside>
      </div>
      {!loading && <Breakdowns tasks={tasks} go={go} part="main" />}
    </div>
  );
}

/** "This week": done since Monday, due in the next 7 days, overdue, and the tasks that are slipping (snoozed 3+ times or 7+ days overdue). Hidden when there is nothing to show. */
function WeeklyReview({ tasks, now, onEdit }) {
  const { calendar } = useStore();
  const r = useMemo(() => weeklyReview(tasks, now, { holidays: calendar.holidays, leaveDays: calendar.leaveDays }), [tasks, now, calendar]);
  if (r.empty) return null;
  return (
    <section className="card plain wr" aria-label="This week">
      <h2 className="wr-head">This week</h2>
      <div className="li"><span>Done since Monday</span><b className="ok">{r.doneThisWeek}</b></div>
      <div className="li"><span>Due in the next 7 days</span><b>{r.dueSoon.count}</b></div>
      <div className="li"><span>Overdue</span><b className={r.overdue ? 'bad' : ''}>{r.overdue}</b></div>
      {!!r.slipping.length && (
        <div className="wr-slip">
          <h3>Slipping <span className="muted">({r.slipping.length})</span></h3>
          {r.slipping.slice(0, 3).map((s) => (
            <button key={s.entry.id} className="wr-item" onClick={() => onEdit(s.entry)} aria-label={`Edit ${s.entry.title}`}>
              <span className="wr-title">{s.entry.title || '(no description)'}</span>
              <span className="wr-why">{slipReason(s)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** The Dashboard's breakdowns of the open tasks: by Category, Status, Pending with and Priority. A Category opens its Sub Category breakdown; the others open the Register filtered. */
const BREAK_CARDS = [
  { key: 'category', title: 'By category', field: 'category', hint: 'Click a category for its sub categories' },
  { key: 'status', title: 'By status', field: 'status' },
  { key: 'pendingWith', title: 'By pending with', field: 'pendingWith' },
  { key: 'priority', title: 'By priority', field: 'priority' },
];

/**
 * This month's open tasks by category, status, pending with and priority; next month's by category and priority. A row opens the Register on the same month.
 * part "side" is just this month's "By category" card (the Dashboard's right column); "main" is everything else, under the two columns.
 */
function Breakdowns({ tasks, go, part }) {
  const [pop, setPop] = useState(null);
  const monthName = (add) => new Date(new Date().getFullYear(), new Date().getMonth() + add, 1).toLocaleString([], { month: 'long' });
  const thisTasks = useMemo(() => tasks.filter((t) => isDueThisMonth(t)), [tasks]);
  const nextTasks = useMemo(() => tasks.filter((t) => isDueNextMonth(t)), [tasks]);
  const groups = [
    { due: 'month', name: monthName(0), title: `This month - ${monthName(0)}`, tasks: thisTasks, cards: BREAK_CARDS },
    { due: 'nextmonth', name: monthName(1), title: `Next month - ${monthName(1)}`, tasks: nextTasks, cards: BREAK_CARDS.filter((c) => c.key === 'category' || c.key === 'priority') },
  ];
  const card = (g, c) => {
    const rows = breakdown(g.tasks, c.field);
    const max = Math.max(1, ...rows.map((r) => r.count));
    const open = (row) => { if (!row.name) return; if (c.key === 'category') setPop({ category: row.name, due: g.due, tasks: g.tasks }); else go('register', { [c.key]: row.name, due: g.due }); };
    return (
      <div key={`${g.due}-${c.key}`} className="card plain break-card">
        <h2 className="h2">{c.title}{part === 'side' && <span className="muted"> - due in {g.name}</span>}</h2>
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
  };
  const popup = pop && <CategoryPopup category={pop.category} tasks={pop.tasks} due={pop.due} onClose={() => setPop(null)} go={go} />;
  if (part === 'side') return <>{card(groups[0], BREAK_CARDS[0])}{popup}</>;
  return (
    <>
      {groups.map((g) => {
        const cards = g.cards.filter((c) => !(g.due === 'month' && c.key === 'category'));
        return (
          <section key={g.due} className="break-group">
            <h2 className="h2 break-title">{g.title} <span className="muted">({g.tasks.length} open)</span></h2>
            <div className={`breaks${cards.length < 3 ? ' two-up' : ''}`}>{cards.map((c) => card(g, c))}</div>
          </section>
        );
      })}
      {popup}
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
        <div className="modal-head"><div><h2>{category}</h2><span className="muted">{total} open task{total === 1 ? '' : 's'} by sub category</span></div><button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button></div>
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

const Empty = (props) => <EmptyState {...props} />;
/** True until the first server snapshot has arrived (and no error / timeout was shown): lists then draw placeholder rows instead of an empty state. */
function useLoading() { const { hasLoaded, error, slow } = useStore(); return !hasLoaded && !error && !slow; }

/** Completing a task from a card or row: a task whose Sub Category has fields needs all of them filled first, so it opens for filling instead. */
function useCompleter(onEdit) {
  const { actions, lists, notify } = useStore();
  return (t, dar) => {
    const msg = subCategoryMissing(t, lists);
    if (msg) { notify(msg); onEdit(t); return; }
    actions.complete(t, dar);
  };
}

/** A task as one row with Done and DAR (the Dashboard's Needs attention / Due today). */
function AttentionRow({ t, onEdit }) {
  const complete = useCompleter(onEdit);
  const late = isOverdue(t);
  const parts = [t.priority, t.category, t.pendingWith ? `with ${t.pendingWith}` : ''].filter(Boolean);
  return (
    <div className={`arow${late ? ' late' : ''}`}>
      <button className="arow-main" onClick={() => onEdit(t)} aria-label={`Edit ${t.title}`}>
        <span className="arow-title">{t.title || '(no description)'}</span>
        <span className="meta"><i className={`pdot ${priDot(t.priority)}`} />{parts.join(' · ')}{parts.length ? ' · ' : ''}<span className={late ? 'late' : ''}>{dueLabel(t)}</span></span>
      </button>
      <span className="act">
        <button className="btn ok" onClick={() => complete(t, false)} title="Done - kept out of the daily report">Done</button>
        <button className="btn ok soft" onClick={() => complete(t, true)} title="Done and included in the daily report">DAR</button>
      </span>
    </div>
  );
}

function TaskCard({ t, onEdit, compact, selected, onSelect, selecting }) {
  const { actions, notify, templates, saveTemplates } = useStore();
  const complete = useCompleter(onEdit);
  const late = isOverdue(t);
  return (
    <article className={`card task pri-${String(t.priority).toLowerCase()}${t.done ? ' is-done' : ''}${selected ? ' is-selected' : ''}${selecting ? ' selecting' : ''}`}>
      {onSelect && <input type="checkbox" className="sel-box" checked={!!selected} onChange={() => onSelect(t.id)} aria-label={`Select ${t.title || 'task'}`} />}
      <button className="card-main" onClick={() => onEdit(t)} aria-label={`Edit ${t.title}`}>
        <span className="card-title">{t.title || '(no description)'}</span>
        <span className="card-meta">
          {t.priority && <Chip tone={priTone(t.priority)}>{t.priority}</Chip>}
          {t.category && <Chip>{t.category}</Chip>}
          {t.pendingWith && <Chip>with {t.pendingWith}</Chip>}
          {!t.done && <Chip tone={late ? 'solid' : isDueToday(t) ? 'amber' : ''}>{dueLabel(t)}</Chip>}
          {t.done && t.completedAt && <Chip tone="teal">Done {t.completedAt.toLocaleDateString([], { day: 'numeric', month: 'short' })}</Chip>}
          {t.recurrence !== RECURRENCES[0] && <Chip icon="repeat">{t.recurrence}</Chip>}
          {isOpen(t) && t.nextReminder && <Chip tone={isReminderDue(t) ? 'coral' : ''} icon="clock">{reminderLabel(t)}</Chip>}
        </span>
        {Array.isArray(t.checklist) && t.checklist.length > 0 && (() => {
          const total = t.checklist.length;
          const n = t.checklist.filter((c) => c.done).length;
          return (
            <span className={`card-checklist${n === total ? ' all' : ''}`} title={t.checklist.map((c) => `${c.done ? '[x]' : '[ ]'} ${c.text}`).join('\n')}>
              <span className="cl-label">Checklist ({n}/{total} done)</span>
              <span className="cl-bar" aria-hidden="true"><span style={{ width: `${Math.round((n / total) * 100)}%` }} /></span>
            </span>
          );
        })()}
        {!compact && t.reference && (
          <span className="card-note mail-copy" title="Click to copy the mail subject and open the task"
            onClick={async () => { notify((await copyText(t.reference)) ? 'Mail subject copied' : 'Could not copy the mail subject'); }}><Icon name="mail" size={13} /> {t.reference}</span>
        )}
      </button>
      {isOpen(t) && (
        <div className="card-actions">
          <button className="btn ok" onClick={() => complete(t, false)} title="Done - kept out of the daily report">Done</button>
          <button className="btn ok soft" onClick={() => complete(t, true)} title="Done and included in the daily report">DAR</button>
          <button className="icon-btn" onClick={() => { saveTemplates(saveTemplate(templates, templateFrom(t))); notify(`Template saved: ${t.title}`); }} title="Save as template" aria-label="Save as template"><Icon name="template" size={17} /></button>
          <button className="icon-btn" onClick={() => actions.bin(t)} aria-label="Move to bin" title="Move to bin"><Icon name="trash" size={17} /></button>
        </div>
      )}
    </article>
  );
}

function Register({ onEdit, onNew, preset }) {
  const { tasks, lists, actions, notify } = useStore();
  const loading = useLoading();
  const [selected, setSelected] = useState(() => new Set());
  const [f, setF] = useState(() => ({ q: '', priority: '', category: '', subCategory: '', pendingWith: '', status: '', due: '', ...(preset || {}) }));
  useEffect(() => { if (preset) setF({ q: '', priority: '', category: '', subCategory: '', pendingWith: '', status: '', due: '', ...preset }); }, [preset]);
  const [by, setBy] = useState('due');
  const [view, setView] = useState('cards');
  const [perRow, setPerRow] = useCardsPerRow('register');
  const open = tasks.filter(isOpen);
  const sorted = sortTasks(filterTasks(open, f), by);
  const { shown, more, showMore } = usePaged(sorted, JSON.stringify(f) + by);
  const picked = selectedRows(sorted, selected);
  const select = (id) => setSelected((s) => toggleSelected(s, id));
  const clearSel = () => setSelected(new Set());
  useEffect(() => {
    if (!selected.size) return undefined;
    const k = (e) => { if (e.key === 'Escape' && !document.querySelector('[role="dialog"], [role="alertdialog"]')) clearSel(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [selected.size]);
  const clearFilters = () => setF({ q: '', priority: '', category: '', subCategory: '', pendingWith: '', status: '', due: '' });
  const bulkDone = (dar) => {
    const { doable, skipped } = planBulkComplete(picked, lists);
    doable.forEach((t) => actions.complete(t, dar));
    notify(bulkCompleteNote(doable.length, skipped.length, dar));
    setSelected(new Set(skipped.map((t) => t.id)));       // the skipped ones stay selected, so they can be opened and filled in
  };
  const bulkBin = () => { picked.forEach((t) => actions.bin(t)); notify(`${picked.length} task${picked.length === 1 ? '' : 's'} moved to the bin`); clearSel(); };
  const bulkMove = (date) => {
    if (!date) return;
    picked.forEach((t) => actions.save(moveDueDate(t, date)));
    notify(`${picked.length} task${picked.length === 1 ? '' : 's'} moved to ${date}`);
    clearSel();
  };
  const filtered = Object.entries(f).some(([k, v]) => k !== 'n' && v);
  return (
    <>
      <PageHead title="Register" sub={`${sorted.length} of ${open.length} open entries`} onNew={onNew} />
      {f.subCategory && <div className="filters"><span className="chip teal">Sub category: {f.subCategory === '__none' ? 'none chosen' : f.subCategory} <button type="button" className="chip-x" onClick={() => setF({ ...f, subCategory: '' })} aria-label="Clear the sub category filter"><Icon name="x" size={12} /></button></span></div>}
      <Filters f={f} setF={setF} lists={lists} onClear={clearFilters} extra={(
        <>
          <select value={by} onChange={(e) => setBy(e.target.value)} aria-label="Sort">{Object.entries(SORTS).map(([k, v]) => <option key={k} value={k}>Sort: {v}</option>)}</select>
          <div className="seg" role="group" aria-label="View"><button className={view === 'cards' ? 'on' : ''} onClick={() => setView('cards')} aria-pressed={view === 'cards'}>Cards</button><button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')} aria-pressed={view === 'table'}>Table</button></div>
          {view === 'cards' && <PerRow value={perRow} onChange={setPerRow} />}
        </>
      )} />
      {loading && <SkeletonRows />}
      {!loading && !sorted.length && (filtered && open.length
        ? <Empty icon="search" title="Nothing matches" text="No open task fits these filters." action={{ label: 'Clear filters', onClick: clearFilters, primary: false }} />
        : <Empty icon="check" title="All clear" text="No open tasks. Enjoy the quiet - or add the next one." action={{ label: 'New entry', onClick: () => onEdit() }} />)}
      {view === 'cards' ? <div {...gridProps(perRow)}>{shown.map((t) => <TaskCard key={t.id} t={t} onEdit={onEdit} selected={selected.has(t.id)} onSelect={select} selecting={selected.size > 0} />)}</div> : <Table rows={shown} onEdit={onEdit} selected={selected} onSelect={select} />}
      <MoreButton more={more} onClick={showMore} />
      {picked.length > 0 && (
        <div className="bulk-bar" role="toolbar" aria-label="Actions for the selected tasks">
          <b className="bulk-count" role="status">{picked.length} selected</b>
          <button type="button" className="btn ok" onClick={() => bulkDone(false)} title="Done - kept out of the daily report">Done</button>
          <button type="button" className="btn ok soft" onClick={() => bulkDone(true)} title="Done and included in the daily report">DAR</button>
          <label className="bulk-move">Move date <input type="date" aria-label="Move date" value="" onChange={(e) => bulkMove(e.target.value)} /></label>
          <button type="button" className="btn danger" onClick={bulkBin}>Bin</button>
          <button type="button" className="btn ghost" onClick={clearSel}>Clear</button>
        </div>
      )}
    </>
  );
}

function Filters({ f, setF, lists, extra, onClear }) {
  const active = ['q', 'priority', 'category', 'subCategory', 'pendingWith', 'status', 'due'].some((k) => f[k]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="filters flt">
      <input className="search" value={f.q} onChange={set('q')} placeholder="Search task, mail chain, notes..." aria-label="Search" />
      <select value={f.priority} onChange={set('priority')} aria-label="Priority"><option value="">All priorities</option>{lists.priorities.map((x) => <option key={x}>{x}</option>)}</select>
      <select value={f.category} onChange={set('category')} aria-label="Category"><option value="">All categories</option>{lists.categories.map((x) => <option key={x}>{x}</option>)}</select>
      {lists.pendingWith.length > 0 && <select value={f.pendingWith} onChange={set('pendingWith')} aria-label="Pending with"><option value="">Anyone</option>{lists.pendingWith.map((x) => <option key={x}>{x}</option>)}</select>}
      {f.due !== undefined && <select value={f.due || ''} onChange={set('due')} aria-label="Due"><option value="">Any due date</option>{DUE_FILTERS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
      {f.status !== undefined && <select value={f.status || ''} onChange={set('status')} aria-label="Status"><option value="">Any status</option>{lists.statuses.map((x) => <option key={x}>{x}</option>)}</select>}
      {onClear && <button type="button" className="btn clear-filters" onClick={onClear} disabled={!active} title="Clear all filters" aria-label="Clear all filters"><Icon name="x" size={16} /></button>}
      {extra}
    </div>
  );
}

function Table({ rows, onEdit, done, selected, onSelect }) {
  const { actions } = useStore();
  const complete = useCompleter(onEdit);
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{onSelect && <th className="sel-col"><span className="sr-only">Select</span></th>}<th>Task</th><th>Priority</th><th>Category</th><th>With</th><th>{done ? 'Completed' : 'Due'}</th><th /></tr></thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id} className={selected && selected.has(t.id) ? 'is-selected' : ''}>
              {onSelect && <td className="sel-col"><input type="checkbox" className="sel-box" checked={selected.has(t.id)} onChange={() => onSelect(t.id)} aria-label={`Select ${t.title || 'task'}`} /></td>}
              <td><button className="link" onClick={() => onEdit(t)}>{t.title || '(no description)'}</button></td>
              <td><Chip tone={priTone(t.priority)}>{t.priority || '-'}</Chip></td>
              <td>{t.category || '-'}</td>
              <td>{t.pendingWith || '-'}</td>
              <td className={isOverdue(t) ? 'late' : ''}>{done ? (t.completedAt ? t.completedAt.toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '-') : dueLabel(t)}</td>
              <td className="td-end">{done ? <button className="btn" onClick={() => actions.reopen(t)}>Reopen</button> : <span className="act"><button className="btn ok" onClick={() => complete(t, false)} title="Done - kept out of the daily report">Done</button> <button className="btn ok soft" onClick={() => complete(t, true)}>DAR</button></span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Completed({ onEdit, onNew }) {
  const { tasks, lists, actions } = useStore();
  const loading = useLoading();
  const [f, setF] = useState({ q: '', priority: '', category: '', pendingWith: '' });
  const rows = filterTasks(tasks.filter((t) => t.done && !t.binned), f).sort((a, b) => (b.completedAt?.getTime() || 0) - (a.completedAt?.getTime() || 0));
  const { shown, more, showMore } = usePaged(rows, JSON.stringify(f));
  const [perRow, setPerRow] = useCardsPerRow('completed');
  return (
    <>
      <PageHead title="Completed" sub={`${rows.length} completed`} onNew={onNew} />
      <Filters f={f} setF={setF} lists={lists} extra={<PerRow value={perRow} onChange={setPerRow} />} />
      {loading && <SkeletonRows />}
      {!loading && !rows.length && <Empty icon="check" title="Nothing completed yet" text="Tasks you mark done will be listed here." />}
      <div {...gridProps(perRow)}>
        {shown.map((t) => (
          <article key={t.id} className="card task is-done">
            <button className="card-main" onClick={() => onEdit(t)}>
              <span className="card-title">{t.title}</span>
              <span className="card-meta">
                {t.category && <Chip>{t.category}</Chip>}
                {t.completedAt && <Chip tone="teal">{t.completedAt.toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</Chip>}
                <Chip>{t.dar ? 'In daily report' : 'Done only'}</Chip>
              </span>
            </button>
            <div className="card-actions"><button className="btn grow-btn" onClick={() => actions.reopen(t)}>Reopen</button><button className="icon-btn" onClick={() => actions.bin(t)} aria-label="Move to bin" title="Move to bin"><Icon name="trash" size={17} /></button></div>
          </article>
        ))}
      </div>
      <MoreButton more={more} onClick={showMore} />
    </>
  );
}

function Holidays({ onNew }) {
  const { calendar } = useStore();
  const fmt = (d) => { const x = new Date(`${d}T00:00:00`); return Number.isNaN(x.getTime()) ? d : x.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }); };
  const block = (title, list, tone) => (
    <section>
      <h2 className="h2">{title} <span className="muted">({list.length})</span></h2>
      {!list.length && <Empty icon="calendar" title={`No ${title.toLowerCase()} yet`} text="Add them on the phone app or the old website." />}
      <div className="list">{[...list].sort((a, b) => a.date.localeCompare(b.date)).map((h) => <div key={h.date + h.name} className={`card plain day ${tone}`}><span className="card-title">{fmt(h.date)}</span>{h.name && <span className="day-name">{h.name}</span>}</div>)}</div>
    </section>
  );
  return <><PageHead title="Holidays" sub="Set up on the phone app or the old website; shown here as they arrive." onNew={onNew} /><div className="two">{block('Holidays', calendar.holidays, 'amber')}{block('Leave days', calendar.leaveDays, 'slate')}</div></>;
}

function Bin({ onNew }) {
  const { tasks, actions } = useStore();
  const rows = tasks.filter((t) => t.binned).sort((a, b) => (b.binnedAt?.getTime() || 0) - (a.binnedAt?.getTime() || 0));
  const [perRow, setPerRow] = useCardsPerRow('bin');
  return (
    <>
      <PageHead title="Bin" sub="Restore a task, or delete it forever (it then disappears on every device)." onNew={onNew} />
      {!rows.length && <Empty icon="bin" title="The bin is empty" text="Deleted tasks wait here until you restore them." />}
      {rows.length > 1 && <div className="flt"><PerRow value={perRow} onChange={setPerRow} /></div>}
      <div {...gridProps(perRow)}>
        {rows.map((t) => (
          <article key={t.id} className="card task">
            <div className="card-main"><span className="card-title">{t.title}</span><span className="card-meta">{t.category && <Chip>{t.category}</Chip>}{t.binnedAt && <Chip>Binned {t.binnedAt.toLocaleDateString([], { day: 'numeric', month: 'short' })}</Chip>}</span></div>
            <div className="card-actions"><button className="btn grow-btn" onClick={() => actions.restore(t)}>Restore</button><button className="btn danger grow-btn" onClick={() => { if (confirm(`Delete "${t.title}" forever?`)) actions.purge(t); }}>Delete forever</button></div>
          </article>
        ))}
      </div>
    </>
  );
}

function Links({ onNew }) {
  const { links } = useStore();
  const folders = [...new Set(links.map((l) => l.folder))].sort();
  const [perRow, setPerRow] = useCardsPerRow('links');
  return (
    <>
      <PageHead title="Links" sub={`${links.length} saved link${links.length === 1 ? '' : 's'}`} onNew={onNew} />
      {!links.length && <Empty icon="link" title="No links yet" text="Links saved on the old website appear here." />}
      {links.length > 1 && <div className="flt"><PerRow value={perRow} onChange={setPerRow} /></div>}
      {folders.map((fo) => (
        <section key={fo || '-'}>
          {fo && <h2 className="h2">{fo}</h2>}
          <div {...gridProps(perRow)}>{links.filter((l) => l.folder === fo).map((l) => <a key={l.id} className="card plain linkcard" href={l.url} target="_blank" rel="noopener noreferrer"><span className="card-title">{l.title}</span><span className="muted">{l.url.replace(/^https?:\/\//, '')}</span></a>)}</div>
        </section>
      ))}
    </>
  );
}
