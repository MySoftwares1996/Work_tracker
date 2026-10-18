const isMinuteRepeat = (r) => r === 'hourly' || r === 'custom';

/** Next occurrence of a repeating to-do, strictly after `now`. Monthly keeps its day (31 -> 30/28 -> 31). */
export function nextOccurrence(iso, repeat, anchorDay, now = Date.now(), everyMin = 0) {
  const d = new Date(iso);
  if (isMinuteRepeat(repeat)) {
    const stepMs = (repeat === 'hourly' ? 60 : Math.max(1, everyMin || 1)) * 60000;
    // Jump straight past `now` rather than stepping minute by minute.
    const behind = Math.max(0, now - d.getTime());
    return new Date(d.getTime() + (Math.floor(behind / stepMs) + 1) * stepMs);
  }
  const anchor = anchorDay ?? d.getDate();
  const step = () => {
    if (repeat === 'daily') d.setDate(d.getDate() + 1);
    else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
    else if (repeat === 'monthly') {
      d.setDate(1); d.setMonth(d.getMonth() + 1);
      d.setDate(Math.min(anchor, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()));
    } else if (repeat === 'weekdays') {
      do { d.setDate(d.getDate() + 1); } while (d.getDay() === 0 || d.getDay() === 6);
    } else d.setDate(d.getDate() + 1);
  };
  do { step(); } while (d.getTime() <= now);
  return d;
}
