/**
 * Quick add: "Pay ICICI invoice tomorrow 5pm high with Rahul" -> title, due date and time, priority, category, person.
 * Pure (no React): the dashboard's quick-add bar and the finder both use it, then open the New Entry form pre-filled so
 * nothing is saved without a look. Whatever it cannot read stays in the title.
 */
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
// Whole month names or the usual abbreviations only: "dec" / "december" / "sept", never "decision" or "marketing".
const MONTH_WORD = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
const monthIndex = (w) => MONTHS.indexOf(String(w).slice(0, 3).toLowerCase());
const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const esc = (v) => String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const day0 = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** A real calendar date, or null (day 31 of a 30-day month, month 13...). */
const validDate = (y, mo, d) => { const x = new Date(y, mo, d); return mo >= 0 && mo <= 11 && x.getFullYear() === y && x.getMonth() === mo && x.getDate() === d ? x : null; };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export function parseQuickAdd(input, { now = new Date(), categories = [], assignees = [], dateOrder = 'dmy', dateOnlyTime = '' } = {}) {
  let text = ` ${String(input || '').trim()} `;
  const out = { title: '', priority: null, dueAt: null, category: null, pendingWith: null, reference: '', dateOnly: false };
  // fn may return false to refuse the match (it is then left in the text).
  const take = (re, fn) => { const m = re.exec(text); if (!m) return false; if (fn(m) === false) return false; text = text.replace(re, ' '); return true; };

  // A pasted mail subject ("RE: ...", "FW: ...") is the mail chain as well as the title.
  const mail = /^\s*((?:re|fw|fwd)\s*:.*)$/i.exec(text);
  if (mail) { out.reference = mail[1].trim(); text = ` ${mail[1].replace(/^\s*(?:(?:re|fw|fwd)\s*:\s*)+/i, '').trim()} `; }

  // Priority
  if (take(/\s(?:urgent|asap|high(?:\s+priority)?|!!)(?=\s)/i, () => { out.priority = 'High'; })) { /* done */ }
  else if (take(/\s(?:medium|normal)(?:\s+priority)?(?=\s)/i, () => { out.priority = 'Medium'; })) { /* done */ }
  else take(/\slow(?:\s+priority)?(?=\s)/i, () => { out.priority = 'Low'; });

  // Person: "with Rahul", "pending with Rahul", "@Rahul" - only a name already in the list.
  for (const name of assignees) {
    if (!name) continue;
    if (take(new RegExp(`\\s(?:pending\\s+with|with|@)\\s*${esc(name)}(?=\\s)`, 'i'), () => { out.pendingWith = name; })) break;
  }
  // Category: its name as a whole word - the longest name first, so "Bank Follow Up" wins over "Bank".
  for (const c of [...categories].filter(Boolean).sort((a, b) => String(b).length - String(a).length)) {
    if (!c) continue;
    if (take(new RegExp(`\\s${esc(c)}(?=\\s)`, 'i'), () => { out.category = c; })) break;
  }

  // Date
  let date = null;
  let rel = null;
  if (take(/\s(?:day\s+after\s+tomorrow)(?=\s)/i, () => { date = addDays(day0(now), 2); })) { /* done */ }
  else if (take(/\s(?:tomorrow|tmrw|tmr)(?=\s)/i, () => { date = addDays(day0(now), 1); })) { /* done */ }
  else if (take(/\stoday(?=\s)/i, () => { date = day0(now); })) { /* done */ }
  else if (take(/\snext\s+week(?=\s)/i, () => { const w = day0(now); date = addDays(w, ((8 - w.getDay()) % 7) || 7); })) { /* done */ }
  else if (take(/\sin\s+(\d+)\s*(min(?:ute)?s?|hours?|hrs?|h|days?|d)(?=\s)/i, (m) => {
    const n = Number(m[1]);
    const u = m[2].toLowerCase();
    if (u.startsWith('m')) rel = new Date(now.getTime() + n * 60000);
    else if (u.startsWith('h')) rel = new Date(now.getTime() + n * 3600000);
    else date = addDays(day0(now), n);
  })) { /* done */ }
  else if (take(new RegExp(`\\s(?:on\\s+|next\\s+)?(${DAYS.map((d) => d.slice(0, 3) + '(?:' + d.slice(3) + ')?').join('|')})(?=\\s)`, 'i'), (m) => {
    const want = DAYS.findIndex((d) => d.startsWith(m[1].slice(0, 3).toLowerCase()));
    let n = (want - now.getDay() + 7) % 7;
    if (n === 0) n = 7;
    date = addDays(day0(now), n);
  })) { /* done */ }
  else if (take(new RegExp(`\\s(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTH_WORD})\\.?(?:\\s+(\\d{4}))?(?=\\s)`, 'i'), (m) => {
    const d = validDate(Number(m[3]) || now.getFullYear(), monthIndex(m[2]), Number(m[1]));
    if (!d) return false;
    date = !m[3] && d < day0(now) ? new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()) : d;
  })) { /* done */ }
  else if (take(new RegExp(`\\s(?:on\\s+)?(${MONTH_WORD})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?=\\s)`, 'i'), (m) => {
    const d = validDate(now.getFullYear(), monthIndex(m[1]), Number(m[2]));
    if (!d) return false;
    date = d < day0(now) ? new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()) : d;
  })) { /* done */ }
  else take(/\s(?:(on|by|before|till|until)\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?=\s)/i, (raw) => {
    // A bare "12-10" (INV 12-10, ratio 3/4) is not a date: it needs a date word before it or a year after it.
    if (!raw[1] && !raw[4]) return false;
    const m = [raw[0], raw[2], raw[3], raw[4]];
    const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : now.getFullYear();
    const [dd, mo] = dateOrder === 'mdy' ? [Number(m[2]), Number(m[1])] : [Number(m[1]), Number(m[2])];      // day first by default, as in India
    const d = validDate(y, mo - 1, dd);
    if (!d) return false;      // "INV 99-12", "0/5": not a date, stays in the title
    date = !m[3] && d < day0(now) ? new Date(d.getFullYear() + 1, d.getMonth(), d.getDate()) : d;
  });

  // Time
  let hh = null;
  let mm = 0;
  if (take(/\s(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)(?=\s)/i, (m) => {
    hh = Number(m[1]) % 12 + (/p/i.test(m[3]) ? 12 : 0);
    mm = Number(m[2] || 0);
  })) { /* done */ }
  else if (take(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/, (m) => { hh = Number(m[1]); mm = Number(m[2]); })) { /* done */ }
  else take(/\sat\s+(\d{1,2})(?=\s)/i, (m) => { const h = Number(m[1]); hh = h >= 13 ? h : h >= 8 ? h : h === 12 ? 12 : h + 12; });      // "at 5" = 5 pm, "at 9" = 9 am

  if (rel) { out.dueAt = rel.toISOString(); }
  else if (date && hh != null) { date.setHours(hh, mm, 0, 0); out.dueAt = date.toISOString(); }
  else if (date && /^([01]?\d|2[0-3]):[0-5]\d$/.test(String(dateOnlyTime))) { const [h, m2] = dateOnlyTime.split(':').map(Number); date.setHours(h, m2, 0, 0); out.dueAt = date.toISOString(); }
  else if (date) { out.dueAt = date.toISOString(); out.dateOnly = true; }      // a date alone: due all that day
  else if (hh != null) {
    const d = day0(now);
    d.setHours(hh, mm, 0, 0);
    if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);      // that time has passed today: tomorrow
    out.dueAt = d.toISOString();
  }

  out.title = text.replace(/\s+/g, ' ').replace(/^\s*[-–—:,;]+\s*|\s*[-–—:,;]+\s*$/g, '').trim();
  return out;
}

/** A short readable summary of what was understood: "High · Tomorrow 5:00 PM · Payments · with Rahul". */
export function describeQuickAdd(p, now = new Date()) {
  const bits = [];
  if (p.priority) bits.push(p.priority);
  if (p.dueAt) {
    const d = new Date(p.dueAt);
    const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - day0(now)) / 86400000);
    const dayText = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
    bits.push(p.dateOnly ? dayText : `${dayText} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
  }
  if (p.category) bits.push(p.category);
  if (p.pendingWith) bits.push(`with ${p.pendingWith}`);
  if (p.reference) bits.push('mail chain');
  return bits.join(' · ');
}
