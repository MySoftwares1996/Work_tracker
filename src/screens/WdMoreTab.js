import React from 'react';
import { View, Text, Alert, Platform } from 'react-native';
import { Group, Item, Card, Small, Row } from '../ui';
import { useTheme } from '../theme';
import { clearPin } from '../appLock';
import { buildBackupExport, backupExportName, backupExportText } from '../backupExport';
import { downloadText } from '../links';
import { updateStatus, checkForPhoneUpdate } from '../updateStatus';

// The More tab (phone layout): account card, Manage / Settings groups and the App updates panel. Split out of WorkingDashboard.js unchanged.
export default function WdMoreTab({ googleUser, waiting, realtimeError, binnedEntries, setTab, wd, data, update }) {
  const t = useTheme();
  return (
    <View>
      <Card style={{ marginBottom: 14 }}>
        <Row gap={12} style={{ alignItems: 'center' }}>
          <View style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: t.onAccent, fontWeight: '800', fontSize: t.fs(19) }}>{String(googleUser?.displayName || googleUser?.email || 'W').trim().charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text numberOfLines={1} style={{ color: t.text, fontWeight: '800', fontSize: t.fs(16) }}>{googleUser?.displayName || (googleUser ? 'Signed in' : 'This device only')}</Text>
            <Small numberOfLines={1}>{googleUser?.email || 'Sign in with Google under Config to sync'}</Small>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.surfaceAlt, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: waiting ? t.warn : googleUser && realtimeError ? t.danger : googleUser ? t.ok : t.textDim }} />
            <Text style={{ color: t.textDim, fontWeight: '700', fontSize: t.fs(12) }}>{waiting ? 'offline' : googleUser && realtimeError ? 'sync error' : googleUser ? 'in sync' : 'local'}</Text>
          </View>
        </Row>
      </Card>
      <Group title="Manage">
        <Item icon="📅" color={t.accent} label="Holidays & leave" onPress={() => setTab('holidays')} />
        <Item icon="🔗" color={t.accent2} label="Links" onPress={() => setTab('links')} />
        <Item icon="🗑" color={t.danger} label="Bin" value={binnedEntries.length ? `${binnedEntries.length}` : undefined} onPress={() => setTab('bin')} last />
      </Group>
      <Group title="Settings">
        <Item icon="⚙️" color={t.textDim} label="Config" onPress={() => setTab('config')} />
        <Item icon="💾" color={t.ok} label="Export a backup" value="All tasks (JSON)" last={Platform.OS === 'web'} onPress={async () => {
          try {
            const name = backupExportName();
            const text = backupExportText(buildBackupExport({ entries: wd.entries, lists: wd, links: wd.links, templates: wd.templates, reportFormats: wd.reportFormats, holidays: wd.holidays, leaveDays: wd.leaveDays, source: Platform.OS === 'web' ? 'web' : 'phone' }));
            if (Platform.OS === 'web') { downloadText(name, text, 'application/json'); return; }
            // The file is written to the app's cache and handed to the share sheet (Drive, mail, Files); expo-file-system and expo-sharing are already in the build.
            const FileSystem = await import('expo-file-system/legacy');
            const Sharing = await import('expo-sharing');
            const uri = `${FileSystem.cacheDirectory}${name}`;
            await FileSystem.writeAsStringAsync(uri, text);
            if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Export a backup' });
            else Alert.alert('Backup saved', `Saved as ${name}, but this phone cannot share files.`);
          } catch (e) { Alert.alert('Backup failed', String(e?.message || e)); }
        }} />
        {Platform.OS !== 'web' && <Item icon="🔒" color={t.accent} label="App lock" value={data.settings?.appLock?.enabled ? 'On' : 'Off'} last onPress={() => {
          if (data.settings?.appLock?.enabled) {
            Alert.alert('App lock', 'Turn the PIN lock off?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Turn off', style: 'destructive', onPress: async () => { try { await clearPin(); } catch (e) { /* secure storage refused: the lock still goes off */ } update({ settings: { appLock: { enabled: false, biometric: false, setupDone: true } } }); } },
            ]);
          } else update({ settings: { appLock: { enabled: true, biometric: false, setupDone: true } } });   // the lock gate asks for a PIN
        }} />}
      </Group>
      {(() => {
        // The phone's own updates: whether this build can receive them, which version is running, and a button to look now (always here).
        const u = updateStatus();
        return (
          <Group title="App updates" footer={!u ? 'Updates are for the installed phone app.' : u.enabled ? 'A new version is downloaded when the app opens; tap Restart in the bar that appears.' : 'This build was made without the update settings, so it cannot receive updates - a new APK build is needed.'}>
            {!!u && <Item icon="🔄" color={u.enabled ? t.ok : t.danger} label="Updates" value={u.enabled ? `On${u.channel ? ` · ${u.channel}` : ''}` : 'Off'} />}
            {!!u && <Item icon="📦" color={t.textDim} label="Running" value={`${u.running}${u.when ? ` · ${u.when}` : ''}`} />}
            <Item icon="🔎" color={t.accent} label="Check for an update now" onPress={async () => Alert.alert('App updates', await checkForPhoneUpdate())} last />
          </Group>
        );
      })()}
    </View>
  );
}
