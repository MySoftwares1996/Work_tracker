import React, { useState } from 'react';
import { View, Text, Pressable, Platform, Alert } from 'react-native';
import { useTheme } from '../theme';
import { Btn, Small, Chip, Toggle } from '../ui';
import { cleanFiles, filesChars, fitsFiles, isFileType, fileSizeLabel, MAX_FILES_CHARS } from '../taskFiles';

/** Reads one picked file as a data URL (a browser File on the web, base64 from the cache file on the phone). */
async function readAsset(a) {
  if (Platform.OS === 'web' && a.file) {
    return new Promise((resolve, reject) => { const r = new globalThis.FileReader(); r.onload = () => resolve(String(r.result)); r.onerror = () => reject(new Error('read')); r.readAsDataURL(a.file); });
  }
  const FileSystem = await import('expo-file-system/legacy');
  const b64 = await FileSystem.readAsStringAsync(a.uri, { encoding: 'base64' });
  return `data:${a.mimeType};base64,${b64}`;
}

/** Choose PDFs / images and add them to the task: [{ files }] or [{ error }]. Photos are not shrunk on the phone, so a big one is refused. */
export async function pickTaskFiles(have) {
  let picker;
  try { picker = await import('expo-document-picker'); } catch { return { error: 'Choosing files needs the next app build.' }; }
  let res;
  try { res = await picker.getDocumentAsync({ type: ['application/pdf', 'image/*'], multiple: true, copyToCacheDirectory: true }); } catch { return { error: 'Choosing files is not available in this build yet.' }; }
  if (!res || res.canceled) return {};
  let files = have || [];
  const errors = [];
  for (const a of res.assets || []) {
    const name = a.name || 'file';
    if (!isFileType(a.mimeType)) { errors.push(`${name}: only PDF and image files can be attached.`); continue; }
    try {
      const data = await readAsset(a);
      if (!fitsFiles(files, data.length)) { errors.push(`${name} is too big: the files of one task may total about ${fileSizeLabel(MAX_FILES_CHARS * 0.75)}. Use a smaller PDF or a smaller photo or screenshot.`); continue; }
      files = [...files, { id: `f${Date.now().toString(36)}${files.length}`, name, type: a.mimeType.toLowerCase(), size: Math.round(data.length * 0.75), data }];
    } catch { errors.push(`${name} could not be read.`); }
  }
  return { files, error: errors.join('\n') };
}

/** The entry form's attachment sheet: the attached files, a Choose button and "Not required". */
export function FilesPanel({ entry, setEntry, needed }) {
  const t = useTheme();
  const [busy, setBusy] = useState(false);
  const files = cleanFiles(entry.files);
  const add = async () => {
    setBusy(true);
    const r = await pickTaskFiles(files);
    setBusy(false);
    if (r.error) Alert.alert('Attachment', r.error);
    if (r.files) setEntry({ ...entry, files: r.files, filesNotRequired: false });
  };
  return (
    <View>
      {needed && <Small style={{ marginBottom: 10 }}>This Category asks for an attachment: attach a PDF or an image, or choose "Not required".</Small>}
      {files.map((f) => (
        <View key={f.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 }}>
          <Text style={{ flex: 1, color: t.text, fontWeight: '700', fontSize: t.fs(14) }} numberOfLines={2}>{f.name} <Text style={{ color: t.textDim, fontWeight: '600' }}>{fileSizeLabel(f.size)}</Text></Text>
          <Pressable onPress={() => setEntry({ ...entry, files: files.filter((x) => x.id !== f.id) })} accessibilityRole="button" accessibilityLabel={`Remove ${f.name}`} hitSlop={8}>
            <Text style={{ color: t.danger, fontWeight: '800', fontSize: t.fs(13) }}>Remove</Text>
          </Pressable>
        </View>
      ))}
      <Btn kind="soft" title={busy ? 'Adding...' : 'Choose PDF or image'} disabled={busy} onPress={add} style={{ marginTop: 6 }} />
      <Small style={{ marginTop: 8 }}>Used {fileSizeLabel(filesChars(files) * 0.75)} of {fileSizeLabel(MAX_FILES_CHARS * 0.75)}. The files stay inside the task.</Small>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 }}>
        <Text style={{ color: t.text, fontWeight: '700', fontSize: t.fs(14) }}>Not required</Text>
        <Toggle label="Attachment not required" value={!!entry.filesNotRequired} onChange={(v) => setEntry({ ...entry, filesNotRequired: v && !files.length })} />
      </View>
    </View>
  );
}

/** Config > Attachments: the categories that must have a PDF / image (or "Not required") before a task can be saved. */
export function FileCategories({ wd, save }) {
  const t = useTheme();
  const cur = Array.isArray(wd.fileCategories) ? wd.fileCategories : [];
  return (
    <View>
      <Small style={{ marginBottom: 10 }}>Choose the categories whose tasks must have a PDF or an image attached, or "Not required" ticked, before they can be saved. The other categories may still attach files.</Small>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(wd.categories || []).map((c) => { const on = cur.includes(c); return <Chip key={c} label={c} on={on} onPress={() => save({ fileCategories: on ? cur.filter((x) => x !== c) : [...cur, c] })} />; })}
      </View>
      {!(wd.categories || []).length && <Small style={{ color: t.textDim }}>Add categories first (Entry form options).</Small>}
    </View>
  );
}
