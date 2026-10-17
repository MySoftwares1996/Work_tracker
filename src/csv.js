import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

/*
 * A cell starting with = + - @ is run as a formula by Excel and Google Sheets. Payee names come from bank
 * SMS text, which the sender writes, so "=HYPERLINK(...)" could arrive in a message and run when the export
 * is opened. Such a cell is written with a leading apostrophe (shown as text); plain numbers like "-250"
 * are left alone, and fromCsv() takes the apostrophe off again.
 */
const FORMULA_START = /^[=+\-@\t\r]/;
const isPlainNumber = (s) => /^[+-]?\d+(\.\d+)?$/.test(s);
const esc = (v) => {
  let s = v == null ? '' : String(v);
  if (FORMULA_START.test(s) && !isPlainNumber(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};
const unguard = (s) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);

export function toCsv(rows, columns) {
  const cols = columns || [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

/**
 * RFC 4180 parsing, character by character: a quoted cell may contain
 * commas, doubled quotes and line breaks (a multi-line note), which a
 * split-on-newline parser would tear into broken rows. A UTF-8 BOM, as Excel
 * writes, is dropped from the first header.
 */
export function parseCsvRows(text) {
  const src = String(text).replace(/^\uFEFF/, '');
  const rows = [];
  let row = []; let cur = ''; let q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += ch;
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

export function fromCsv(text) {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => Object.fromEntries(head.map((h, i) => [h, unguard(cells[i] ?? '')])));
}

export async function shareCsv(rows, filename, columns) {
  // The BOM makes Excel read the file as UTF-8 (₹, names in other scripts).
  const csv = '\uFEFF' + toCsv(rows, columns);
  const uri = (FileSystem.documentDirectory || FileSystem.cacheDirectory) + filename;
  await FileSystem.writeAsStringAsync(uri, csv, { encoding: 'utf8' });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'text/csv', dialogTitle: filename });
  }
  return uri;
}

