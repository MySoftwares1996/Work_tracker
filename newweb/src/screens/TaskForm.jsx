import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ClockPicker from '../ClockPicker';
import Icon from '../icons';
import { copyText } from '../clipboard';
import { useStore } from '../store';
import { finalNarration } from '../reportFormats';
import { monthEndOptions } from '../../../src/monthEnd.js';
import { isOffDay, templateFrom, applyTemplate, saveTemplate, categoryAsksReminder, reminderFrom, toggleReminderCategory, categoryCarriesSubCategory, subCategoriesFor, findSubCategory, subCategoryMissing, RECURRENCES, DONE_STATUS, dayKey, pad, newId, timeLabel } from '../data';
import { loadDraft, saveDraft, clearDraft, withDraft } from '../entryDraft';
import { LIST_META, ListManager, SubCategoryManager } from './Lists';

const toInputDate = (d) => (d ? dayKey(d) : '');

const toInputTime = (t) => (t.due && t.hasTime ? `${pad(t.due.getHours())}:${pad(t.due.getMinutes())}` : '');

/** Config > Alerts: pop up a due alert, play a sound, and show a desktop notification when this tab is in the background. */
/** "Final Narration": the narration of the task's report line (after the dash), for tasks in a Payments category whose Sub Category has a report format. Read-only; follows the fields as they are typed. */
function NarrationBox({ t }) {
  const { reportFormats, notify } = useStore();
  const [open, setOpen] = useState(false);
  const n = finalNarration(t, reportFormats);
  if (!n) return null;
  const copy = async () => { notify((await copyText(n.text)) ? 'Narration copied' : 'Could not copy the narration'); };
  return (
    <>
      <span className="pair narr-btn">
        <button type="button" className="pill-btn o" onClick={() => setOpen(true)}><Icon name="chat" />Final Narration{n.missing.length > 0 ? <b>{n.missing.length} to fill</b> : null}</button>
        <button type="button" className="mini" onClick={copy} aria-label="Copy the final narration">Copy</button>
      </span>
      {open && (
        <Popup title="Final Narration" sub="The narration of this task's report line" onClose={() => setOpen(false)}
          foot={<><button type="button" className="btn" onClick={copy}>Copy</button><button type="button" className="btn primary" onClick={() => setOpen(false)}>Done</button></>}>
          <div className="narration"><p>{n.text}</p>{n.missing.length > 0 && <small className="muted">Still to fill: {n.missing.join(', ')}</small>}</div>
        </Popup>
      )}
    </>
  );
}

/** A popup over the form: anything that adds or edits options opens here, so the form itself never grows. */
function Popup({ title, sub, onClose, children, foot }) {
  // Keyboard: focus moves into the popup, Tab stays inside it, and focus goes back to where it was when it closes.
  const box = useRef(null);
  useEffect(() => {
    const before = document.activeElement;
    const items = () => [...(box.current ? box.current.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') : [])].filter((x) => !x.disabled && x.offsetParent !== null);
    const first = items().find((x) => x.tagName !== 'BUTTON' || !x.classList.contains('ghost'));
    if (first && !box.current.contains(document.activeElement)) first.focus();
    const trap = (e) => {
      if (e.key !== 'Tab') return;
      const list = items();
      if (!list.length) return;
      const a = list[0]; const z = list[list.length - 1];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    const el = box.current;
    el && el.addEventListener('keydown', trap);
    return () => { el && el.removeEventListener('keydown', trap); if (before && before.focus && document.contains(before)) before.focus(); };
  }, []);
  return (
    <div ref={box} className="sub-pop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={title}>
      <div className="sub-card">
        <div className="sub-head"><span><b>{title}</b>{sub && <small>{sub}</small>}</span><button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={18} /></button></div>
        {children}
        <div className="sub-foot">{foot || <button type="button" className="btn primary" onClick={onClose}>Done</button>}</div>
      </div>
    </div>
  );
}

/** A text box that starts as one line and grows as lines are added (Task description, Notes). */
function AutoText({ value, ...rest }) {
  const ref = useRef(null);
  useLayoutEffect(() => { const el = ref.current; if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; } }, [value]);
  return <textarea ref={ref} className="auto" rows={1} value={value} {...rest} />;
}

export default function TaskForm({ initial, onClose }) {
  const { tasks, lists, actions } = useStore();
  const isNew = !tasks.some((t) => t.id === initial.id);
  // A blank New entry gets back what was typed last time (refresh, closed tab or closed form); "Reset" clears it.
  const draftOn = isNew && !initial.title;
  const [draft0] = useState(() => (draftOn ? loadDraft() : null));
  const [t, setT] = useState(() => withDraft(initial, draft0));
  const [date, setDate] = useState(draft0 ? draft0.date || '' : toInputDate(initial.due));
  const [time, setTime] = useState(draft0 ? draft0.time || '' : toInputTime(initial));
  const [managing, setManaging] = useState('');       // the list whose options are being added / deleted
  const [step, setStep] = useState('');
  const [clockOpen, setClockOpen] = useState(false);
  const [remDate, setRemDate] = useState(draft0 ? draft0.remDate || '' : initial.nextReminder ? dayKey(initial.nextReminder) : '');
  const [remTime, setRemTime] = useState(draft0 ? draft0.remTime || '' : initial.nextReminder ? `${pad(initial.nextReminder.getHours())}:${pad(initial.nextReminder.getMinutes())}` : '');
  const [remClock, setRemClock] = useState(false);
  const { saveLists, templates, saveTemplates, notify, calendar } = useStore();
  useEffect(() => { if (draftOn) saveDraft(initial, t, { date, time, remDate, remTime }); }, [draftOn, initial, t, date, time, remDate, remTime]);
  const reset = () => { setT(initial); setDate(toInputDate(initial.due)); setTime(toInputTime(initial)); setRemDate(''); setRemTime(''); setStep(''); clearDraft(); notify('Form reset'); };
  const monthEnd = useMemo(() => monthEndOptions(new Date(), (k) => isOffDay(k, calendar), 5), [calendar]);
  const [tplName, setTplName] = useState(null);      // null = closed; a string = naming the template being saved
  // Escape and a click on the backdrop close only the topmost popup; the form itself closes when none is open.
  const popups = useRef({});
  const anyPopup = () => { const p = popups.current; return !!(p.remClock || p.clockOpen || p.subOpen || p.managing || p.remOpen || p.stepsOpen || p.mailOpen || p.tplName !== null); };
  const closeTopPopup = () => {
    const p = popups.current;
    if (p.remClock || p.clockOpen) return;          // a clock closes itself on Escape
    if (p.subOpen) closeSubRef.current(true);
    else if (p.mailOpen) setMailOpen(false);
    else if (p.stepsOpen) setStepsOpen(false);
    else if (p.remOpen) setRemOpen(false);
    else if (p.managing) setManaging('');
    else if (p.tplName !== null) setTplName(null);
  };
  const closeSubRef = useRef(() => {});
  useEffect(() => { const k = (e) => { if (e.key !== 'Escape') return; if (anyPopup()) closeTopPopup(); else onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  const set = (k) => (e) => {
    const v = e.target.value;
    if (k === 'category' && t.subCategory && !subCategoriesFor(lists, v).some((x) => x.name === t.subCategory)) setT({ ...t, category: v, subCategory: '', subCategoryFields: {} });
    else setT({ ...t, [k]: v });
  };
  const opts = (list, cur) => (cur && !list.includes(cur) ? [cur, ...list] : list);
  const submit = (e) => {
    e.preventDefault();
    if (!t.title.trim()) return;
    if (/^completed$/i.test(t.status)) { const msg = subCategoryMissing(t, lists); if (msg) { setSubError(msg); if (sc && sc.fields.length) openSub(); return; } }
    setSubError('');
    const [h, m] = time ? time.split(':').map(Number) : [0, 0];
    const due = date ? new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), h, m) : null;
    const next = { ...t, title: t.title.trim(), due, hasTime: !!(date && time), nextReminder: reminderFrom(remDate, remTime) };
    if (/^completed$/i.test(t.status) && !t.done) actions.complete(next, t.dar);
    else if (t.done && !DONE_STATUS.test(t.status)) actions.save({ ...next, done: false, completedAt: null });     // status moved away from Completed: reopen it
    else actions.save(next);
    if (draftOn) clearDraft();
    onClose();
  };
  // A select with its own "Edit" link: add or delete the options right here.
  const pick = (key, label, field, blank) => (
    <div className="field">
      <span className="field-head">{label}<button type="button" className="mini" onClick={() => setManaging(managing === key ? '' : key)}>{managing === key ? 'Done' : '+ / − Edit'}</button></span>
      <select value={t[field]} onChange={set(field)} aria-label={label}>{blank && <option value="">-</option>}{opts(lists[key], t[field]).map((x) => <option key={x}>{x}</option>)}</select>
    </div>
  );
  const priClass = (x) => ({ high: 'hi', medium: 'med', low: 'low' })[String(x).toLowerCase()] || '';
  const prioritySeg = (
    <div className="field">
      <span className="field-head">Priority<button type="button" className="mini" onClick={() => setManaging(managing === 'priorities' ? '' : 'priorities')}>{managing === 'priorities' ? 'Done' : '+ / − Edit'}</button></span>
      <div className="prio" role="group" aria-label="Priority">
        {opts(lists.priorities, t.priority).map((x) => <button type="button" key={x} className={`${t.priority === x ? 'on ' : ''}${priClass(x)}`} aria-pressed={t.priority === x} onClick={() => setT({ ...t, priority: x })}>{x}</button>)}
      </div>
    </div>
  );
  const subs = subCategoriesFor(lists, t.category);
  const sc = findSubCategory(lists, t.subCategory);
  const needSub = categoryCarriesSubCategory(lists, t.category);
  const [subError, setSubError] = useState('');
  // The Sub Category's fields open in a popup (the form does not grow): when one is picked, by the button, or when Completed is refused for missing fields.
  const [subOpen, setSubOpen] = useState(false);
  const [remOpen, setRemOpen] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const [mailOpen, setMailOpen] = useState(false);
  const subSnap = useRef({});
  const openSub = () => { subSnap.current = t.subCategoryFields || {}; setSubOpen(true); };
  const closeSub = (cancel) => { if (cancel) setT((d) => ({ ...d, subCategoryFields: subSnap.current })); setSubOpen(false); setSubError(''); };
  closeSubRef.current = closeSub;
  popups.current = { remClock, clockOpen, subOpen: subOpen && !!sc, managing, remOpen, stepsOpen, mailOpen, tplName };
  const subFilled = sc ? sc.fields.filter((f) => String((t.subCategoryFields || {})[f.label] || '').trim()).length : 0;
  const subBlock = (
    <div className="sub-panel">
      <div className="field-head"><span className="field" title={needSub ? 'Needed to mark Completed' : undefined}>Sub category{needSub ? ' *' : ''}</span><button type="button" className="mini" onClick={() => setManaging(managing === 'sub' ? '' : 'sub')}>{managing === 'sub' ? 'Done' : '+ / − Edit'}</button></div>
      {managing === 'sub' && <Popup title={`Sub categories${t.category ? ` under ${t.category}` : ''}`} onClose={() => setManaging('')}><SubCategoryManager lists={lists} only={t.category} /></Popup>}
      {(
        <>
          <select value={t.subCategory} onChange={(e) => { const v = e.target.value; setT({ ...t, subCategory: v, subCategoryFields: v === t.subCategory ? t.subCategoryFields : {} }); const nx = findSubCategory(lists, v); if (v && v !== t.subCategory && nx && nx.fields.length) { subSnap.current = {}; setSubOpen(true); } }} aria-label="Sub category" disabled={!t.category && !t.subCategory}>
            <option value="">{t.category ? '-' : 'Choose a Category first'}</option>{(t.subCategory && !subs.some((x) => x.name === t.subCategory) ? [{ name: t.subCategory }, ...subs] : subs).map((x) => <option key={x.name}>{x.name}</option>)}
          </select>
          {sc && sc.fields.length > 0 && (
            <button type="button" className="pill-btn sub-btn" onClick={openSub}><Icon name="list" />Sub category details<b>{subFilled} of {sc.fields.length} filled</b></button>
          )}
          {t.category && !subs.length && <p className="muted">No Sub Categories under {t.category} yet. Use + / − Edit to add them.</p>}
        </>
      )}
    </div>
  );
  const manager = managing && managing !== 'sub' && (
    <Popup title={LIST_META.find(([k]) => k === managing)[1]} sub="Add or delete the options" onClose={() => setManaging('')}>
      <ListManager listKey={managing} label={LIST_META.find(([k]) => k === managing)[1]} lists={lists} onAdd={(v) => setT((d) => ({ ...d, [{ categories: 'category', priorities: 'priority', statuses: 'status', pendingWith: 'pendingWith' }[managing]]: v }))} />
    </Popup>
  );
  const addStepNow = () => { if (step.trim()) { setT({ ...t, checklist: [...t.checklist, { id: newId(), text: step.trim(), done: false }] }); setStep(''); } };
  const repeatsEvery = t.recurrence === 'Hourly' || t.recurrence === 'Custom';
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && !anyPopup() && onClose()}>
      <form className="sheet wide" onSubmit={submit} onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.closest('.sub-pop')) e.preventDefault();
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); if (!anyPopup() && !e.currentTarget.querySelector('.sub-pop')) e.currentTarget.requestSubmit(); }
      }} role="dialog" aria-modal="true" aria-label={isNew ? 'New entry' : 'Edit entry'}>
        <div className="sheet-head">
          <div><h2>{isNew ? 'New entry' : 'Edit entry'}</h2><p className="sub">Press Ctrl + Enter to save</p></div>
          <span className="tpl-head">
            <span className="alert-icons" role="group" aria-label="Alert at the due time">
              {[['', 'bell', 'Alert at the due time: default'], ['alarm', 'alarm', 'Alert at the due time: Alarm (pop-up + sound)'], ['gentle', 'bellOff', 'Alert at the due time: Reminder (notification only)']].map(([v, ico, tip]) => <button type="button" key={v} className={`ai${t.alertMode === v ? ' on' : ''}`} title={tip} aria-label={tip} aria-pressed={t.alertMode === v} onClick={() => setT({ ...t, alertMode: v })}><Icon name={ico} size={18} /></button>)}
            </span>
            {tplName === null
              ? <button type="button" className="btn" onClick={() => setTplName(t.title.trim())} title="Keep this entry's usual fields to start new entries from">Save as template</button>
              : <span className="tpl-save"><input autoFocus value={tplName} onChange={(e) => setTplName(e.target.value)} placeholder="Template name" aria-label="Template name" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); document.getElementById('tpl-ok')?.click(); } }} />
                <button type="button" id="tpl-ok" className="btn primary" onClick={() => { saveTemplates(saveTemplate(templates, templateFrom(t, tplName || t.title))); notify(`Template saved: ${tplName || t.title || 'Template'}`); setTplName(null); }}>Save</button>
                <button type="button" className="btn ghost" onClick={() => setTplName(null)}>Cancel</button></span>}
            <button type="button" className="x-btn" onClick={onClose} aria-label="Close"><Icon name="x" size={20} /></button>
          </span>
        </div>
        <div className="form-body">
          {isNew && templates.length > 0 && (
            <div className="tpl-row"><span className="tpl-label">Start from a template</span>
              {templates.map((tp) => (
                <span key={tp.id} className="tpl-chip"><button type="button" onClick={() => setT((cur) => applyTemplate(cur, tp))} title="Fill the form from this template">{tp.name}</button><button type="button" className="tpl-x" aria-label={`Delete template ${tp.name}`} onClick={() => saveTemplates(templates.filter((x) => x.id !== tp.id))}><Icon name="x" size={12} /></button></span>
              ))}
            </div>
          )}
          <div className="cols3">
            <div className="col fcard">
              <h3 className="fcard-title">WHAT</h3>
              <label className="field full">Task description<AutoText value={t.title} onChange={set('title')} autoFocus placeholder="What needs doing?" /></label>
              <div className="two-f">{pick('categories', 'Category', 'category', true)}{pick('statuses', 'Status', 'status')}</div>
              {prioritySeg}
              {subBlock}
              {manager}
            </div>
            <div className="col fcard">
              <h3 className="fcard-title">WHEN</h3>
              <div className="two-f">
                <label className="field">Due date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
                <div className="field">Due time
                  <button type="button" className="time-btn" onClick={() => setClockOpen(true)} disabled={!date} aria-label="Pick the due time on a clock">
                    <span>{timeLabel(time) || (date ? 'Set time' : 'Pick a date first')}</span>
                    <Icon name="clock" size={16} />
                  </button>
                </div>
              </div>
              <div className="two-f">
                <label className="field">Month end
                  <select value={monthEnd.some((m) => m.key === date) && !time ? date : ''} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setTime(''); } }} aria-label="Month end: the last working days of the month" title="The last working days of the month (not Sundays, holidays or leave days). A date alone alerts once, at 7 PM that day.">
                    <option value="">Month end ...</option>{monthEnd.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                  </select>
                </label>
                <label className="field">Repeats<select value={t.recurrence} onChange={set('recurrence')}>{opts(RECURRENCES, t.recurrence).map((x) => <option key={x}>{x}</option>)}</select></label>
              </div>
              {t.recurrence === 'Custom' && <label className="field">Every (minutes)<input type="number" min="1" value={t.recurrenceEveryMin || ''} onChange={(e) => setT({ ...t, recurrenceEveryMin: Number(e.target.value) || null })} /></label>}
              {repeatsEvery && <p className="muted">Hourly and custom repeats are set here but are repeated by the phone app, not by this site.</p>}
              {t.category && (
                <button type="button" className="pill-btn o rem-btn" onClick={() => setRemOpen(true)} title="Next reminder date and time"><Icon name="clock" />{remDate ? `Next reminder: ${remDate}${remTime ? ' ' + timeLabel(remTime) : ''}` : 'Next reminder'}</button>
              )}
              <button type="button" className="pill-btn o check-btn" onClick={() => setStepsOpen(true)}><Icon name="checklist" />Checklist{t.checklist.length > 0 ? <b>{t.checklist.filter((c) => c.done).length}/{t.checklist.length} done</b> : null}</button>
              {remOpen && (
                <Popup title="Next reminder" sub="9:00 AM if no time" onClose={() => setRemOpen(false)}>
                  {t.category && (
                    <label className="field check"><input type="checkbox" checked={categoryAsksReminder(lists, t.category)} onChange={() => saveLists(toggleReminderCategory(lists, t.category))} /> Ask for a next reminder date &amp; time under {t.category}</label>
                  )}
                  <div className="fields">
                    <label className="field">Date<input type="date" value={remDate} onChange={(e) => setRemDate(e.target.value)} /></label>
                    <div className="field">Time
                      <button type="button" className="time-btn" onClick={() => setRemClock(true)} disabled={!remDate} aria-label="Pick the reminder time on a clock">
                        <span>{timeLabel(remTime) || (remDate ? 'Set time' : 'Pick a date first')}</span>
                        <Icon name="clock" size={16} />
                      </button>
                    </div>
                    {remDate && <div className="field">&nbsp;<button type="button" className="btn ghost" onClick={() => { setRemDate(''); setRemTime(''); }}>Clear reminder</button></div>}
                  </div>
                </Popup>
              )}
            </div>
            <div className="col fcard">
              <h3 className="fcard-title">WHO &amp; NOTES</h3>
              {pick('pendingWith', 'Pending with', 'pendingWith', true)}
              <label className="field full">Notes<AutoText value={t.notes} onChange={set('notes')} placeholder="Add notes" /></label>
              <span className="pair">
                <button type="button" className="pill-btn o" onClick={() => setMailOpen(true)}><Icon name="mail" />Mail chain{t.reference.trim() ? <b>added</b> : null}</button>
                <button type="button" className="mini" disabled={!t.reference.trim()} aria-label="Copy the mail chain" onClick={async () => { notify((await copyText(t.reference)) ? 'Mail chain copied' : 'Could not copy the mail chain'); }}>Copy</button>
              </span>
              <NarrationBox t={t} />
              <label className="field check"><input type="checkbox" checked={t.dar} onChange={(e) => setT({ ...t, dar: e.target.checked })} /> Include in the daily report when done (DAR)</label>
              {stepsOpen && (
                <Popup title="Checklist" sub="Steps to tick before the task is done" onClose={() => setStepsOpen(false)}>
                  {t.checklist.map((c) => (
                    <div key={c.id} className="row">
                      <label className="check-row"><input type="checkbox" checked={c.done} onChange={() => setT({ ...t, checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })} /><span className={c.done ? 'struck' : ''}>{c.text}</span></label>
                      <button type="button" className="icon-btn" onClick={() => setT({ ...t, checklist: t.checklist.filter((x) => x.id !== c.id) })} aria-label={`Remove ${c.text}`}><Icon name="x" size={16} /></button>
                    </div>
                  ))}
                  <div className="add-row"><input value={step} onChange={(e) => setStep(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStepNow(); } }} placeholder="Add a step..." /><button type="button" className="btn" onClick={addStepNow} disabled={!step.trim()}>Add</button></div>
                </Popup>
              )}
              {mailOpen && (
                <Popup title="Mail chain" sub="The mail subject this task came from" onClose={() => setMailOpen(false)}>
                  <div className="field full">
                    <span className="field-head">Mail chain<button type="button" className="mini" disabled={!t.reference.trim()} onClick={async () => { notify((await copyText(t.reference)) ? 'Mail chain copied' : 'Could not copy the mail chain'); }}>Copy</button></span>
                    <input value={t.reference} onChange={set('reference')} placeholder="Paste or type the mail subject" aria-label="Mail chain" autoFocus />
                  </div>
                </Popup>
              )}
            </div>
          </div>
          {subError && <div className="banner err" role="alert">{subError}</div>}
        </div>
        <div className="sheet-foot">
          {!isNew && !t.binned && <button type="button" className="btn danger" onClick={() => { actions.bin(t); onClose(); }}>Move to bin</button>}
          {isNew && <button type="button" className="btn ghost" onClick={reset} title="Clear everything typed in this form">Reset</button>}
          <span className="grow" />
          <button type="button" className="btn soft big" onClick={onClose}>Cancel</button>
          <button className="btn primary big" disabled={!t.title.trim()}>Save entry</button>
        </div>
        {subOpen && sc && (
          <div className="sub-pop" onMouseDown={(e) => e.target === e.currentTarget && closeSub(true)} role="dialog" aria-modal="true" aria-label="Sub category details">
            <div className="sub-card">
              <div className="sub-head"><span><b>{sc.name}</b><small>Sub category details</small></span><button type="button" className="icon-btn" onClick={() => closeSub(true)} aria-label="Close"><Icon name="x" size={18} /></button></div>
              <div className="fields sub-fields">{sc.fields.map((f) => (
                <label className={`field${/^completed$/i.test(t.status) && !String((t.subCategoryFields || {})[f.label] || '').trim() ? ' need' : ''}`} key={f.label}><span className="flabel">{f.label}{/^completed$/i.test(t.status) && <span className="req"> *</span>}</span>
                  {f.options && f.options.length ? <select value={(t.subCategoryFields || {})[f.label] || ''} onChange={(e) => setT({ ...t, subCategoryFields: { ...t.subCategoryFields, [f.label]: e.target.value } })}><option value="">-</option>{f.options.map((o) => <option key={o}>{o}</option>)}</select>
                    : <input value={(t.subCategoryFields || {})[f.label] || ''} onChange={(e) => setT({ ...t, subCategoryFields: { ...t.subCategoryFields, [f.label]: e.target.value } })} />}
                </label>
              ))}</div>
              {subError && <p className="banner err" role="alert">{subError}</p>}
              <div className="sub-foot"><button type="button" className="btn" onClick={() => closeSub(true)}>Cancel</button><button type="button" className="btn primary" onClick={() => closeSub(false)}>Done</button></div>
            </div>
          </div>
        )}
      </form>
      {remClock && <ClockPicker value={remTime} onPick={(v) => { setRemTime(v); setRemClock(false); }} onClear={() => { setRemTime(''); setRemClock(false); }} onClose={() => setRemClock(false)} />}
      {clockOpen && <ClockPicker value={time} onPick={(v) => { setTime(v); setClockOpen(false); }} onClear={() => { setTime(''); setClockOpen(false); }} onClose={() => setClockOpen(false)} />}
    </div>
  );
}
