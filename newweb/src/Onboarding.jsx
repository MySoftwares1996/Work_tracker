import { useState } from 'react';
import { useStore } from './store';
import { addOption, LEGACY_DEFAULT_LISTS } from './data';

/** A new account (no Category, no tasks) starts empty: three small steps, or the usual set in one click. Not shown again once there is a Category or a task. */
export default function Onboarding({ go, onDone }) {
  const { lists, saveLists, notify } = useStore();
  const [cat, setCat] = useState('');
  const [who, setWho] = useState('');
  const addCat = (e) => { e.preventDefault(); const next = addOption(lists.categories, cat); if (next !== lists.categories) saveLists({ ...lists, categories: next }); setCat(''); };
  const addWho = (e) => { e.preventDefault(); const next = addOption(lists.pendingWith, who); if (next !== lists.pendingWith) saveLists({ ...lists, pendingWith: next }); setWho(''); };
  const usual = () => { saveLists({ ...lists, categories: LEGACY_DEFAULT_LISTS.categories }); notify('Added the usual Categories'); };
  return (
    <section className="card plain onboard" aria-label="Get started">
      <h2 className="h2">Welcome - set up your lists</h2>
      <p className="muted">Your account starts empty. Add what you use; you can change it any time in Config. Already set up another account? Config &gt; Setup file loads its lists, formats and templates here.</p>
      <ol className="onboard-steps">
        <li>
          <b>Category</b>
          <form onSubmit={addCat}><input value={cat} onChange={(e) => setCat(e.target.value)} placeholder="e.g. Payments" aria-label="New Category" /><button className="btn primary" disabled={!cat.trim()}>Add</button></form>
          {lists.categories.length > 0 && <span className="chips">{lists.categories.map((c) => <span key={c} className="chip">{c}</span>)}</span>}
        </li>
        <li>
          <b>Pending with</b>
          <form onSubmit={addWho}><input value={who} onChange={(e) => setWho(e.target.value)} placeholder="e.g. Accounts" aria-label="New Pending with" /><button className="btn primary" disabled={!who.trim()}>Add</button></form>
          {lists.pendingWith.length > 0 && <span className="chips">{lists.pendingWith.map((c) => <span key={c} className="chip">{c}</span>)}</span>}
        </li>
        <li>
          <b>Sub Category</b>
          <span className="muted">Sub Categories and their fields are set under a Category.</span>
          <button type="button" className="btn" onClick={() => { location.hash = 'config'; go('config'); }}>Open Config</button>
        </li>
      </ol>
      <div className="onboard-foot"><button type="button" className="btn" onClick={usual}>Add the usual Categories instead</button><button type="button" className="btn primary" onClick={onDone}>Done</button></div>
    </section>
  );
}
