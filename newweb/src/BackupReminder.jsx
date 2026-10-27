import { useState } from 'react';
import { useStore } from './store';
import { exportBackupFile, lastBackupAt } from './exportBackup';

const SNOOZE = 'wd-backup-snooze';
const WEEK = 7 * 86400000;

/** Once a week: "Last backup: N days ago" with one button that downloads it. Dismissing hides it for a day; a backup resets it. */
export default function BackupReminder() {
  const store = useStore();
  const [hidden, setHidden] = useState(() => { try { return Date.now() - Number(localStorage.getItem(SNOOZE) || 0) < 86400000; } catch { return false; } });
  const [, tick] = useState(0);
  const last = lastBackupAt();
  if (store.demo || !store.hasLoaded || !store.tasks.length || hidden || (last && Date.now() - last < WEEK)) return null;
  const days = last ? Math.floor((Date.now() - last) / 86400000) : 0;
  const later = () => { try { localStorage.setItem(SNOOZE, String(Date.now())); } catch { /* not remembered */ } setHidden(true); };
  return (
    <div className="banner info" role="status">
      <span>{last ? `Your last backup was ${days} days ago.` : 'You have not saved a backup of your tasks yet.'}</span>
      <button type="button" className="btn" onClick={() => { const n = exportBackupFile(store); store.notify(`Backup saved: ${n} tasks`); tick((x) => x + 1); }}>Download a backup</button>
      <button type="button" className="btn ghost" onClick={later}>Later</button>
    </div>
  );
}
