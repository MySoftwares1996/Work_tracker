// expo-sharing in the browser: "share" a file written with web/shims/file-system.js by downloading it.
import { files } from './file-system';

export const isAvailableAsync = async () => typeof document !== 'undefined';

export async function shareAsync(uri, { mimeType = 'application/octet-stream' } = {}) {
  const text = files.has(uri) ? files.get(uri) : '';
  const url = URL.createObjectURL(new Blob([text], { type: mimeType + ';charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = decodeURIComponent(String(uri).split('/').pop() || 'download');
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  files.delete(uri);
}
