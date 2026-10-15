import React, { useEffect, useState } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { View, Text, ScrollView, Pressable, Share, Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as Notifications from 'expo-notifications';
import { KEY, SLICES, assemble, readStored, writeStored, storedKeysOf } from './storeCore';
import { buildBackup } from './backup';
// Not used by this app; kept so "Erase everything" also clears it on a phone where it was ever written.
const TODO_KEY = 'MPT_TODOS_V1';

/**
 * Catches a render crash and offers a way out.
 *
 * All of this app's data lives on the phone, so "the app won't open" is very
 * close to "the data is gone". A malformed imported row, a null in a chart
 * series or a bad restore used to white-screen everything with no recovery.
 * Here the user can at least get their data out before resetting anything,
 * and reset is offered in increasing order of destructiveness.
 */
/**
 * The boundary renders outside ThemeProvider (a crash may have come from it),
 * so these few values are literal by necessity rather than by neglect.
 */
const AMBER = '#B45309';
const RED = '#DC2626';
const GREEN = '#16A34A';
const BLUE = '#2563EB';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, exported: false, exportError: null, busy: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Kept in state rather than logged away, so the user can send it on.
    this.setState({ info });
    console.warn('Render crash:', error?.message, info?.componentStack);
  }

  reset = () => this.setState({ error: null, info: null });

  /**
   * Export first. Always offered before any destructive option.
   *
   * Written to a file and shared as one: the whole history as share-sheet text
   * passed Android's ~1 MB limit after about a year of use, the share failed,
   * and the clearing options below stayed locked for good. A value that is not
   * valid JSON - often the very reason for the crash - is exported as the text
   * it is rather than failing the whole export. The file has the shape of a
   * Settings backup, so Restore can read it back once the app opens again.
   */
  exportData = async () => {
    this.setState({ busy: true, exportError: null });
    try {
      const pairs = await readStored([KEY, ...SLICES.map((s) => s.key), TODO_KEY]);
      const stored = {}; const unreadable = {};
      for (const [k, v] of pairs) {
        if (v == null) continue;
        try { stored[k] = JSON.parse(v); } catch { unreadable[k] = v; }
      }
      let data = null;
      try {
        const todos = stored[TODO_KEY];
        data = buildBackup({ ...assemble(stored[KEY], stored), todos: Array.isArray(todos?.items) ? { items: todos.items, completions: todos.completions || [] } : undefined }).data;
      } catch { /* kept as stored, below */ }
      const json = JSON.stringify({
        app: 'My_Personal_Tracker',
        exportedAt: new Date().toISOString(),
        reason: 'crash-recovery',
        error: String(this.state.error?.message || this.state.error),
        data: data || {},
        ...(data ? {} : { stored }),
        ...(Object.keys(unreadable).length ? { unreadable } : {}),
      });
      const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
      if (dir && await Sharing.isAvailableAsync()) {
        const uri = `${dir}working-dashboard-crash-export-${Date.now()}.json`;
        await FileSystem.writeAsStringAsync(uri, json, { encoding: 'utf8' });
        await Sharing.shareAsync(uri, { mimeType: 'application/json', dialogTitle: 'Save Working Dashboard data' });
      } else {
        await Share.share({ title: 'Working Dashboard data export', message: json });
      }
      this.setState({ exported: true });
    } catch (e) {
      console.warn('Export failed', e?.message);
      // Said on screen, and the options below open anyway: a phone that cannot export (no space left)
      // was otherwise stuck on this screen with only "erase the app's data" in Android settings left.
      this.setState({ exportError: e?.message || 'The export could not be written.' });
    } finally {
      this.setState({ busy: false });
    }
  };

  /** Every clearing option asks first: none of them can be undone. */
  confirm = (title, message, run) => Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Clear', style: 'destructive', onPress: run },
  ]);

  /**
   * Clears only the collection most likely to hold the bad row, keeping
   * settings, people and configuration intact.
   */
  clearSlice = async (sliceKey) => {
    this.setState({ busy: true });
    try {
      const slice = SLICES.find((s) => s.key === sliceKey);
      await writeStored([[sliceKey, JSON.stringify(slice?.empty ?? [])]]);   // also removes its pieces
      this.reset();
    } catch (e) {
      console.warn('Clear failed', e?.message);
    } finally {
      this.setState({ busy: false });
    }
  };

  wipeAll = async () => {
    this.setState({ busy: true });
    try {
      // The to-do list too: it is stored apart, and "erase everything" used to leave it (and its alarms) behind.
      await AsyncStorage.multiRemove(await storedKeysOf([KEY, ...SLICES.map((s) => s.key), TODO_KEY]));
      await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
      this.reset();
    } catch (e) {
      console.warn('Wipe failed', e?.message);
    } finally {
      this.setState({ busy: false });
    }
  };

  render() {
    const { error, exported, exportError, busy } = this.state;
    const unlocked = exported || !!exportError;
    if (!error) return this.props.children;

    const Btn = ({ title, onPress, tone = BLUE, disabled }) => (
      <Pressable
        onPress={onPress}
        disabled={disabled || busy}
        style={{
          backgroundColor: disabled || busy ? '#9CA3AF' : tone,
          paddingVertical: 13, paddingHorizontal: 16, borderRadius: 12, marginTop: 10,
        }}
      >
        <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>{title}</Text>
      </Pressable>
    );

    return (
      <View style={{ flex: 1, backgroundColor: '#0B1220', paddingTop: Platform.OS === 'ios' ? 60 : 40 }}>
        <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 60 }}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>🛠️</Text>
          <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>Something broke</Text>
          <Text style={{ color: '#9AA6BF', marginTop: 8, lineHeight: 20 }}>
            The screen failed to draw. Your data is still on the phone. Export it first, then try
            the smallest fix that works.
          </Text>

          <View style={{ backgroundColor: '#131C2E', borderRadius: 12, padding: 12, marginTop: 16 }}>
            <Text style={{ color: '#FF8A8A', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 }}>
              {String(error?.message || error)}
            </Text>
          </View>

          <Btn title={exported ? 'Exported ✓  Export again' : '1. Export my data'} onPress={this.exportData} tone={GREEN} />
          {!!exportError && (
            <Text style={{ color: '#FF8A8A', fontSize: 12, marginTop: 8 }}>
              Export failed: {exportError}. Try again; the options below are open anyway, but what they clear cannot be brought back.
            </Text>
          )}

          <Text style={{ color: '#9AA6BF', marginTop: 20, fontWeight: '700' }}>2. Try again</Text>
          <Btn title="Reload the screen" onPress={this.reset} />

          <Text style={{ color: '#9AA6BF', marginTop: 20, fontWeight: '700' }}>
            3. Still broken? Clear one collection
          </Text>
          <Text style={{ color: '#6B7A99', fontSize: 12, marginTop: 4 }}>
            Settings, categories and accounts are kept. Only the chosen history is removed.
          </Text>
          {/* Driven by the slice table, so adding a collection adds a button. */}
          {SLICES.filter((s) => s.key === 'MPT_WD_ENTRIES_V1').map((s) => (
            <Btn
              key={s.key}
              title={`Clear ${s.label.toLowerCase()}`}
              onPress={() => this.confirm(`Clear ${s.label.toLowerCase()}?`, 'Everything in it is removed from this phone.', () => this.clearSlice(s.key))}
              tone={AMBER}
              disabled={!unlocked}
            />
          ))}

          <Text style={{ color: '#9AA6BF', marginTop: 20, fontWeight: '700' }}>4. Last resort</Text>
          <Btn
            title="Erase everything and start over"
            onPress={() => this.confirm('Erase everything?', 'All of this app\'s data on this phone is removed, as on a fresh install.', this.wipeAll)}
            tone={RED}
            disabled={!unlocked}
          />
          {!unlocked && (
            <Text style={{ color: '#6B7A99', fontSize: 12, marginTop: 8 }}>
              Export your data to unlock the clearing options.
            </Text>
          )}
        </ScrollView>
      </View>
    );
  }
}

/**
 * Shown by the store instead of the app when the saved data cannot be read.
 * It used to start with empty data instead, and the first edit then saved
 * those empty defaults over every collection on the phone. Nothing is written
 * while this is up.
 */
export function LoadFailed({ message, onRetry }) {
  const [busy, setBusy] = useState(false);
  // App.js hides the splash only once the store is ready, which never happens here.
  useEffect(() => { SplashScreen.hideAsync().catch(() => {}); }, []);
  return (
    <View style={{ flex: 1, backgroundColor: '#0B1220', justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 40, marginBottom: 12 }}>🔒</Text>
      <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800' }}>Your data couldn't be opened</Text>
      <Text style={{ color: '#9AA6BF', marginTop: 8, lineHeight: 20 }}>
        Nothing has been changed or deleted. Try again, or close the app fully and reopen it.
      </Text>
      <View style={{ backgroundColor: '#131C2E', borderRadius: 12, padding: 12, marginTop: 16 }}>
        <Text style={{ color: '#FF8A8A', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 }}>{message}</Text>
      </View>
      <Pressable
        disabled={busy}
        onPress={async () => { setBusy(true); try { await onRetry(); } finally { setBusy(false); } }}
        style={{ backgroundColor: busy ? '#9CA3AF' : BLUE, paddingVertical: 13, paddingHorizontal: 16, borderRadius: 12, marginTop: 16 }}
      >
        <Text style={{ color: '#fff', fontWeight: '700', textAlign: 'center' }}>{busy ? 'Trying…' : 'Try again'}</Text>
      </Pressable>
    </View>
  );
}
