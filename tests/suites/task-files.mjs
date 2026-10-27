import { cleanFiles, categoryNeedsFile, toggleFileCategory, fileRuleMessage, fitsFiles, filesChars, MAX_FILES_CHARS } from '../../src/taskFiles.js';
import { normalizeSheetTask, toWebTask } from '../../src/cloudSync.js';

const PDF = 'data:application/pdf;base64,JVBERi0xLjQK';

export async function run({ ck, section }) {
  section('Task files: PDF / image attachments, "Not required", and the categories that ask for one');
  ck('only PDF and image data URLs are kept', cleanFiles([{ id: 'a', name: 'a.pdf', data: PDF }, { id: 'b', name: 'b.exe', data: 'data:application/x-msdownload;base64,AA' }, { name: 'c', data: 'http://x' }]).length === 1);
  const lists = { fileCategories: ['Payments'] };
  ck('a category that asks for a file', categoryNeedsFile(lists, 'Payments') && !categoryNeedsFile(lists, 'Audit') && !categoryNeedsFile({}, 'Payments'));
  ck('toggling a category adds and removes it', toggleFileCategory(lists, 'Audit').fileCategories.join() === 'Payments,Audit' && toggleFileCategory(lists, 'Payments').fileCategories.length === 0);
  ck('Save is refused with no file and no "Not required"', /Attach a PDF or an image/.test(fileRuleMessage({ category: 'Payments', files: [] }, lists)));
  ck('a file satisfies it', fileRuleMessage({ category: 'Payments', files: [{ id: 'a', name: 'a.pdf', data: PDF }] }, lists) === '');
  ck('"Not required" satisfies it', fileRuleMessage({ category: 'Payments', files: [], filesNotRequired: true }, lists) === '');
  ck('another category is never refused', fileRuleMessage({ category: 'Audit', files: [] }, lists) === '');
  ck('the files of one task share a size budget', fitsFiles([], 1000) && !fitsFiles([{ data: 'x'.repeat(MAX_FILES_CHARS) }], 1) && filesChars([{ data: 'abc' }]) === 3);
  const blank = { id: 'x', title: '', keyPoints: [], done: false, binned: false, status: 'Pending', priority: 'Medium', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
  const entry = normalizeSheetTask({ id: 'w1', title: 'x', status: 'Pending', files: [{ id: 'a', name: 'a.pdf', type: 'application/pdf', size: 9, data: PDF }], filesNotRequired: true }, blank);
  ck('the phone keeps the website\'s files and "Not required"', !!entry && Array.isArray(entry.files) && entry.files.length === 1 && entry.filesNotRequired === true);
  const doc = toWebTask({ ...entry, id: 'w1' });
  ck('and sends them back unchanged', doc.files.length === 1 && doc.files[0].data === PDF && doc.filesNotRequired === true);
}
