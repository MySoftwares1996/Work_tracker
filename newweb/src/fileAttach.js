// Turns a picked PDF / image into a stored file for a task (see src/taskFiles.js): images are shrunk, PDFs kept as they are.
import { fitsFiles, isFileType, fileSizeLabel, MAX_FILES_CHARS, filesChars } from '../../src/taskFiles.js';
import { newId } from './data';

const readDataUrl = (blob) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(String(r.result));
  r.onerror = () => reject(new Error('Could not read the file'));
  r.readAsDataURL(blob);
});

const loadImage = (url) => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('Could not open the image'));
  img.src = url;
});

/** A photo or screenshot shrunk to fit: up to 1400 px on the long side, as JPEG, quality lowered until it is under `maxChars`. */
async function shrinkImage(file, maxChars) {
  const img = await loadImage(await readDataUrl(file));
  let scale = Math.min(1, 1400 / Math.max(img.width, img.height));
  for (let round = 0; round < 6; round++) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    const g = c.getContext('2d');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    for (const q of [0.78, 0.62, 0.48]) {
      const data = c.toDataURL('image/jpeg', q);
      if (data.length <= maxChars) return data;
    }
    scale *= 0.7;
  }
  return '';
}

/** { file } for the task, or { error } to show. `have` = the files the task already holds. */
export async function readAttachment(file, have) {
  if (!file) return { error: 'No file chosen.' };
  if (!isFileType(file.type)) return { error: `${file.name}: only PDF and image files (PNG, JPG, WEBP, GIF) can be attached.` };
  const room = MAX_FILES_CHARS - filesChars(have);
  try {
    let data;
    if (/^application\/pdf$/i.test(file.type)) {
      data = await readDataUrl(file);
    } else if (/^image\/gif$/i.test(file.type)) {
      data = await readDataUrl(file);
    } else {
      data = await shrinkImage(file, Math.max(room, 0));
    }
    if (!data || !fitsFiles(have, data.length)) {
      return { error: `${file.name} is too big: the files of one task may total about ${fileSizeLabel(MAX_FILES_CHARS * 0.75)}. Use a smaller PDF or fewer files.` };
    }
    const type = (/^data:([^;]+);/.exec(data) || [])[1] || file.type;
    return { file: { id: newId(), name: file.name, type, size: Math.round(data.length * 0.75), data } };
  } catch (e) {
    return { error: `${file.name}: ${e && e.message ? e.message : 'could not be attached'}` };
  }
}

/** Opens a stored file in a new tab (a blob link: browsers block data: links as page addresses). */
export async function openAttachment(f) {
  try {
    const blob = await (await fetch(f.data)).blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch { /* the browser refused the pop-up; the file stays attached */ }
}
