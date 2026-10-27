import React from 'react';
import { View, Text, Alert, Platform, Pressable } from 'react-native';
import { Group, Item, Small, Row } from '../ui';
import { useTheme } from '../theme';
import { GradBox, GradIcon } from '../gradient';
import { clearPin } from '../appLock';
import { buildBackupExport, backupExportName, backupExportText } from '../backupExport';
import { downloadText } from '../links';
import { updateStatus, checkForPhoneUpdateResult, restartApp } from '../updateStatus';

// The More tab (phone layout): the dark profile card, Manage / Settings groups and the App updates card.
export default function WdMoreTab({ googleUser, waiting, realtimeError, binnedEntries, setTab, wd, data, update, doneCount = 0 }) {
  const t = useTheme();
  const who = googleUser?.displayName || (googleUser ? 'Signed in' : 'This device only');
  const sync = waiting ? 'Offline' : googleUser && realtimeError ? 'Sync error' : googleUser ? 'In sync' : 'Local';
  return (
    <View>
      {/* G: the profile card on the hero gradient, then the four colour tiles (Completed, Holidays, Links, Bin). */}
      <GradBox colors={t.grad.hero} radius={26} style={{ marginBottom: 14 }} contentStyle={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
        <View style={{ width: 50, height: 50, borderRadius: 17, backgroundColor: 'rgba(255,255,255,0.24)', alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: t.onTile, fontWeight: '800', fontSize: t.fs(22) }}>{String(googleUser?.displayName || googleUser?.email || 'W').trim().charAt(0).toUpperCase()}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text numberOfLines={1} style={{ color: t.onTile, fontWeight: '800', fontSize: t.fs(17) }}>{who}</Text>
          <Text numberOfLines={1} style={{ color: t.heroDim, fontWeight: '600', fontSize: t.fs(12.5) }}>{googleUser?.email || 'Sign in with Google under Config to sync'}</Text>
        </View>
        <View style={{ backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 }}>
          <Text style={{ color: t.onTile, fontWeight: '800', fontSize: t.fs(12) }}>{sync}</Text>
        </View>
      </GradBox>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 18 }}>
        {[['done', 'Completed', t.grad.green, doneCount, 'done'], ['calendar', 'Holidays', t.grad.orange, null, 'holidays'], ['link', 'Links', t.grad.blue, (wd.links || []).length, 'links'], ['trash', 'Bin', t.grad.red, binnedEntries.length, 'bin']].map(([icon, label, g, n, to]) => (
          <Pressable key={to} onPress={() => setTab(to)} accessibilityRole="button" accessibilityLabel={`${label}${n ? `, ${n}` : ''}`}
            style={({ pressed }) => [{ flex: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 20, backgroundColor: t.surface, opacity: pressed ? 0.85 : 1 }, t.lift]}>
            <GradIcon name={icon} colors={g} size={44} radius={15} />
            <Text numberOfLines={1} style={{ color: t.text, fontWeight: '800', fontSize: t.fs(12.5) }}>{label}</Text>
            {n != null && <Text style={{ color: t.textDim, fontWeight: '700', fontSize: t.fs(11.5), marginTop: -4 }}>{n}</Text>}
          </Pressable>
        ))}
      </View>
      <Group title="Settings">
        <Item first iconName="gear" tone="violet" label="Config" value="Alerts, look, lists" onPress={() => setTab('config')} />
        <Item iconName="download" tone="blue" label="Export a backup" value="All tasks (JSON)" last={Platform.OS === 'web'} onPress={async () => {
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
        {Platform.OS !== 'web' && <Item iconName="lock" tone="slate" label="App lock" value={data.settings?.appLock?.enabled ? 'On' : 'Off'} last onPress={() => {
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
        const check = async () => {
          const r = await checkForPhoneUpdateResult();
          // A new version waiting: the restart is offered right here.
          if (r.downloaded) Alert.alert('App updates', `${r.text} Restart to use it.`, [{ text: 'Later', style: 'cancel' }, { text: 'Restart now', onPress: restartApp }]);
          else Alert.alert('App updates', r.text);
        };
        return (
          <View>
            <View style={[{ backgroundColor: t.surface, borderWidth: t.dark ? 1 : 0, borderColor: t.border, borderRadius: t.radius, paddingVertical: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, t.lift]}>
              <GradIcon name="refresh" colors={t.grad.slate} size={38} radius={12} iconSize={19} glow={false} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: t.text, fontWeight: '800', fontSize: t.fs(14) }}>{!u ? 'App updates' : u.enabled ? 'App updates are on' : 'App updates are off'}</Text>
                <Text style={{ color: t.textDim, fontWeight: '600', fontSize: t.fs(13), lineHeight: t.fs(18) }}>{!u ? 'Updates are for the installed phone app.' : `Running ${u.running}${u.when ? ` · ${u.when}` : ''}${u.enabled && u.channel ? ` · ${u.channel}` : ''}`}</Text>
              </View>
              <GradBox colors={t.grad.brand} radius={12} onPress={check} accessibilityLabel="Check for an update now" glow={false} contentStyle={{ paddingVertical: 11, paddingHorizontal: 14 }}>
                <Text style={{ color: t.onTile, fontWeight: '800', fontSize: t.fs(13) }}>Check now</Text>
              </GradBox>
            </View>
            {!!u && <Text style={{ color: t.textDim, fontSize: t.fs(12.5), lineHeight: t.fs(18), fontWeight: '500', marginHorizontal: 6, marginTop: 8 }}>{u.enabled ? 'A new version is downloaded when the app opens; tap Restart in the bar that appears.' : 'This build was made without the update settings, so it cannot receive updates - a new APK build is needed.'}</Text>}
          </View>
        );
      })()}
    </View>
  );
}
