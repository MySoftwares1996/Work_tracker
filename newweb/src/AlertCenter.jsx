import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from './store';
import Logo from './Logo';
import ClockPicker from './ClockPicker';
import { SNOOZES, isBankFollowUp, addFollowUp, subCategoryMissing, findSubCategory, subCategoriesFor, alertHeading, categoryAsksReminder, dayKey, moveTask, pad, pendingAlerts, upcomingWarnings, dueResponse, reminderFrom, timeLabel, RECURRENCES, dueLabel, DONE_STATUS } from './data';
import { finalNarration } from './reportFormats';
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
  const { tasks, lists, actions, notify } = useStore();
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
    const quiet = (a, text) => {
      handled.current.set(a.key, Date.now()); saveHandled(handled.current);
      if (notify) notify(`${text}: ${a.task.title}`);
      showNotification(text, a.task.title);
    };
    const check = () => {
      const now = new Date();
      const seen = new Set(handled.current.keys());
      // One hour before the due time: a notification only, about the coming task.
      upcomingWarnings(tasksRef.current, now, seen).forEach((a) => quiet(a, `Due in ${Math.max(1, Math.ceil((a.task.due - now) / 60000))} min`));
      // At the due time: what happens follows the task's own choice (Alarm rings with a pop-up, Reminder is a notification only).
      const have = new Set(queueRef.current.map((a) => a.key));
      const fresh = pendingAlerts(tasksRef.current, now, seen).filter((a) => !have.has(a.key));
      const popups = [];
      let ring = false;
      fresh.forEach((a) => {
        const r = dueResponse(a.task, settings);
        if (r.popup) { popups.push(a); ring = ring || r.sound; } else quiet(a, alertHeading(a));
      });
      if (!popups.length) return;
      setQueue((q) => [...q, ...popups]);
      if (ring) playAlertSound();
      if (settings.notify && document.hidden) showNotification(alertHeading(popups[0]), popups[0].task.title);
    };
    check();
    const id = setInterval(check, 10000);
    return () => clearInterval(id);
  }, [settings, tasks, notify]);

  // The shown alert uses the task as it is now; one that was completed or binned elsewhere drops out.
  // An alert goes away when the task changes anywhere (another computer, the phone): done, binned, moved to a later date or time, snoozed,
  // silenced or skipped today. It is judged again with the same rules that raised it.
  const live = useMemo(() => queue
    .map((a) => (a.test ? a : { ...a, task: tasks.find((t) => t.id === a.task.id) }))
    .filter((a) => a.test || (a.task && !a.task.done && !a.task.binned && pendingAlerts([a.task], new Date(), new Set()).some((x) => x.kind === a.kind))), [queue, tasks]);
  const current = live[0];

  useEffect(() => {
    const base = document.title.replace(/^⏰ .*? - /, '');
    document.title = current ? `⏰ Due now - ${base}` : base;
    return () => { document.title = base; };
  }, [current]);

  if (!current) return null;
  const finish = (a) => { handled.current.set(a.key, Date.now()); saveHandled(handled.current); setQueue((q) => q.filter((x) => x.key !== a.key)); };
  return <AlertCard key={current.key} a={current} count={live.length} lists={lists} actions={actions} finish={finish} onOpen={onOpen} notify={notify} />;
}

/** The Final Narration inside the alert's Reply tab (Payments categories with a report format). */
function AlertNarration({ t }) {
  const { reportFormats } = useStore();
  const n = finalNarration(t, reportFormats);
  if (!n) return null;
  return <div className="narration"><b>Final Narration:</b><p>{n.text}</p>{n.missing.length > 0 && <small className="muted">Still to fill: {n.missing.join(', ')}</small>}</div>;
}

function AlertCard({ a, count, lists, actions, finish, onOpen, notify }) {
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
  // The task's Sub Category fields (the Banker's Reply among them) can be typed here; they are saved with whatever the alert does.
  const [sub, setSub] = useState(t.subCategory || '');
  const [sf, setSf] = useState(() => ({ ...(t.subCategoryFields || {}) }));
  const subList = subCategoriesFor(lists, t.category);
  const sc = findSubCategory(lists, sub);
  const withSub = (x) => (sub ? { ...x, subCategory: sub, subCategoryFields: sf } : x);
  // A bank follow-up: what is typed as remarks, or as the Banker's reply, is kept as today's follow-up (the Daily report writes from it).
  const bankReply = (() => {
    if (!sc) return '';
    const f = sc.fields.find((x) => /banker|reply|update/i.test(x.label));
    const now = f ? String(sf[f.label] || '').trim() : '';
    return f && now && now !== String((t.subCategoryFields || {})[f.label] || '').trim() ? now : '';
  })();
  const withFollowUp = (x, next) => (isBankFollowUp(t.category) && (remarks.trim() || bankReply) ? addFollowUp(x, { remarks: remarks.trim() || bankReply, next }) : x);
  const saveReply = () => { if (!a.test) actions.save(withFollowUp(withSub(t))); if (notify) notify('Saved'); };
  useEffect(() => { const k = (e) => { if (e.key === 'Escape' && !clock) finish(a); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [a, finish, clock]);

  const save = (patch) => { if (!a.test) actions.save(withRemark(withFollowUp(withSub({ ...t, ...patch }), patch.nextReminder), remarks)); finish(a); };
  const [subErr, setSubErr] = useState('');
  // Completing needs every Sub Category field filled; the fields are right here in the alert.
  const needsFields = (x) => { const m = a.test ? '' : subCategoryMissing(x, lists); setSubErr(m); return !!m; };
  const done = (dar) => { if (needsFields(withSub(t))) return; if (!a.test) actions.complete(withRemark(withFollowUp(withSub(t)), remarks), dar); finish(a); };
  const setReminder = () => {
    const when = reminderFrom(rDate, rTime);
    if (!when || when.getTime() <= Date.now()) { setRError('Pick a date and time in the future.'); return; }
    save({ nextReminder: when });
  };
  const skip = () => (a.kind === 'reminder' ? save({ nextReminder: null }) : save({ skippedDates: [...(t.skippedDates || []), today] }));
  const move = () => {
    if (DONE_STATUS.test(status)) {      // "Completed" in the Move tab completes the task (work log, next repeat), as the Done button does
      if (needsFields(withSub(t))) return;
      if (!a.test) actions.complete(withRemark(withFollowUp(withSub(t)), remarks), t.dar);
      finish(a);
      return;
    }
    if (!a.test) actions.save(withRemark(withFollowUp(withSub(moveTask(t, date, time, status, repeat))), remarks));
    finish(a);
  };
  // Wide and short: the choices sit in tabs beside the task, and the main buttons stay in a bar along the bottom.
  const hasReply = !!(sc || (subList.length > 0 && !t.subCategory));
  const tabs = [...(hasReply ? [['reply', 'Reply']] : []), ...(asks ? [['reminder', 'Reminder']] : []), ['move', 'Move'], ['snooze', 'Snooze']];
  const [tab, setTab] = useState(() => (hasReply ? 'reply' : asks ? 'reminder' : 'move'));
  const tone = String(t.priority).toLowerCase() === 'high' ? 'high' : String(t.priority).toLowerCase() === 'low' ? 'low' : 'medium';

  return (
    <div className="alert-overlay" role="alertdialog" aria-modal="true" aria-label="Task due now">
      <div className={`alert-card tone-${tone}`}>
        <div className="alert-band">
          <span className="alert-bell" aria-hidden="true"><Logo size={44} /></span>
          <div className="alert-band-text">
            <div className="alert-heading">{alertHeading(a)}</div>
            <div className="alert-meta">{a.test ? 'Test alert' : dueLabel(t)}{count > 1 ? ` · ${count - 1} more waiting` : ''}</div>
          </div>
          <button type="button" className="alert-close" onClick={() => finish(a)} aria-label="Dismiss this alert">✕</button>
        </div>
        <div className="alert-main">
          <div className="alert-left">
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
          </div>
          <div className="alert-right">
            <div className="alert-tabs" role="tablist" aria-label="More choices">
              {tabs.map(([k, label]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} className={`alert-tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>
                  {label}{k === 'reminder' && asks ? <i className="alert-dot" aria-label="asked for" /> : null}
                </button>
              ))}
            </div>
            <div className="alert-panel">
              {tab === 'reply' && (
                <div className="alert-sub">
                  <div className="alert-reminder-head"><b>{sub ? sub : `Sub category under ${t.category}`}</b><span className="muted">Saved with the task and put in the daily report.</span></div>
                  {!t.subCategory && subList.length > 0 && (
                    <select value={sub} onChange={(e) => { setSub(e.target.value); setSf({}); }} aria-label="Sub category"><option value="">Choose a sub category</option>{subList.map((x) => <option key={x.name}>{x.name}</option>)}</select>
                  )}
                  {sc && sc.fields.length > 0 && (
                    <div className="fields">{sc.fields.map((f) => (
                      <label className="field" key={f.label}>{f.label}
                        {f.options && f.options.length
                          ? <select value={sf[f.label] || ''} onChange={(e) => setSf({ ...sf, [f.label]: e.target.value })}><option value="">-</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
                          : <input value={sf[f.label] || ''} onChange={(e) => setSf({ ...sf, [f.label]: e.target.value })} placeholder={f.label} />}
                      </label>
                    ))}</div>
                  )}
                  <AlertNarration t={{ ...t, subCategory: sub, subCategoryFields: sf }} />
                  {subErr && <p className="banner err" role="alert">{subErr}</p>}
                  <div><button type="button" className="btn" onClick={saveReply}>Save {sc && sc.fields.length ? 'these details' : 'sub category'}</button></div>
                </div>
              )}
              {tab === 'reminder' && (
                <div className="alert-reminder">
                  <div className="alert-reminder-head"><b>Next reminder date &amp; time</b><span className="muted">Asked for {t.category} tasks. Your remarks are saved with it.</span></div>
                  <div className="move-row">
                    <input type="date" value={rDate} onChange={(e) => { setRDate(e.target.value); setRError(''); }} aria-label="Next reminder date" />
                    <button type="button" className="time-btn" onClick={() => setRClock(true)} aria-label="Pick the next reminder time on a clock"><span>{timeLabel(rTime) || 'Set time'}</span></button>
                    <button type="button" className="btn primary" onClick={setReminder} disabled={!rDate}>Save &amp; set next reminder</button>
                  </div>
                  {rError && <p className="banner err" role="alert">{rError}</p>}
                </div>
              )}
              {tab === 'move' && (
                <div className="alert-move">
                  <span className="field">Move to</span>
                  <div className="move-row">
                    <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Move to date" />
                    <button type="button" className="time-btn" onClick={() => setClock(true)} aria-label="Pick the new time on a clock"><span>{timeLabel(time) || 'Set time'}</span></button>
                    <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">{(lists.statuses.includes(status) ? lists.statuses : [status, ...lists.statuses]).map((x) => <option key={x}>{x}</option>)}</select>
                    <select value={repeat} onChange={(e) => setRepeat(e.target.value)} aria-label="Repeat">{RECURRENCES.map((x) => <option key={x}>{x}</option>)}</select>
                    <button type="button" className="btn primary" onClick={move} disabled={!date}>Move</button>
                  </div>
                  {subErr && <p className="banner err" role="alert">{subErr}</p>}
                </div>
              )}
              {tab === 'snooze' && (
                <div className="alert-move">
                  <span className="field">Remind me again in</span>
                  <div className="move-row">
                    <select value={snooze} onChange={(e) => setSnooze(Number(e.target.value))} aria-label="Snooze for">{SNOOZES.map(([m, l]) => <option key={m} value={m}>{l}</option>)}</select>
                    <button type="button" className="btn primary" onClick={() => save({ snoozeUntil: Date.now() + snooze * 60000 })}>Snooze</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="alert-actions alert-bar">
          <button type="button" className="btn ok" onClick={() => done(false)}>Mark done</button>
          <button type="button" className="btn ok soft" onClick={() => done(true)}>Done + DAR</button>
          <button type="button" className="btn warn" onClick={() => save({ lastAckDate: today })}>Silence today</button>
          <button type="button" className="btn" onClick={skip}>{a.kind === 'reminder' ? 'Clear reminder' : 'Skip'}</button>
          {!a.test && <button type="button" className="btn ghost" onClick={() => { finish(a); onOpen(t); }}>Open task</button>}
        </div>
      </div>
      {rClock && <ClockPicker value={rTime} onPick={(v) => { setRTime(v); setRClock(false); }} onClear={() => { setRTime(''); setRClock(false); }} onClose={() => setRClock(false)} />}
      {clock && <ClockPicker value={time} onPick={(v) => { setTime(v); setClock(false); }} onClear={() => { setTime(''); setClock(false); }} onClose={() => setClock(false)} />}
    </div>
  );
}
