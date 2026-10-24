import { useMemo, useState } from 'react';
import { planImport } from '../importBackup';
import { exportBackupFile, downloadFormatsFile, downloadFormatsBackup } from '../exportBackup';
import NotifyExplainer from '../NotifyExplainer';
import { loadAlertSettings, saveAlertSettings } from '../alerts';
import { THEMES, TEXT_SIZES, applyTheme, applyScheme, applyTextSize, savedTheme, savedScheme, savedTextSize } from '../themes';
import { PageHead } from '../ui';
import { useStore } from '../store';
import { planFormatsRestore, planFormatSetup, placeholdersOf, renderTemplate, findFormat, unmatchedMarks, formatsAfterEdit } from '../reportFormats';
import { categoryAsksReminder, toggleReminderCategory } from '../data';
import { LIST_META, ListManager, SubCategoryManager } from './Lists';

/** Config: a side menu of topics, and the chosen topic's panels beside it. */
export default function Config() {
  const { lists, user, signOut, demo, saveLists } = useStore();
  const [topic, setTopic] = useState('look');
  const topics = [
    { key: 'alerts', title: 'Alerts', body: () => <AlertSettings /> },
    { key: 'look', title: 'Appearance', body: () => <Appearance /> },
    { key: 'entry', title: 'Entry form options', body: () => (
      <>
        <section className="card plain">
          <h2 className="h2">Entry form options</h2>
          <p className="muted">Add or delete the options used in the entry form. They are shared with the phone app and the old website. Tasks already using a deleted option keep it.</p>
        </section>
        <div className="two">{LIST_META.map(([key, label]) => <section key={key} className="card plain"><h2 className="h2">{label}</h2><ListManager listKey={key} label={label} lists={lists} /></section>)}</div>
      </>
    ) },
    { key: 'subs', title: 'Sub categories', body: () => <section className="card plain"><h2 className="h2">Sub categories</h2><p className="muted">Sub categories and their fields, kept under each category.</p><SubCategoryManager lists={lists} /></section> },
    { key: 'reminder', title: 'Next reminder', body: () => (
      <section className="card plain">
        <h2 className="h2">Next reminder date &amp; time</h2>
        <p className="muted">Choose the categories that ask for a next reminder date and time in the entry form. The other categories do not show it.</p>
        <div className="chips">{lists.categories.map((c) => { const on = categoryAsksReminder(lists, c); return <button type="button" key={c} className={`chip toggle${on ? ' on' : ''}`} aria-pressed={on} onClick={() => saveLists(toggleReminderCategory(lists, c))}>{c}</button>; })}</div>
      </section>
    ) },
    { key: 'formats', title: 'Report formats', body: () => <ReportFormats /> },
    { key: 'points', title: 'Report points', body: () => <ReportPoints lists={lists} /> },
    { key: 'gemini', title: 'Gemini key', body: () => <GeminiKey /> },
    { sep: true, key: 'export', title: 'Export a backup', body: () => <ExportBackup /> },
    { key: 'import', title: 'Import', body: () => <ImportBackup /> },
  ];
  const open = topics.find((x) => x.key === topic) || topics[1];
  return (
    <>
      <PageHead title="Config" sub="Alerts, colours and the lists the entry form uses." />
      <div className="cols cfg">
        <div className="cfg-side">
          <section className="card plain cfg-account">
            <span className="cfg-avatar" aria-hidden="true">{(user.displayName || user.email || '?').trim().charAt(0).toUpperCase()}</span>
            <span className="cfg-who"><span className="card-title">{user.displayName || 'Signed in'}</span><span className="muted">{user.email}</span></span>
            <button className="btn" onClick={signOut}>{demo ? 'Leave demo' : 'Sign out'}</button>
          </section>
          <nav className="menu" aria-label="Config topics">
            {topics.map((x) => (
              <span key={x.key} className="menu-item">
                {x.sep && <hr />}
                <button type="button" className={open.key === x.key ? 'on' : ''} aria-current={open.key === x.key ? 'page' : undefined} onClick={() => setTopic(x.key)}>{x.title}</button>
              </span>
            ))}
          </nav>
        </div>
        <div className="pn cfg-page">{open.body()}</div>
      </div>
    </>
  );
}

/** Config > Export a backup: every task (done and binned too) with the lists, links, templates and report formats, as one JSON file the Import below reads back. */
function ExportBackup() {
  const { tasks, lists, calendar, links, templates, savedFormats } = useStore();
  const [msg, setMsg] = useState('');
  const run = () => { const n = exportBackupFile({ tasks, lists, calendar, links, templates, savedFormats }); setMsg(`Saved ${n} task${n === 1 ? '' : 's'} to your downloads.`); };
  return (
    <section className="card plain">
      <h2 className="h2">Export a backup</h2>
      <p className="muted">Downloads every task (open, done and in the Bin) with your categories, sub categories, links, templates and report formats as one file. Keep it somewhere safe; Import (below) reads it back.</p>
      <div><button type="button" className="btn primary" onClick={run}>Export a backup</button></div>
      {msg && <p className="banner ok" role="status">{msg}</p>}
    </section>
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

/** Config > Report formats: the line the Daily report writes for a task, per Sub Category, with {Field name} marks filled from the task. */
function ReportFormats() {
  const { lists, saveLists, tasks, reportFormats, savedFormats, reportFormatsCustom, saveReportFormats, notify } = useStore();
  // Restore: formats in the backup file are saved for their Sub Categories (replacing the current ones); every other format stays.
  const restoreFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const plan = planFormatsRestore(savedFormats, await file.text());
    if (plan.error) { alert(plan.error); return; }
    if (!confirm(`Restore ${plan.count} report formats from ${file.name}? Formats in the file replace the current ones for the same Sub Category; the others stay.`)) return;
    saveReportFormats(plan.saved);
    notify(`Restored ${plan.count} report formats`);
  };
  const [open, setOpen] = useState('');
  const [draft, setDraft] = useState('');
  const subs = lists.subCategories || [];
  const rows = [
    ...subs.map((sc) => ({ key: `s-${sc.id || sc.name}`, sc, name: sc.name, category: sc.category || '', format: findFormat(reportFormats, sc.name) })),
    ...reportFormats.filter((f) => !subs.some((sc) => findFormat([f], sc.name))).map((f) => ({ key: `f-${f.id}`, sc: null, name: f.subCategory, category: f.category, format: f })),
  ];
  const setup = planFormatSetup(lists, reportFormats);
  const missingCount = setup.categories.length + setup.subCategories.length;
  const startEdit = (row) => { setOpen(open === row.key ? '' : row.key); setDraft(row.format ? row.format.template : ''); };
  // Saving or removing writes into the raw saved list (removal markers kept), not the effective list, so a removed sample stays removed.
  const save = (row, template) => saveReportFormats(formatsAfterEdit(savedFormats, { id: row.format ? row.format.id : '', subCategory: row.format ? row.format.subCategory : row.name, category: row.category || (row.format && row.format.category) || '' }, template));
  const addFields = (row, marks) => saveLists({ ...lists, subCategories: subs.map((sc) => (sc === row.sc ? { ...sc, fields: [...sc.fields, ...marks.map((label) => ({ label }))] } : sc)) });
  const sample = (row) => { const mine = tasks.filter((t) => t.subCategory && row.sc && t.subCategory === row.sc.name && Object.keys(t.subCategoryFields || {}).length); return mine.length ? mine[0] : { subCategoryFields: {} }; };
  return (
    <section className="card plain">
      <div className="fmt-head">
        <h2 className="h2">Report formats</h2>
        <span className="fmt-actions">
          <button type="button" className="btn" onClick={() => downloadFormatsFile(reportFormats)} disabled={!reportFormats.length}>Download all formats</button>
          <button type="button" className="btn" onClick={() => notify(`Backup saved: ${downloadFormatsBackup(reportFormats)} formats`)} disabled={!reportFormats.length}>Backup formats</button>
          <label className="btn">Restore formats<input type="file" accept="application/json,.json" hidden onChange={restoreFile} /></label>
        </span>
      </div>
      <p className="muted">The line the Daily report writes for a task in each Sub Category. Write the sentence and put a task's own value where it goes in {'{'}braces{'}'} - for example <code>Being amount paid against Invoice No. {'{'}Invoice No{'}'}, amounting to ₹{'{'}Amount{'}'}.</code> Each {'{'}mark{'}'} is filled from the task's Sub Category field with that name (then its Key Points); a missing value shows as [mark] in the report. The sample formats from your Tally narration sheet are used until you change one.{reportFormatsCustom ? ' (Your own formats are saved.)' : ''}</p>
      <div className={`fmt-setup${missingCount ? ' todo' : ''}`}>
        {missingCount ? (
          <>
            <div><b>{setup.categories.length} categor{setup.categories.length === 1 ? 'y' : 'ies'} and {setup.subCategories.length} sub categor{setup.subCategories.length === 1 ? 'y' : 'ies'} from the formats are not in your lists yet.</b>
              <div className="muted fmt-missing">{setup.categories.length > 0 && <>Categories: {setup.categories.join(', ')}. </>}{setup.subCategories.length > 0 && <>Sub categories: {setup.subCategories.map((x) => `${x.name} (${x.category || 'no category'})`).join('; ')}.</>}</div>
              <div className="muted">Only what is missing is created, each new Sub Category with a field for every {'{'}mark{'}'} of its format. Nothing you already have is changed.</div></div>
            <button type="button" className="btn primary" onClick={() => saveLists(setup.lists)}>Create the missing ones</button>
          </>
        ) : <span className="muted">Every category and sub category in the formats is already in your lists.</span>}
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

/**
 * Report points, Category by Category: lines the person writes for a Category. The daily report shows a Category's points once, above the
 * lines of the section its tasks are in (Other work, Payments or Followed up). Nothing is built in.
 */
function ReportPoints({ lists }) {
  const { saveLists } = useStore();
  const points = lists.darPaymentIntro || [];
  const [drafts, setDrafts] = useState({});
  const save = (next) => saveLists({ ...lists, darPaymentIntro: next });
  const add = (cat) => {
    const text = (drafts[cat] || '').replace(/\s+/g, ' ').trim();
    if (!text) return;
    if (!points.some((p) => p.category === cat && p.text === text)) save([...points, { category: cat, text }]);
    setDrafts({ ...drafts, [cat]: '' });
  };
  const del = (p) => { if (confirm(`Delete this report point?\n\n${p.text}`)) save(points.filter((x) => x !== p)); };
  const loose = points.filter((p) => !lists.categories.includes(p.category));
  return (
    <>
      <section className="card plain">
        <h2 className="h2">Report points</h2>
        <p className="muted">Write the lines a Category adds to the daily report. When a task of that Category is in the report, its points are shown once above that section's lines. Nothing is added by default.</p>
      </section>
      {lists.categories.map((cat) => {
        const mine = points.filter((p) => p.category === cat);
        return (
          <section key={cat} className="card plain">
            <h2 className="h2">{cat}</h2>
            {!mine.length && <p className="muted">No report points for {cat}.</p>}
            {mine.map((p) => (
              <div key={p.text} className="rp-row"><span>{p.text}</span><button type="button" className="btn ghost" onClick={() => del(p)} aria-label={`Delete: ${p.text}`}>Delete</button></div>
            ))}
            <form className="rp-add" onSubmit={(e) => { e.preventDefault(); add(cat); }}>
              <textarea className="auto" rows={2} value={drafts[cat] || ''} onChange={(e) => setDrafts({ ...drafts, [cat]: e.target.value })} placeholder={`A report point for ${cat}`} aria-label={`New report point for ${cat}`} />
              <button className="btn primary" disabled={!(drafts[cat] || '').trim()}>Add</button>
            </form>
          </section>
        );
      })}
      {loose.length > 0 && (
        <section className="card plain">
          <h2 className="h2">Not used yet</h2>
          <p className="muted">These older lines have no Category, so the report does not use them. Give each a Category or delete it.</p>
          {loose.map((p) => (
            <div key={p.text} className="rp-row">
              <span>{p.text}</span>
              <select value="" onChange={(e) => e.target.value && save(points.map((x) => (x === p ? { ...x, category: e.target.value } : x)))} aria-label="Give this point a Category">
                <option value="">Category...</option>{lists.categories.map((c) => <option key={c}>{c}</option>)}
              </select>
              <button type="button" className="btn ghost" onClick={() => del(p)}>Delete</button>
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function GeminiKey() {
  const [saved, setSaved] = useState(() => { try { return !!localStorage.getItem('wd-gemini-key'); } catch { return false; } });
  const [value, setValue] = useState('');
  const [show, setShow] = useState(false);
  const [state, setState] = useState({ busy: false, msg: '', bad: false });
  const save = async () => {
    const { saveGeminiKey } = await import('../gemini');
    saveGeminiKey(value);
    setSaved(!!value.trim()); setValue(''); setState({ busy: false, msg: value.trim() ? 'Saved on this computer.' : 'Removed.', bad: false });
  };
  const test = async () => {
    setState({ busy: true, msg: '', bad: false });
    try {
      const { generateWithKey, loadGeminiKey } = await import('../gemini');
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
        {saved && <button type="button" className="btn ghost" onClick={async () => { const { saveGeminiKey } = await import('../gemini'); saveGeminiKey(''); setSaved(false); setState({ busy: false, msg: 'Removed.', bad: false }); }}>Remove key</button>}
      </div>
      {saved && <p className="muted">A key is saved on this computer.</p>}
      {state.msg && <p className={state.bad ? 'banner err' : 'muted'} role="status">{state.msg}</p>}
    </section>
  );
}

function AlertSettings() {
  const [s, setS] = useState(loadAlertSettings);
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'));
  const set = (patch) => { const next = { ...s, ...patch }; setS(next); saveAlertSettings(next); window.dispatchEvent(new Event('wd-alert-settings')); };
  const [explain, setExplain] = useState(false);       // the in-page explainer shown before the browser's own permission prompt
  const answered = (r) => { setExplain(false); if (r === 'later') return; setPerm(r); set({ notify: r === 'granted' }); };
  const enableNotify = () => { if (perm === 'granted') set({ notify: true }); else setExplain(true); };
  return (
    <section className="card plain">
      <h2 className="h2">Alerts</h2>
      <p className="muted">How a due task reaches you while this tab is open. When a task is due (or its next reminder time comes), an alert appears with the task's details and the choices to mark it done, snooze, skip or move it. Keep this page open to get alerts; the phone app rings by itself.</p>
      <label className="row tg-row"><span>Pop up a due alert<small>A window with Done, DAR, Snooze, Move and Skip.</small></span><input type="checkbox" role="switch" className="tg" checked={s.popup} onChange={(e) => set({ popup: e.target.checked })} /></label>
      <label className="row tg-row"><span>Play a sound<small>Starts after your first click or key press on the page.</small></span><input type="checkbox" role="switch" className="tg" checked={s.sound} onChange={(e) => set({ sound: e.target.checked })} /></label>
      <label className="row tg-row"><span>Desktop notification when this tab is in the background<small>{perm === 'denied' ? 'Blocked in the browser settings.' : 'Shows even when this tab is in the background.'}</small></span><input type="checkbox" role="switch" className="tg" checked={s.notify && perm === 'granted'} disabled={perm === 'unsupported' || perm === 'denied'} onChange={(e) => (e.target.checked ? enableNotify() : set({ notify: false }))} /></label>
      <div><button type="button" className="btn" onClick={() => window.dispatchEvent(new Event('wd-test-alert'))}>Show a test alert</button></div>
      {explain && <NotifyExplainer onDone={answered} />}
    </section>
  );
}

/** Config > Appearance: the colour theme (applies at once, remembered on this device), dark mode and the text size. */
function Appearance() {
  const [theme, setTheme] = useState(savedTheme);
  const [scheme, setScheme] = useState(savedScheme);
  const [size, setSize] = useState(savedTextSize);
  return (
    <section className="card plain">
      <h2 className="h2">Colour theme</h2>
      <p className="muted">Pick a colour theme. It applies at once and is kept on this device.</p>
      <div className="sw" role="group" aria-label="Colour theme">
        {THEMES.map((t) => (
          <button key={t.id} type="button" className="sw-card" aria-pressed={theme === t.id} onClick={() => setTheme(applyTheme(t.id))}>
            <i style={{ background: t.light.primary }}><b style={{ background: t.light.dark }} /></i>{t.name}
          </button>
        ))}
      </div>
      <label className="row tg-row"><span>Follow the computer's dark mode<small>{scheme === 'auto' ? 'Switches automatically with your computer.' : 'Off: the colours stay as chosen below.'}</small></span><input type="checkbox" role="switch" className="tg" checked={scheme === 'auto'} onChange={(e) => setScheme(applyScheme(e.target.checked ? 'auto' : 'light'))} /></label>
      {scheme !== 'auto' && (
        <div><div className="row"><span>Colours</span></div>
          <div className="seg" role="group" aria-label="Colours">{[['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => <button key={k} type="button" className={scheme === k ? 'on' : ''} aria-pressed={scheme === k} onClick={() => setScheme(applyScheme(k))}>{l}</button>)}</div>
        </div>
      )}
      <div><div className="row"><span>Text size</span></div>
        <div className="seg" role="group" aria-label="Text size">{TEXT_SIZES.map(([k, l]) => <button key={k} type="button" className={size === k ? 'on' : ''} aria-pressed={size === k} onClick={() => setSize(applyTextSize(k))}>{l}</button>)}</div>
      </div>
    </section>
  );
}
