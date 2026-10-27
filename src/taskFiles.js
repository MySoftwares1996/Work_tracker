// Files (PDF / images) attached to a task. They are kept inside the task itself, as data URLs, so they sync like the rest of it.
// A task document may not pass 1 MiB in Firestore, so the files of one task share a budget; images are shrunk before they are added.
// Pure: no React, no storage. Shared by the phone and by newweb/.

/** The most the files of one task may take, counted as the stored text (the data URLs). About 520 KB of PDF or photos. */
export const MAX_FILES_CHARS = 700 * 1024;

const OK_TYPE = /^(application\/pdf|image\/(png|jpe?g|webp|gif))$/i;
const DATA_URL = /^data:(application\/pdf|image\/(?:png|jpe?g|webp|gif));base64,[A-Za-z0-9+/=]+$/i;

/** The files of a task as stored: [{ id, name, type, size, data }], anything that is not a PDF or image data URL dropped. */
export function cleanFiles(list) {
  return (Array.isArray(list) ? list : [])
    .filter((f) => f && typeof f.data === 'string' && DATA_URL.test(f.data))
    .map((f) => ({
      id: String(f.id || `f${Math.random().toString(36).slice(2, 10)}`),
      name: String(f.name || 'file').slice(0, 120),
      type: String(f.type || (DATA_URL.exec(f.data) || [])[1] || '').toLowerCase(),
      size: Number(f.size) || 0,
      data: f.data,
    }));
}

export const filesChars = (files) => (Array.isArray(files) ? files : []).reduce((n, f) => n + String((f && f.data) || '').length, 0);

/** Can a file of this stored size (data URL length) still be added? */
export const fitsFiles = (files, addChars) => filesChars(files) + addChars <= MAX_FILES_CHARS;

export const isFileType = (type) => OK_TYPE.test(String(type || ''));

export const fileSizeLabel = (bytes) => {
  const n = Number(bytes) || 0;
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
};

/** Does this Category ask for an attachment (or "Not required")? `lists.fileCategories`, chosen by the user. */
export const categoryNeedsFile = (lists, cat) => !!cat && !!lists && Array.isArray(lists.fileCategories) && lists.fileCategories.includes(cat);

/** The lists with one Category switched on or off for the attachment rule. */
export function toggleFileCategory(lists, cat) {
  const now = Array.isArray(lists.fileCategories) ? lists.fileCategories : [];
  return { ...lists, fileCategories: now.includes(cat) ? now.filter((c) => c !== cat) : [...now, cat] };
}

/**
 * The message that stops Save, or '' when the task is fine: its Category asks for an attachment and the task has neither a
 * file nor "Not required".
 */
export function fileRuleMessage(task, lists) {
  if (!task || !categoryNeedsFile(lists, task.category)) return '';
  if (task.filesNotRequired) return '';
  if (cleanFiles(task.files).length) return '';
  return `Attach a PDF or an image, or tick "Not required" (needed under ${task.category}).`;
}
