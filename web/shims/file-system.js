/**
 * The few expo-file-system calls the app makes, in the browser. A file "written" here is kept in memory
 * until expo-sharing (web/shims/sharing.js) hands it to the browser as a download; a file picked with
 * expo-document-picker comes back as a blob: / data: address, which is read with fetch.
 */
export const files = new Map();
export const documentDirectory = 'web-files://';
export const cacheDirectory = 'web-files://';
export const EncodingType = { UTF8: 'utf8', Base64: 'base64' };

export async function writeAsStringAsync(uri, contents) { files.set(uri, String(contents)); }

export async function readAsStringAsync(uri) {
  if (files.has(uri)) return files.get(uri);
  const res = await fetch(uri);
  return res.text();
}

export async function deleteAsync(uri) { files.delete(uri); }
export async function getInfoAsync(uri) { return { exists: files.has(uri), uri, size: files.get(uri)?.length || 0 }; }
