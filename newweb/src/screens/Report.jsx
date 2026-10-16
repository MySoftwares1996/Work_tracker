import { useMemo, useState } from 'react';
import { copyText } from '../clipboard';
import { useStore } from '../store';
import { buildReport, REPORT_GROUPS, mergeAi, reportPrompt, reportCsvRows, reportHtml } from '../reportEngine';
import { reportMailUrl } from '../../../src/workingDashboardReport.js';
import { dayKey, isOpen, sortTasks, stats } from '../data';

export default function Report() {
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
      const { rewriteWithGemini } = await import('../gemini');
      const forAi = buildReport(tasks, lists, calendar, day, { headings: true, subFields: opts.subFields, formats: reportFormats, moves });
      const got = await rewriteWithGemini(reportPrompt(forAi.model, forAi.text, extra));
      const merged = mergeAi(forAi.model, got.text, { headings: opts.headings });
      if (merged.error) { setAiError(merged.error); }
      else { setAi({ text: merged.text, base: report.text, via: got.via, note: merged.note }); setEdited(''); setShowOriginal(false); }
    } catch (e) { setAiError(String(e.message || e)); }
    setBusy(false);
  };
  const copy = async () => { if (await copyText(text)) { setCopied(true); setTimeout(() => setCopied(false), 1800); } else notify('Could not copy - select the text and copy it'); };
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
