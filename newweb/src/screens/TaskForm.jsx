import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ClockPicker from '../ClockPicker';
import { copyText } from '../clipboard';
import { useStore } from '../store';
import { finalNarration } from '../reportFormats';
import { monthEndOptions } from '../../../src/monthEnd.js';
import { isOffDay, templateFrom, applyTemplate, saveTemplate, categoryAsksReminder, reminderFrom, toggleReminderCategory, categoryCarriesSubCategory, subCategoriesFor, findSubCategory, subCategoryMissing, RECURRENCES, dayKey, pad, newId, timeLabel } from '../data';
import { LIST_META, ListManager, SubCategoryManager } from './Lists';

const toInputDate = (d) => (d ? dayKey(d) : '');

const toInputTime = (t) => (t.due && t.hasTime ? `${pad(t.due.getHours())}:${pad(t.due.getMinutes())}` : '');

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

/** A popup over the form: anything that adds or edits options opens here, so the form itself never grows. */
function Popup({ title, sub, onClose, children, foot }) {
  return (
    <div className="sub-pop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} role="dialog" aria-modal="true" aria-label={title}>
      <div className="sub-card">
        <div className="sub-head"><span><b>{title}</b>{sub && <small>{sub}</small>}</span><button type="button" className="btn ghost" onClick={onClose} aria-label="Close">✕</button></div>
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
  const [t, setT] = useState(initial);
  const [date, setDate] = useState(toInputDate(initial.due));
  const [time, setTime] = useState(toInputTime(initial));
  const [managing, setManaging] = useState('');       // the list whose options are being added / deleted
  const [step, setStep] = useState('');
  const [clockOpen, setClockOpen] = useState(false);
  const [remDate, setRemDate] = useState(initial.nextReminder ? dayKey(initial.nextReminder) : '');
  const [remTime, setRemTime] = useState(initial.nextReminder ? `${pad(initial.nextReminder.getHours())}:${pad(initial.nextReminder.getMinutes())}` : '');
  const [remClock, setRemClock] = useState(false);
  const { saveLists, templates, saveTemplates, notify, calendar } = useStore();
  const monthEnd = useMemo(() => monthEndOptions(new Date(), (k) => isOffDay(k, calendar), 5), [calendar]);
  const [tplName, setTplName] = useState(null);      // null = closed; a string = naming the template being saved
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
    if (/^completed$/i.test(t.status)) { const msg = subCategoryMissing(t, lists); if (msg) { setSubError(msg); if (sc && sc.fields.length) openSub(); return; } }
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
  // The Sub Category's fields open in a popup (the form does not grow): when one is picked, by the button, or when Completed is refused for missing fields.
  const [subOpen, setSubOpen] = useState(false);
  const [remOpen, setRemOpen] = useState(false);
  const [stepsOpen, setStepsOpen] = useState(false);
  const subSnap = useRef({});
  const openSub = () => { subSnap.current = t.subCategoryFields || {}; setSubOpen(true); };
  const closeSub = (cancel) => { if (cancel) setT((d) => ({ ...d, subCategoryFields: subSnap.current })); setSubOpen(false); setSubError(''); };
  const subFilled = sc ? sc.fields.filter((f) => String((t.subCategoryFields || {})[f.label] || '').trim()).length : 0;
  const subBlock = (
    <div className="manage-panel sub-panel">
      <div className="field-head"><span className="field">Sub category{t.category ? ` under ${t.category}` : ''}{needSub && <span className="muted"> (needed to mark Completed)</span>}</span><button type="button" className="mini" onClick={() => setManaging(managing === 'sub' ? '' : 'sub')}>{managing === 'sub' ? 'Done' : '+ / − Edit'}</button></div>
      {managing === 'sub' && <Popup title={`Sub categories${t.category ? ` under ${t.category}` : ''}`} onClose={() => setManaging('')}><SubCategoryManager lists={lists} only={t.category} /></Popup>}
      {(
        <>
          <select value={t.subCategory} onChange={(e) => { const v = e.target.value; setT({ ...t, subCategory: v, subCategoryFields: v === t.subCategory ? t.subCategoryFields : {} }); const nx = findSubCategory(lists, v); if (v && v !== t.subCategory && nx && nx.fields.length) { subSnap.current = {}; setSubOpen(true); } }} aria-label="Sub category" disabled={!t.category && !t.subCategory}>
            <option value="">{t.category ? '-' : 'Choose a Category first'}</option>{(t.subCategory && !subs.some((x) => x.name === t.subCategory) ? [{ name: t.subCategory }, ...subs] : subs).map((x) => <option key={x.name}>{x.name}</option>)}
          </select>
          {sc && sc.fields.length > 0 && (
            <button type="button" className="btn primary sub-btn" onClick={openSub}>Sub category details <span className="sub-count">{subFilled} of {sc.fields.length} filled</span></button>
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
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="sheet wide" onSubmit={submit} role="dialog" aria-modal="true" aria-label={isNew ? 'New entry' : 'Edit entry'}>
        <div className="sheet-head"><h2>{isNew ? 'New entry' : 'Edit entry'}</h2>
          <span className="tpl-head">
            <span className="alert-icons" role="group" aria-label="Alert at the due time">
              {[['', '🔔', 'Alert at the due time: default'], ['alarm', '⏰', 'Alert at the due time: Alarm (pop-up + sound)'], ['gentle', '🔕', 'Alert at the due time: Reminder (notification only)']].map(([v, ico, tip]) => <button type="button" key={v} className={`ai${t.alertMode === v ? ' on' : ''}`} title={tip} aria-label={tip} aria-pressed={t.alertMode === v} onClick={() => setT({ ...t, alertMode: v })}>{ico}</button>)}
            </span>
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
        <div className="strip">
        <div className="fields one-line">
          {pick('categories', 'Category', 'category', true)}
          {pick('priorities', 'Priority', 'priority')}
          {pick('statuses', 'Status', 'status')}
          {pick('pendingWith', 'Pending with', 'pendingWith', true)}
        </div>
        <div className="fields one-line">
          <label className="field">Due date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
          <label className="field">Month end
            <select value={monthEnd.some((m) => m.key === date) && !time ? date : ''} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setTime(''); } }} aria-label="Month end: the last working days of the month" title="The last working days of the month (not Sundays, holidays or leave days). A date alone alerts once, at 7 PM that day.">
              <option value="">Month end ...</option>{monthEnd.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </label>
          <div className="field">Due time
            <button type="button" className="time-btn" onClick={() => setClockOpen(true)} disabled={!date} aria-label="Pick the due time on a clock">
              <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" /><path d="M12 7v5l3.5 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              <span>{timeLabel(time) || (date ? 'Set time' : 'Pick a date first')}</span>
            </button>
          </div>
          <label className="field">Repeats<select value={t.recurrence} onChange={set('recurrence')}>{opts(RECURRENCES, t.recurrence).map((x) => <option key={x}>{x}</option>)}</select></label>
          {t.recurrence === 'Custom' && <label className="field">Every (minutes)<input type="number" min="1" value={t.recurrenceEveryMin || ''} onChange={(e) => setT({ ...t, recurrenceEveryMin: Number(e.target.value) || null })} /></label>}
        </div>
        </div>
        <div className="cols3">
        <div className="col">
        <label className="field full">Task description<AutoText value={t.title} onChange={set('title')} autoFocus placeholder="What needs doing?" /></label>
        {manager}
        {t.category && (
          <button type="button" className="btn rem-btn" onClick={() => setRemOpen(true)} title="Next reminder date and time">⏰ {remDate ? `Next reminder: ${remDate}${remTime ? ' ' + timeLabel(remTime) : ''}` : 'Next reminder'}</button>
        )}
        {remOpen && (
          <Popup title="Next reminder" sub="9:00 AM if no time" onClose={() => setRemOpen(false)}>
            {t.category && (
          <label className="field check"><input type="checkbox" checked={categoryAsksReminder(lists, t.category)} onChange={() => saveLists(toggleReminderCategory(lists, t.category))} /> Ask for a next reminder date &amp; time under {t.category}</label>
        )}
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
          </Popup>
        )}
        {repeatsEvery && <p className="muted">Hourly and custom repeats are set here but are repeated by the phone app, not by this site.</p>}
        </div><div className="col">
        {subBlock}
        <NarrationBox t={t} />
        <div className="fields">
          <label className="field check"><input type="checkbox" checked={t.dar} onChange={(e) => setT({ ...t, dar: e.target.checked })} /> Include in the daily report when done (DAR)</label>
        </div>
        <div className="field full">
          <span className="field-head">Mail chain<button type="button" className="mini" disabled={!t.reference.trim()} onClick={async () => { notify((await copyText(t.reference)) ? 'Mail chain copied' : 'Could not copy the mail chain'); }} title="Copy the mail chain">Copy</button></span>
          <input value={t.reference} onChange={set('reference')} placeholder="Paste or type the mail subject" aria-label="Mail chain" />
        </div>
        </div><div className="col">
        <label className="field full">Notes<AutoText value={t.notes} onChange={set('notes')} /></label>
        <button type="button" className="btn check-btn" onClick={() => setStepsOpen(true)}>☑ Checklist{t.checklist.length > 0 ? ` (${t.checklist.filter((c) => c.done).length}/${t.checklist.length} done)` : ''}</button>
        {stepsOpen && (
          <Popup title="Checklist" sub="Steps to tick before the task is done" onClose={() => setStepsOpen(false)}>
          {t.checklist.map((c) => (
            <div key={c.id} className="row">
              <label className="check-row"><input type="checkbox" checked={c.done} onChange={() => setT({ ...t, checklist: t.checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)) })} /><span className={c.done ? 'struck' : ''}>{c.text}</span></label>
              <button type="button" className="btn ghost" onClick={() => setT({ ...t, checklist: t.checklist.filter((x) => x.id !== c.id) })} aria-label={`Remove ${c.text}`}>✕</button>
            </div>
          ))}
          <div className="add-row"><input value={step} onChange={(e) => setStep(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addStepNow(); } }} placeholder="Add a step..." /><button type="button" className="btn" onClick={addStepNow} disabled={!step.trim()}>Add</button></div>
          </Popup>
        )}
        </div></div>
        {subError && <div className="banner err" role="alert">{subError}</div>}
        <div className="sheet-foot">
          {!isNew && !t.binned && <button type="button" className="btn danger" onClick={() => { actions.bin(t); onClose(); }}>Move to bin</button>}
          <span className="grow" />
          <button type="button" className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!t.title.trim()}>Save</button>
        </div>
      {subOpen && sc && (
        <div className="sub-pop" onMouseDown={(e) => e.target === e.currentTarget && closeSub(true)} role="dialog" aria-modal="true" aria-label="Sub category details">
          <div className="sub-card">
            <div className="sub-head"><span><b>{sc.name}</b><small>Sub category details</small></span><button type="button" className="btn ghost" onClick={() => closeSub(true)} aria-label="Close">✕</button></div>
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
