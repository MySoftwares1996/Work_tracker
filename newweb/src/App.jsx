import { useEffect, useMemo, useState } from 'react';
import { useStore } from './store';
import { DONE_STATUS, RECURRENCES, SORTS, addOption, blankTask, dayKey, dueLabel, filterTasks, isDueSoon, isDueToday, isOpen, isOverdue, pad, newId, removeOption, reportText, sortTasks, stats } from './data';

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
  const go = (k) => { location.hash = k; setTab(k); window.scrollTo({ top: 0 }); };

  if (store.user === undefined) return <div className="center"><div className="spinner" aria-label="Loading" /></div>;
  if (!store.user) return <SignIn />;

  const tasks = store.tasks;
  const counts = { register: tasks.filter(isOpen).length, done: tasks.filter((t) => t.done && !t.binned).length, bin: tasks.filter((t) => t.binned).length };
  const openForm = (t) => setForm(t || blankTask());
  const screens = {
    dashboard: <Dashboard onEdit={openForm} onNew={() => openForm()} go={go} />,
    register: <Register onEdit={openForm} />,
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
        <div className="brand"><span className="logo">W</span><span className="brand-name">Working Dashboard</span></div>
        <nav className="tabs" aria-label="Sections">
          {TABS.map(([k, label]) => (
            <button key={k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => go(k)} aria-current={tab === k ? 'page' : undefined}>
              {label}{counts[k] ? <span className="count">{counts[k]}</span> : null}
            </button>
          ))}
        </nav>
        <div className="who">
          {store.demo && <span className="pill demo">Demo data</span>}
          {!store.demo && <span className={`dot ${store.synced ? 'ok' : ''}`} title={store.synced ? 'In sync' : 'Syncing...'} />}
          <span className="name">{store.user.displayName || store.user.email}</span>
        </div>
      </header>
      <main className="page">
        {store.error && <div className="banner err" role="alert">{store.error}</div>}
        {screens[tab]}
      </main>
      <button className="fab" onClick={() => openForm()} aria-label="New entry">+ New entry</button>
      {form && <TaskForm initial={form} onClose={() => setForm(null)} />}
    </div>
  );
}

function SignIn() {
  const { signIn, error } = useStore();
  return (
    <div className="center">
      <div className="signin">
        <span className="logo big">W</span>
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
  const focus = sortTasks(open.filter((t) => isOverdue(t) || isDueToday(t)), 'due').slice(0, 8);
  const soon = sortTasks(open.filter((t) => isDueSoon(t)), 'due').slice(0, 5);
  const addQuick = (e) => {
    e.preventDefault();
    const title = quick.trim();
    if (!title) return;
    actions.save({ ...blankTask(), title });
    setQuick('');
  };
  return (
    <>
      <h1 className="h1">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}</h1>
      <form className="quick" onSubmit={addQuick}>
        <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Quick add a task and press Enter..." aria-label="Quick add" />
        <button className="btn primary" disabled={!quick.trim()}>Add</button>
        <button type="button" className="btn" onClick={onNew}>Full form</button>
      </form>
      <section className="tiles">
        <Tile tone="coral" label="Overdue" value={s.overdue} sub="Past their due day" onClick={() => go('register')} />
        <Tile tone="amber" label="Due today" value={s.dueToday} sub="Still to finish" onClick={() => go('register')} />
        <Tile tone="violet" label="Next 7 days" value={s.dueSoon} sub="Coming up" onClick={() => go('register')} />
        <Tile tone="pink" label="High priority" value={s.high} sub="Open tasks" onClick={() => go('register')} />
        <Tile tone="blue" label="Open tasks" value={s.open} sub="In the register" onClick={() => go('register')} />
        <Tile tone="teal" label="Done today" value={s.doneToday} sub="Completed" onClick={() => go('done')} />
      </section>
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
    </>
  );
}

const Empty = ({ text }) => <p className="empty">{text}</p>;

function Chip({ children, tone }) { return <span className={`chip ${tone || ''}`}>{children}</span>; }
const priTone = (p) => ({ high: 'coral', medium: 'amber', low: 'teal' })[String(p).toLowerCase()] || '';

function TaskCard({ t, onEdit, compact }) {
  const { actions } = useStore();
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
        </span>
        {!compact && t.reference && <span className="card-note">✉ {t.reference}</span>}
      </button>
      {isOpen(t) && (
        <div className="card-actions">
          <button className="btn ok" onClick={() => actions.complete(t, false)} title="Done - kept out of the daily report">✓ Done</button>
          <button className="btn ok soft" onClick={() => actions.complete(t, true)} title="Done and included in the daily report">✓ DAR</button>
          <button className="btn ghost" onClick={() => actions.bin(t)} aria-label="Move to bin">🗑</button>
        </div>
      )}
    </article>
  );
}

function Register({ onEdit }) {
  const { tasks, lists } = useStore();
  const [f, setF] = useState({ q: '', priority: '', category: '', pendingWith: '' });
  const [by, setBy] = useState('due');
  const [view, setView] = useState('cards');
  const open = tasks.filter(isOpen);
  const shown = sortTasks(filterTasks(open, f), by);
  return (
    <>
      <h1 className="h1">Register</h1>
      <Filters f={f} setF={setF} lists={lists} extra={(
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

function Filters({ f, setF, lists, extra }) {
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="filters">
      <input className="search" value={f.q} onChange={set('q')} placeholder="Search task, mail chain, notes..." aria-label="Search" />
      <select value={f.priority} onChange={set('priority')} aria-label="Priority"><option value="">All priorities</option>{lists.priorities.map((x) => <option key={x}>{x}</option>)}</select>
      <select value={f.category} onChange={set('category')} aria-label="Category"><option value="">All categories</option>{lists.categories.map((x) => <option key={x}>{x}</option>)}</select>
      {lists.pendingWith.length > 0 && <select value={f.pendingWith} onChange={set('pendingWith')} aria-label="Pending with"><option value="">Anyone</option>{lists.pendingWith.map((x) => <option key={x}>{x}</option>)}</select>}
      {extra}
    </div>
  );
}

function Table({ rows, onEdit, done }) {
  const { actions } = useStore();
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
              <td className="right">{done ? <button className="btn" onClick={() => actions.reopen(t)}>Reopen</button> : <><button className="btn ok" onClick={() => actions.complete(t, false)}>✓</button> <button className="btn ok soft" onClick={() => actions.complete(t, true)}>DAR</button></>}</td>
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
  const { tasks } = useStore();
  const [day, setDay] = useState(dayKey(new Date()));
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => reportText(tasks, new Date(`${day}T12:00:00`)), [tasks, day]);
  const copy = async () => { try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* the text is selectable */ } };
  return (
    <>
      <h1 className="h1">Daily report</h1>
      <div className="filters"><input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="Report date" /><button className="btn primary" onClick={copy}>{copied ? 'Copied ✓' : 'Copy report'}</button></div>
      <pre className="report">{text}</pre>
      <p className="muted">Lists tasks completed that day with "✓ DAR", then what is still open and due. The phone app's report has more detail (payment lines, AI rewrite).</p>
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

function Config() {
  const { lists, user, signOut, demo } = useStore();
  return (
    <>
      <h1 className="h1">Config</h1>
      <section className="card plain"><span className="card-title">{user.displayName || 'Signed in'}</span><span className="muted">{user.email}</span><div><button className="btn" onClick={signOut}>{demo ? 'Leave demo' : 'Sign out'}</button></div></section>
      <p className="muted">Add or delete the options used in the entry form. They are shared with the phone app and the old website. Tasks already using a deleted option keep it.</p>
      <div className="two">{LIST_META.map(([key, label]) => <section key={key} className="card plain"><h2 className="h2">{label}</h2><ListManager listKey={key} label={label} lists={lists} /></section>)}</div>
    </>
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
  const [att, setAtt] = useState({ title: '', url: '' });
  const [kp, setKp] = useState({ key: '', value: '' });
  useEffect(() => { const k = (e) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const set = (k) => (e) => setT({ ...t, [k]: e.target.value });
  const opts = (list, cur) => (cur && !list.includes(cur) ? [cur, ...list] : list);
  const submit = (e) => {
    e.preventDefault();
    if (!t.title.trim()) return;
    const [h, m] = time ? time.split(':').map(Number) : [0, 0];
    const due = date ? new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h, m) : null;
    const next = { ...t, title: t.title.trim(), due, hasTime: !!(date && time) };
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
  const manager = managing && (
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
        <div className="sheet-head"><h2>{isNew ? 'New entry' : 'Edit entry'}</h2><button type="button" className="btn ghost" onClick={onClose} aria-label="Close">✕</button></div>
        <label className="field full">Task description<textarea rows={2} value={t.title} onChange={set('title')} autoFocus placeholder="What needs doing?" /></label>
        <div className="fields">
          {pick('categories', 'Category', 'category', true)}
          {pick('priorities', 'Priority', 'priority')}
          {pick('statuses', 'Status', 'status')}
          {pick('pendingWith', 'Pending with', 'pendingWith', true)}
        </div>
        {manager}
        <div className="fields">
          <label className="field">Due date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field">Due time<input type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={!date} /></label>
          <label className="field">Repeats<select value={t.recurrence} onChange={set('recurrence')}>{opts(RECURRENCES, t.recurrence).map((x) => <option key={x}>{x}</option>)}</select></label>
          {t.recurrence === 'Custom' && <label className="field">Every (minutes)<input type="number" min="1" value={t.recurrenceEveryMin || ''} onChange={(e) => setT({ ...t, recurrenceEveryMin: Number(e.target.value) || null })} /></label>}
          <div className="field">Alert on the phone
            <div className="seg" role="group" aria-label="Alert on the phone">
              {[['', 'Default'], ['alarm', 'Alarm'], ['gentle', 'Reminder']].map(([v, l]) => <button type="button" key={v} className={t.alertMode === v ? 'on' : ''} onClick={() => setT({ ...t, alertMode: v })}>{l}</button>)}
            </div>
          </div>
          <label className="field check"><input type="checkbox" checked={t.dar} onChange={(e) => setT({ ...t, dar: e.target.checked })} /> Include in the daily report when done (DAR)</label>
        </div>
        {repeatsEvery && <p className="muted">Hourly and custom repeats are set here but are repeated by the phone app, not by this site.</p>}
        <label className="field full">Mail chain<input value={t.reference} onChange={set('reference')} placeholder="Paste or type the mail subject" /></label>
        <label className="field full">Notes<textarea rows={4} value={t.notes} onChange={set('notes')} /></label>

        <div className="field full">Checklist{t.checklist.length > 0 && <span className="muted"> ({t.checklist.filter((c) => c.done).length}/{t.checklist.length} done)</span>}
          {t.checklist.map((c) => (
            <div key={c.id} className="row">
              <label className="check-row"><input type="checkbox" checked={c.done} onChange={() => setT({ ...t, checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })} /><span className={c.done ? 'struck' : ''}>{c.text}</span></label>
              <button type="button" className="btn ghost" onClick={() => setT({ ...t, checklist: t.checklist.filter((x) => x.id !== c.id) })} aria-label={`Remove ${c.text}`}>✕</button>
            </div>
          ))}
          <div className="add-row"><input value={step} onChange={(e) => setStep(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStepNow(); } }} placeholder="Add a step..." /><button type="button" className="btn" onClick={addStepNow} disabled={!step.trim()}>Add</button></div>
        </div>

        <div className="field full">Attachment links (invoice, bank advice, Drive file...)
          {t.attachments.map((a) => (
            <div key={a.id} className="row"><a href={a.url} target="_blank" rel="noopener noreferrer" className="attach">{a.title}</a><button type="button" className="btn ghost" onClick={() => setT({ ...t, attachments: t.attachments.filter((x) => x.id !== a.id) })} aria-label={`Remove ${a.title}`}>✕</button></div>
          ))}
          <div className="add-row"><input value={att.title} onChange={(e) => setAtt({ ...att, title: e.target.value })} placeholder="Title (optional)" /><input value={att.url} onChange={(e) => setAtt({ ...att, url: e.target.value })} placeholder="https://..." /><button type="button" className="btn" onClick={addAtt} disabled={!att.url.trim()}>Add</button></div>
        </div>

        <div className="field full">Key points (go into the daily report line)
          {t.keyPoints.map((k, i) => (
            <div key={i} className="row"><span className="kp"><b>{k.key}</b>{k.key && k.value ? ': ' : ''}{k.value}</span><button type="button" className="btn ghost" onClick={() => setT({ ...t, keyPoints: t.keyPoints.filter((_, n) => n !== i) })} aria-label="Remove key point">✕</button></div>
          ))}
          <div className="add-row"><input value={kp.key} onChange={(e) => setKp({ ...kp, key: e.target.value })} placeholder="Label (e.g. Invoice no.)" /><input value={kp.value} onChange={(e) => setKp({ ...kp, value: e.target.value })} placeholder="Value" /><button type="button" className="btn" onClick={addKp} disabled={!kp.key.trim() && !kp.value.trim()}>Add</button></div>
        </div>

        <div className="sheet-foot">
          {!isNew && !t.binned && <button type="button" className="btn danger" onClick={() => { actions.bin(t); onClose(); }}>Move to bin</button>}
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!t.title.trim()}>Save</button>
        </div>
      </form>
    </div>
  );
}
