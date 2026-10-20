import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

/*
 * A cell starting with = + - @ is run as a formula by Excel and Google Sheets. Payee names come from bank
 * SMS text, which the sender writes, so "=HYPERLINK(...)" could arrive in a message and run when the export
 * is opened. Such a cell is written with a leading apostrophe (shown as text); plain numbers like "-250"
 * are left alone.
 */
const FORMULA_START = /^[=+\-@\t\r]/;
const isPlainNumber = (s) => /^[+-]?\d+(\.\d+)?$/.test(s);
const esc = (v) => {
  let s = v == null ? '' : String(v);
  if (FORMULA_START.test(s) && !isPlainNumber(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

export function toCsv(rows, columns) {
  const cols = columns || [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
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

