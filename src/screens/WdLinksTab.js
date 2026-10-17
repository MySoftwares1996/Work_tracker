import React from 'react';
import { View, Text, Alert, Pressable, Linking, Platform } from 'react-native';
import { Card, Small, Btn, Row, Field } from '../ui';
import { useTheme } from '../theme';
import { newId } from '../ids';
import { normalizeLink, linkFolders, parseBookmarks, bookmarksHtml, addLinks, downloadText, pickTextFile } from '../links';
import { CardGrid } from './wdCards';

// The Links tab (both platforms). Split out of WorkingDashboard.js unchanged; the draft / folder / search state stays in the parent so it survives a tab switch.
export default function WdLinksTab({ wd, setTools, linkDraft, setLinkDraft, linkFolder, setLinkFolder, linkFind, setLinkFind }) {
  const t = useTheme();
  return (
    <View>
      <Card>
        <Text style={{ color: t.accent, fontWeight: '800', fontSize: t.fs(13), marginBottom: 2 }}>USEFUL LINKS</Text>
        <Small style={{ marginBottom: 10 }}>Keep the links you use. A click opens the link in a new tab of your default browser.</Small>
        <Row gap={10} style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <View style={{ flex: 1, minWidth: 180 }}><Field label="NAME" value={linkDraft.title} onChangeText={(v) => setLinkDraft((d) => ({ ...d, title: v }))} placeholder="e.g. ICEGATE" /></View>
          <View style={{ flex: 1, minWidth: 140 }}><Field label="FOLDER (optional)" value={linkDraft.folder} onChangeText={(v) => setLinkDraft((d) => ({ ...d, folder: v }))} placeholder="e.g. Bank portals" /></View>
          <View style={{ flex: 2, minWidth: 240 }}><Field label="LINK" value={linkDraft.url} onChangeText={(v) => setLinkDraft((d) => ({ ...d, url: v }))} placeholder="https://..." autoCapitalize="none" /></View>
          <Btn style={{ marginBottom: 12 }} title={linkDraft.id ? 'Save' : 'Add link'} onPress={() => {
            const url = normalizeLink(linkDraft.url);
            if (!url) return Alert.alert('Enter a link', 'Type a web address such as https://example.com');
            const title = linkDraft.title.trim() || url.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/.*$/, '');
            const folder = linkDraft.folder.trim();
            setTools((w) => {
              const list = Array.isArray(w.links) ? w.links : [];
              const row = { title, url, ...(folder ? { folder } : {}) };
              return { ...w, links: linkDraft.id ? list.map((x) => (x.id === linkDraft.id ? { id: x.id, ...row } : x)) : [...list, { id: newId('lnk-'), ...row }] };
            });
            setLinkDraft({ id: '', title: '', url: '', folder: '' });
          }} />
          {!!linkDraft.id && <Btn style={{ marginBottom: 12 }} kind="soft" title="Cancel" onPress={() => setLinkDraft({ id: '', title: '', url: '', folder: '' })} />}
        </Row>
      </Card>
      <Row gap={8} style={{ marginTop: 10, flexWrap: 'wrap' }}>
        <Btn kind="soft" title="⬇ Import bookmarks" style={Platform.OS === 'web' ? undefined : { display: 'none' }} onPress={async () => {
          const text = await pickTextFile();
          if (!text) return;
          const found = parseBookmarks(text);
          if (!found.length) return Alert.alert('No links found', 'Pick a bookmarks file exported from your browser (HTML) or from this tab.');
          const res = addLinks(wd.links, found);
          setTools((w) => ({ ...w, links: addLinks(w.links, found).links }));
          Alert.alert('Imported', `${res.added} new link${res.added === 1 ? '' : 's'} added (${found.length - res.added} already here).`);
        }} />
        {Platform.OS === 'web' && !!(wd.links || []).length && <Btn kind="soft" title="⬆ Export" onPress={() => downloadText('working-dashboard-links.html', bookmarksHtml(wd.links))} />}
        {!!linkFolder && <Btn kind="soft" title={`Open all in ${linkFolder}`} onPress={() => (wd.links || []).filter((x) => x.folder === linkFolder).forEach((x) => Linking.openURL(x.url))} />}
      </Row>
      {linkFolders(wd.links).length > 0 && (
        <Row gap={6} style={{ marginTop: 10, flexWrap: 'wrap' }}>
          {['', ...linkFolders(wd.links)].map((f) => (
            <Pressable key={f || 'all'} onPress={() => setLinkFolder(f)} style={{ paddingVertical: 5, paddingHorizontal: 12, borderRadius: 999, backgroundColor: linkFolder === f ? t.accent : t.surfaceAlt }}>
              <Text style={{ color: linkFolder === f ? t.onAccent : t.text, fontWeight: '700', fontSize: t.fs(12.5) }}>{f || 'All'}</Text>
            </Pressable>
          ))}
        </Row>
      )}
      {(wd.links || []).length > 6 && <Field style={{ marginTop: 10 }} value={linkFind} onChangeText={setLinkFind} placeholder="🔍 Search links..." />}
      <CardGrid>
        {(wd.links || []).filter((x) => (!linkFolder || x.folder === linkFolder) && (!linkFind.trim() || `${x.title} ${x.url} ${x.folder || ''}`.toLowerCase().includes(linkFind.trim().toLowerCase()))).map((x) => (
          <Card key={x.id}>
            <Pressable onPress={() => Linking.openURL(x.url)} accessibilityRole="link" accessibilityLabel={`Open ${x.title}`}>
              <Text style={{ color: t.accent, fontWeight: '800', fontSize: t.fs(15) }} numberOfLines={1}>{x.title}</Text>
              <Small numberOfLines={1}>{x.folder ? `${x.folder} · ` : ''}{x.url}</Small>
            </Pressable>
            <Row gap={8} style={{ marginTop: 8 }}>
              <Btn kind="soft" title="Open" onPress={() => Linking.openURL(x.url)} />
              <Btn kind="soft" title="Edit" onPress={() => setLinkDraft({ id: x.id, title: x.title, url: x.url, folder: x.folder || '' })} />
              <Btn kind="soft" title="Delete" onPress={() => setTools((w) => ({ ...w, links: (w.links || []).filter((y) => y.id !== x.id) }))} />
            </Row>
          </Card>
        ))}
      </CardGrid>
      {!(wd.links || []).length && <Small style={{ marginTop: 10 }}>No links yet - add the first one above.</Small>}
    </View>
  );
}
