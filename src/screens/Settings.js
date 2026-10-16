import React, { useState } from 'react';
import { Text, Alert, AppState, Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { Screen, Small, Btn, Row, Sheet, Group, Item, Choices, Segmented } from '../ui';
import { trackerAvailable, isBatteryOptimised, requestBatteryExemption, openAppSettings, isExactAlarmAllowed, requestExactAlarmPermission } from '../tracker';
import { useTheme, THEMES, FONT_LEVELS } from '../theme';
import { useStore } from '../store';
import { listAutoBackups, readAutoBackup } from '../autoBackup';
import { exportBackup, pickBackup, applyBackup, unpackBackup } from '../backup';
import { cancelAll } from '../notify';
import { armTodaysReminders, syncEntryAlerts } from '../workingDashboardNotify';
import AppLockSettings from './AppLockSettings';
import { pinWidget } from '../widgets';
import { useWebUi } from '../appMode';

// Home-screen widgets are an Android feature; the browser build has none to set up.
const hasWidgets = Platform.OS === 'android';

/*
 * What a Working Dashboard backup holds. A full "My Personal Tracker" backup file restores here too: only its
 * Working Dashboard (and the theme / text size / app-lock settings) is taken from it.
 */
export const WD_BACKUP_SECTIONS = ['settings', 'workingDashboard'];

/** App-wide settings of the Working Dashboard app: security, appearance, alerts and backups. */
export default function Settings({ navigation }) {
  const [webUi, setWebUi] = useWebUi();
  const t = useTheme();
  const { data, update, replaceAll, flush } = useStore();

  const [batteryRestricted, setBatteryRestricted] = React.useState(false);
  const [notifGranted, setNotifGranted] = React.useState(true);
  const [notifCanAsk, setNotifCanAsk] = React.useState(true);
  const [exactAlarmAllowed, setExactAlarmAllowed] = React.useState(true);
  const [sheet, setSheet] = useState(null);       // 'theme' | 'text' | 'widgets' | 'oem' | null
  const [backupBusy, setBackupBusy] = useState(false);

  const refreshBattery = React.useCallback(() => { isBatteryOptimised().then(setBatteryRestricted); }, []);
  const refreshExactAlarm = React.useCallback(() => { isExactAlarmAllowed().then(setExactAlarmAllowed); }, []);
  const refreshNotifPermission = React.useCallback(() => {
    Notifications.getPermissionsAsync().then((r) => {
      setNotifGranted(r.status === 'granted');
      setNotifCanAsk(r.canAskAgain !== false);
    }).catch(() => {});
  }, []);
  React.useEffect(() => { refreshBattery(); refreshNotifPermission(); refreshExactAlarm(); }, [refreshBattery, refreshNotifPermission, refreshExactAlarm]);

  /** Re-check when the user comes back from the system settings screen. */
  React.useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') { refreshBattery(); refreshNotifPermission(); refreshExactAlarm(); } });
    return () => sub.remove();
  }, [refreshBattery, refreshNotifPermission, refreshExactAlarm]);

  /** Without it Android 12+ downgrades every scheduled alert to an inexact one, which Doze can delay. */
  const fixExactAlarm = async () => {
    const opened = await requestExactAlarmPermission();
    if (!opened) Alert.alert('Could not open that screen', 'Open Android Settings > Apps > Working Dashboard > Alarms & reminders and turn it on.');
  };

  const fixNotifications = async () => {
    if (notifCanAsk) {
      const r = await Notifications.requestPermissionsAsync();
      setNotifGranted(r.status === 'granted');
      setNotifCanAsk(r.canAskAgain !== false);
      if (r.status === 'granted') return;
    }
    Alert.alert(
      'Notifications are blocked',
      'Open this app\'s system settings and turn notifications on, or task alerts will stay silent.',
      [{ text: 'Not now' }, { text: 'Open app settings', onPress: () => openAppSettings() }],
    );
  };

  const fixBattery = async () => {
    const opened = await requestBatteryExemption();
    if (!opened) {
      Alert.alert(
        'Could not open that screen',
        'Open Android Settings > Apps > Working Dashboard > Battery and choose Unrestricted.',
        [{ text: 'Open app settings', onPress: () => openAppSettings() }, { text: 'OK' }],
      );
    }
  };

  const doExport = async () => {
    setBackupBusy(true);
    try {
      await flush();
      const { uri, shared } = await exportBackup(data, WD_BACKUP_SECTIONS);
      const markDone = () => update({ meta: { lastBackupAt: new Date().toISOString() } });
      if (!shared) {
        Alert.alert('Backup written inside the app only', `It isn't safe until it is copied off the phone.\n${uri}`);
        return;
      }
      Alert.alert('Did you save the backup?', 'Only answer Yes if you saved it to Drive, Files or another app.', [
        { text: 'No' },
        { text: 'Yes, saved', onPress: markDone },
      ]);
    } catch (e) { Alert.alert('Export failed', e.message); }
    finally { setBackupBusy(false); }
  };

  /** Takes only the Working Dashboard and settings from the file - also from a full My Personal Tracker backup. */
  const restore = async (backup, mode) => {
    setBackupBusy(true);
    try {
      const only = await unpackBackup({ ...backup, data: Object.fromEntries(WD_BACKUP_SECTIONS.filter((k) => backup?.data?.[k] !== undefined).map((k) => [k, backup.data[k]])) });
      if (!only.data.workingDashboard) throw new Error('This backup has no Working Dashboard in it.');
      const next = await replaceAll((cur) => applyBackup(cur, only, mode));
      const wd = next?.workingDashboard || {};
      await syncEntryAlerts(wd.entries || [], wd.alarmRingtone, wd.alerts).catch(() => {});
      Alert.alert(mode === 'merge' ? 'Merged' : 'Replaced', `${(wd.entries || []).length} entries are on this phone now.`);
    } catch (e) { Alert.alert('Restore failed', e.message); }
    finally { setBackupBusy(false); }
  };

  // The daily automatic backups kept on the phone (phone only): pick one to bring back.
  const [autoBackups, setAutoBackups] = useState([]);
  React.useEffect(() => { listAutoBackups().then(setAutoBackups).catch(() => {}); }, []);
  const doRestoreAuto = (b) => {
    Alert.alert(`Restore ${b.label}?`, 'Merge adds what is missing and keeps what is here; Replace puts the whole Working Dashboard back as it was that day.', [
      { text: 'Cancel' },
      { text: 'Merge', onPress: async () => restore(await readAutoBackup(b.name), 'merge') },
      { text: 'Replace', style: 'destructive', onPress: async () => restore(await readAutoBackup(b.name), 'replace') },
    ]);
  };

  const doImport = async () => {
    try {
      const backup = await pickBackup();
      if (!backup) return;
      Alert.alert('Restore backup', 'A Working Dashboard backup, or a full My Personal Tracker backup (only its Working Dashboard is taken). Merge with what is here, or replace it?', [
        { text: 'Cancel' },
        { text: 'Merge', onPress: () => restore(backup, 'merge') },
        { text: 'Replace', style: 'destructive', onPress: () => restore(backup, 'replace') },
      ]);
    } catch (e) { Alert.alert('Import failed', e.message); }
  };

  const st = data.settings;
  const fontName = ['Small', 'Normal', 'Large', 'Largest'][Number(st.fontLevel) - 1] || 'Normal';

  return (
    <Screen>
      <AppLockSettings />

      {Platform.OS === 'android' && (
        <Group title="Screens" footer="The app shows its own phone screens. The website screens need internet; switch to them to compare, and back here at any time.">
          <Item icon="🌐" color={t.accent} label="Show the website screens instead" value={webUi ? 'On' : 'Off'} onPress={() => { setWebUi(!webUi); if (!webUi) navigation.goBack(); }} last />
        </Group>
      )}

      <Group title="Appearance">
        <Item icon="🎨" color={t.pink} label="Theme" value={THEMES[st.theme]?.label || 'Pearl'} onPress={() => setSheet('theme')} />
        <Item icon="🔤" color={t.accent} label="Text size" value={fontName} onPress={() => setSheet('text')} last={!hasWidgets} />
        {hasWidgets && <Item icon="🧩" color={t.purple} label="Home-screen widgets" onPress={() => setSheet('widgets')} last />}
      </Group>

      <Group title="Alerts & permissions" footer={Platform.OS === 'android' ? 'Alarm sound, warnings and follow-ups are in Working Dashboard → Config. If alerts still arrive late, your phone may have its own battery manager (Xiaomi, Vivo, Oppo, Realme, OnePlus).' : undefined}>
        <Item icon="🔔" color={t.danger} label="Notifications" value={notifGranted ? 'On' : 'Off - tap to fix'} valueColor={notifGranted ? t.ok : t.danger} onPress={notifGranted ? undefined : fixNotifications} chevron={!notifGranted} />
        {Platform.OS === 'android' && (
          <Item icon="⏰" color={t.warn} label="Exact alarms" value={exactAlarmAllowed ? 'Allowed' : 'Off - tap to fix'} valueColor={exactAlarmAllowed ? t.ok : t.danger} onPress={exactAlarmAllowed ? undefined : fixExactAlarm} chevron={!exactAlarmAllowed} />
        )}
        {trackerAvailable() && <Item icon="🔋" color={t.ok} label="Battery" value={batteryRestricted ? 'Restricted - tap to fix' : 'Unrestricted'} valueColor={batteryRestricted ? t.danger : t.ok} onPress={batteryRestricted ? fixBattery : undefined} chevron={batteryRestricted} />}
        {Platform.OS === 'android' && <Item icon="📲" color={t.textDim} label="Phone battery managers" onPress={() => setSheet('oem')} />}
        <Item icon="🧹" color={t.textDim} label="Clear all scheduled alerts" onPress={async () => {
          await cancelAll();
          // The Working Dashboard's own alerts are what you asked for, not stuck alerts: book them again.
          const wd = data.workingDashboard || {};
          if (wd.reminders) await armTodaysReminders(wd.reminders, wd.alarmRingtone, wd.alerts).catch(() => {});
          await syncEntryAlerts(wd.entries || [], wd.alarmRingtone, wd.alerts).catch(() => {});
          Alert.alert('Cleared', 'Working Dashboard alerts were booked again.');
        }} last />
      </Group>

      <Group title="Data" footer={data.meta.lastBackupAt ? `Last backup ${new Date(data.meta.lastBackupAt).toLocaleString()}` : 'Entries also sync with the web app (Config → Realtime Sync / Cloud Sync). A backup file keeps everything else, such as settings and the activity log.'}>
        <Item icon="☁️" color={t.accent} label={backupBusy ? 'Backing up…' : 'Back up the Working Dashboard'} onPress={backupBusy ? undefined : doExport} />
        <Item icon="♻️" color={t.ok} label="Restore from a backup" onPress={backupBusy ? undefined : doImport} last />
      </Group>

      {Platform.OS !== 'web' && (
        <Group title="Automatic backups" footer="A backup is made on this phone once a day and the last 7 are kept - to roll back a wrong edit or a bad restore. They stay on this phone only; use 'Back up the Working Dashboard' above to keep a copy elsewhere.">
          {!autoBackups.length ? <Item icon="🗓" color={t.textDim} label="The first one is made soon after the app opens" last chevron={false} /> : autoBackups.map((b, i) => (
            <Item key={b.name} icon="🗓" color={t.accent} label={b.label} value={b.size ? `${Math.max(1, Math.round(b.size / 1024))} KB` : ''} onPress={() => doRestoreAuto(b)} last={i === autoBackups.length - 1} />
          ))}
        </Group>
      )}

      <Text style={{ color: t.textDim, fontSize: t.fs(12), textAlign: 'center', marginBottom: 30 }}>
        A backup from My Personal Tracker can be restored here: only its Working Dashboard is taken.
      </Text>

      <Sheet visible={sheet === 'theme'} onClose={() => setSheet(null)} title="Theme">
        <Small style={{ marginBottom: 6 }}>INTERFACE STYLE</Small>
        <Segmented options={[{ key: 'modern', label: Platform.OS === 'web' ? 'macOS style' : 'Modern' }, { key: 'classic', label: 'Classic' }]} value={st.uiMode === 'classic' ? 'classic' : 'modern'} onChange={(k) => update({ settings: { uiMode: k } })} style={{ marginBottom: 16 }} />
        <Small style={{ marginBottom: 6 }}>COLOURS</Small>
        <Choices options={Object.values(THEMES).map((th) => [th.key, th.label])} value={st.theme} onChange={(k) => { update({ settings: { theme: k } }); setSheet(null); }} />
      </Sheet>

      <Sheet visible={sheet === 'text'} onClose={() => setSheet(null)} title="Text size">
        <Choices options={Object.keys(FONT_LEVELS).map((lvl) => [lvl, ['Small', 'Normal', 'Large', 'Largest'][Number(lvl) - 1]])} value={st.fontLevel} onChange={(k) => { update({ settings: { fontLevel: Number(k) } }); setSheet(null); }} />
      </Sheet>

      <Sheet visible={sheet === 'widgets'} onClose={() => setSheet(null)} title="Home-screen widgets">
        <Small style={{ marginBottom: 10 }}>See what is overdue, due today and next without opening the app. Tap a widget to open the Working Dashboard; tap an entry's circle to tick it off.</Small>
        <Row style={{ flexWrap: 'wrap', gap: 8 }}>
          {[['WorkSummaryWidget', '💼 Work summary'], ['WorkTodayWidget', '📋 Work today'], ['WorkNextWidget', '⏰ Next up']].map(([wname, label]) => (
            <Btn
              key={wname}
              kind="soft"
              title={`+ ${label}`}
              onPress={async () => {
                if (!(await pinWidget(wname))) Alert.alert('Add it from the home screen', 'Long-press an empty spot on your home screen, tap Widgets, then find Working Dashboard.');
              }}
            />
          ))}
        </Row>
      </Sheet>

      <Sheet visible={sheet === 'oem'} onClose={() => setSheet(null)} title="Phone battery managers">
        <Small>
          On Xiaomi, Vivo, Oppo, Realme or OnePlus phones there is usually a second, separate battery manager that these
          switches can't reach or check. Look for an “Autostart” or “App battery saver” setting for this app (often under
          Settings &gt; Apps &gt; Manage apps &gt; Working Dashboard, or in a separate “Security” / “Phone Manager” app) and
          allow it there too. This is the most common reason alerts still go quiet even with everything else allowed.
        </Small>
        <Btn style={{ marginTop: 12 }} kind="soft" title="Open app settings" onPress={() => openAppSettings()} />
      </Sheet>

    </Screen>
  );
}
