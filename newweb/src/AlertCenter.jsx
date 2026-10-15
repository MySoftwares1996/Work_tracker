import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './store';
import ClockPicker from './ClockPicker';
import { SNOOZES, alertHeading, categoryAsksReminder, dayKey, moveTask, pad, pendingAlerts, reminderFrom, timeLabel, RECURRENCES, dueLabel } from './data';
import { loadAlertSettings, loadHandled, playAlertSound, saveHandled, showNotification } from './alerts';

const soon = () => { const d = new Date(Date.now() + 15 * 60000); d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0); return d; };
const withRemark = (t, text) => {
  const r = String(text || '').trim();
  return r ? { ...t, notes: `${t.notes ? `${t.notes}\n` : ''}[${new Date().toLocaleDateString([], { day: 'numeric', month: 'short' })}] ${r}` } : t;
};

/**
 * Pops up an alert when a task's due time (or its next reminder) comes while this page is open: the task's details, remarks, Mark done,
 * Done + DAR, Silence today, Skip, Snooze, and Move. Snooze, silence and skip are written with the task, so the phone app stays quiet too.
 */
export default function AlertCenter({ onOpen }) {
  const { tasks, lists, actions } = useStore();
  const [settings, setSettings] = useState(loadAlertSettings);
  const [queue, setQueue] = useState([]);
  const handled = useRef(loadHandled());
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const queueRef = useRef(queue);
  queueRef.current = queue;

  useEffect(() => {
    const reload = () => setSettings(loadAlertSettings());
    const test = () => setQueue((q) => [...q, { key: `test-${Date.now()}`, kind: 'due', at: new Date(), test: true, task: { id: 'test', title: 'Sample task - this is how a due alert looks', priority: 'Medium', category: 'Monthly Activity', pendingWith: 'Self', status: 'Pending', recurrence: RECURRENCES[0], due: new Date(), hasTime: true, notes: '', keyPoints: [] } }]);
    window.addEventListener('wd-alert-settings', reload);
    window.addEventListener('wd-test-alert', test);
    return () => { window.removeEventListener('wd-alert-settings', reload); window.removeEventListener('wd-test-alert', test); };
  }, []);

  useEffect(() => {
    if (!settings.popup) return undefined;
    const check = () => {
      const have = new Set(queueRef.current.map((a) => a.key));
      const fresh = pendingAlerts(tasksRef.current, new Date(), new Set(handled.current.keys())).filter((a) => !have.has(a.key));
      if (!fresh.length) return;
      setQueue((q) => [...q, ...fresh]);
      if (settings.sound) playAlertSound();
      if (settings.notify && document.hidden) showNotification(alertHeading(fresh[0]), fresh[0].task.title);
    };
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, [settings, tasks]);

  // The shown alert uses the task as it is now; one that was completed or binned elsewhere drops out.
  const live = useMemo(() => queue.map((a) => (a.test ? a : { ...a, task: tasks.find((t) => t.id === a.task.id) })).filter((a) => a.test || (a.task && !a.task.done && !a.task.binned)), [queue, tasks]);
  const current = live[0];

  useEffect(() => {
    const base = document.title.replace(/^⏰ .*? - /, '');
    document.title = current ? `⏰ Due now - ${base}` : base;
    return () => { document.title = base; };
  }, [current]);

  if (!current) return null;
  const finish = (a) => { handled.current.set(a.key, Date.now()); saveHandled(handled.current); setQueue((q) => q.filter((x) => x.key !== a.key)); };
  return <AlertCard key={current.key} a={current} count={live.length} lists={lists} actions={actions} finish={finish} onOpen={onOpen} />;
}

function AlertCard({ a, count, lists, actions, finish, onOpen }) {
  const t = a.task;
  const today = dayKey(new Date());
  const [remarks, setRemarks] = useState('');
  const [snooze, setSnooze] = useState(15);
  const start = useMemo(soon, []);
  const [date, setDate] = useState(dayKey(start));
  const [time, setTime] = useState(`${pad(start.getHours())}:${pad(start.getMinutes())}`);
  const [status, setStatus] = useState(t.status);
  const [repeat, setRepeat] = useState(t.recurrence);
  const [clock, setClock] = useState(false);
  // Under the categories that ask for a next reminder date & time (Config), the alert asks for it too.
  const asks = categoryAsksReminder(lists, t.category);
  const [rDate, setRDate] = useState(() => { const n = t.nextReminder && t.nextReminder > new Date() ? t.nextReminder : new Date(Date.now() + 86400000); return dayKey(n); });
  const [rTime, setRTime] = useState(() => (t.nextReminder && t.nextReminder > new Date() ? `${pad(t.nextReminder.getHours())}:${pad(t.nextReminder.getMinutes())}` : '09:00'));
  const [rClock, setRClock] = useState(false);
  const [rError, setRError] = useState('');
  useEffect(() => { const k = (e) => { if (e.key === 'Escape' && !clock) finish(a); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [a, finish, clock]);

  const save = (patch) => { if (!a.test) actions.save(withRemark({ ...t, ...patch }, remarks)); finish(a); };
  const done = (dar) => { if (!a.test) actions.complete(withRemark(t, remarks), dar); finish(a); };
  const setReminder = () => {
    const when = reminderFrom(rDate, rTime);
    if (!when || when.getTime() <= Date.now()) { setRError('Pick a date and time in the future.'); return; }
    save({ nextReminder: when });
  };
  const skip = () => (a.kind === 'reminder' ? save({ nextReminder: null }) : save({ skippedDates: [...(t.skippedDates || []), today] }));
  const move = () => { if (!a.test) actions.save(withRemark(moveTask(t, date, time, status, repeat), remarks)); finish(a); };
  const tone = String(t.priority).toLowerCase() === 'high' ? 'high' : String(t.priority).toLowerCase() === 'low' ? 'low' : 'medium';

  return (
    <div className="alert-overlay" role="alertdialog" aria-modal="true" aria-label="Task due now">
      <div className={`alert-card tone-${tone}`}>
        <div className="alert-band">
          <span className="alert-bell" aria-hidden="true">⏰</span>
          <div className="alert-band-text">
            <div className="alert-heading">{alertHeading(a)}</div>
            <div className="alert-meta">{a.test ? 'Test alert' : dueLabel(t)}{count > 1 ? ` · ${count - 1} more waiting` : ''}</div>
          </div>
          <button type="button" className="alert-close" onClick={() => finish(a)} aria-label="Dismiss this alert">✕</button>
        </div>
        <div className="alert-body">
        <h2 className="alert-title">{t.title}</h2>
        <div className="chips">
          {t.priority && <span className="chip coral">{t.priority}</span>}
          {t.category && <span className="chip violet">{t.category}</span>}
          {t.pendingWith && <span className="chip amber">Pending with: {t.pendingWith}</span>}
          {t.status && <span className="chip">{t.status}</span>}
          {t.recurrence !== RECURRENCES[0] && <span className="chip">↻ {t.recurrence}</span>}
        </div>
        {(t.reference || t.notes) && (
          <div className="alert-notes">
            {t.reference && <p>✉ {t.reference}</p>}
            {t.notes && <p>{t.notes}</p>}
          </div>
        )}
        <input className="alert-remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks / notes for today (optional) — e.g. Nothing to do today" aria-label="Remarks" />
        {asks && (
          <div className="alert-reminder">
            <div className="alert-reminder-head"><b>Next reminder date &amp; time</b><span className="muted">Asked for {t.category} tasks. Your remarks above are saved with it.</span></div>
            <div className="move-row">
              <input type="date" value={rDate} onChange={(e) => { setRDate(e.target.value); setRError(''); }} aria-label="Next reminder date" />
              <button type="button" className="time-btn" onClick={() => setRClock(true)} aria-label="Pick the next reminder time on a clock"><span>{timeLabel(rTime) || 'Set time'}</span></button>
              <button type="button" className="btn primary" onClick={setReminder} disabled={!rDate}>Save &amp; set next reminder</button>
            </div>
            {rError && <p className="banner err" role="alert">{rError}</p>}
          </div>
        )}
        <div className="alert-actions">
          <button type="button" className="btn ok" onClick={() => done(false)}>Mark done</button>
          <button type="button" className="btn ok soft" onClick={() => done(true)}>Done + DAR</button>
          <button type="button" className="btn warn" onClick={() => save({ lastAckDate: today })}>Silence today</button>
          <button type="button" className="btn" onClick={skip}>{a.kind === 'reminder' ? 'Clear reminder' : 'Skip'}</button>
          <span className="snooze"><select value={snooze} onChange={(e) => setSnooze(Number(e.target.value))} aria-label="Snooze for">{SNOOZES.map(([m, l]) => <option key={m} value={m}>{l}</option>)}</select><button type="button" className="btn primary" onClick={() => save({ snoozeUntil: Date.now() + snooze * 60000 })}>Snooze</button></span>
          {!a.test && <button type="button" className="btn ghost" onClick={() => { finish(a); onOpen(t); }}>Open task</button>}
        </div>
        <div className="alert-move">
          <span className="field">Move to</span>
          <div className="move-row">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Move to date" />
            <button type="button" className="time-btn" onClick={() => setClock(true)} aria-label="Pick the new time on a clock"><span>{timeLabel(time) || 'Set time'}</span></button>
            <button type="button" className="btn primary" onClick={move} disabled={!date}>Move</button>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">{(lists.statuses.includes(status) ? lists.statuses : [status, ...lists.statuses]).map((x) => <option key={x}>{x}</option>)}</select>
            <select value={repeat} onChange={(e) => setRepeat(e.target.value)} aria-label="Repeat">{RECURRENCES.map((x) => <option key={x}>{x}</option>)}</select>
          </div>
        </div>
        </div>
      </div>
      {rClock && <ClockPicker value={rTime} onPick={(v) => { setRTime(v); setRClock(false); }} onClear={() => { setRTime(''); setRClock(false); }} onClose={() => setRClock(false)} />}
      {clock && <ClockPicker value={time} onPick={(v) => { setTime(v); setClock(false); }} onClear={() => { setTime(''); setClock(false); }} onClose={() => setClock(false)} />}
    </div>
  );
}
