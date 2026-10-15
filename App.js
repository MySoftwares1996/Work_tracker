import './src/platformSetup';     // browser-only set-up (platformSetup.web.js); nothing on the phone
import React, { useEffect, useMemo, useRef } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { NavigationContainer, DefaultTheme, DarkTheme, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { View, Text, Pressable, Platform, Alert, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';

import { StoreProvider, useStore } from './src/store';
import ErrorBoundary from './src/ErrorBoundary';
import AppLockGate from './src/AppLockGate';
import { ThemeProvider, useTheme, SPLASH } from './src/theme';
import { initNotifications, addResponseListener, dismissEntryNotifications } from './src/notify';
import { refreshWidgets } from './src/widgets';
import { armTodaysReminders, syncEntryAlerts, entryIdOfAlarm, wdAlarmId, snoozeNudge, armWeeklySummary } from './src/workingDashboardNotify';
import { setAlertOffDays } from './src/workingDashboard';
import { setLiveWdUpdater, handleWdAction, registerWdRefresh, refreshWdAlerts, snoozeMinutesOf } from './src/workingDashboardActions';
import { trackerAvailable, isExactAlarmAllowed, requestExactAlarmPermission, shouldWarnExactAlarmOnce, consumeInitialAlarmAction, consumeSharedText, getRingingTask } from './src/tracker';
import RealtimeSync from './src/RealtimeSync';
import WebAlarmHost from './src/WebAlarm';
import NewVersion from './src/NewVersion';
import { useRealtimeStatus, setRealtimeStatus } from './src/realtimeStatus';
import { watchAuthState } from './src/firebaseSync';
import { needsWelcome } from './src/account';
import { runAutoBackup } from './src/autoBackup';

import Settings from './src/screens/Settings';
import PastDueAlert from './src/screens/PastDueAlert';
import WorkingDashboard from './src/screens/WorkingDashboard';
import Welcome from './src/screens/Welcome';
import AnimatedLogo from './src/AnimatedLogo';

/**
 * Working Dashboard as an app of its own: the same screens, alerts, widgets and web-app sync as the
 * Working Dashboard tool inside My Personal Tracker, opening straight on it.
 */
const Stack = createNativeStackNavigator();

// Lets the header buttons below call navigate()/goBack() the same way every screen already does.
const navRef = createNavigationContainerRef();

// Who is signed in, known as early as possible: the first screen (sign-in or dashboard) depends on it.
try { watchAuthState((u) => setRealtimeStatus({ user: u, authKnown: true })); } catch { setRealtimeStatus({ authKnown: true }); }

// Must run at module scope, before anything renders, or the OS auto-hides the splash the instant the JS bundle starts.
SplashScreen.preventAutoHideAsync().catch(() => {});
try { if (SplashScreen.setOptions) SplashScreen.setOptions({ duration: 300, fade: true }); } catch { /* older native module */ }

let splashHidden = false;
/** Hides the splash once, on the frame after real content has painted. */
function hideSplashOnce() {
  if (splashHidden) return;
  splashHidden = true;
  requestAnimationFrame(() => { SplashScreen.hideAsync().catch(() => {}); });
}

/** iOS renders "‹ Back" (chevron + label), not Android's bare arrow glyph. */
function BackButton({ canGoBack, tintColor }) {
  const t = useTheme();
  if (!canGoBack) return null;
  return (
    <Pressable onPress={() => navRef.isReady() && navRef.goBack()} hitSlop={10} style={{ flexDirection: 'row', alignItems: 'center', paddingRight: 8 }}>
      <Text style={{ color: tintColor || t.accent, fontSize: 26, fontWeight: '400', marginRight: 2, marginTop: -2 }}>‹</Text>
      <Text style={{ color: tintColor || t.accent, fontSize: t.fs(17) }}>Back</Text>
    </Pressable>
  );
}

/** ⚙ in the Working Dashboard's header: the app's own settings (app lock, theme, text size, alerts, backups). */
function SettingsButton({ tintColor }) {
  const t = useTheme();
  return (
    <Pressable onPress={() => navRef.isReady() && navRef.navigate('Settings')} hitSlop={10} accessibilityRole="button" accessibilityLabel="Settings" style={{ paddingLeft: 8, paddingRight: Platform.OS === 'web' ? 16 : 0 }}>
      <Text style={{ color: tintColor || t.accent, fontSize: t.fs(22) }}>⚙</Text>
    </Pressable>
  );
}

function Root() {
  const { data, ready, update } = useStore();
  const t = useTheme();
  // Someone not signed in (and who has not chosen to use the device without an account) sees the sign-in screen.
  const realtime = useRealtimeStatus();
  const showWelcome = needsWelcome(realtime, data.workingDashboard);
  // On a device that has never signed in, wait a moment for Firebase to say whether anyone is signed in, rather
  // than flash the dashboard before the sign-in screen. Never longer than 3 s (offline).
  const [authWaitOver, setAuthWaitOver] = React.useState(false);
  useEffect(() => { const id = setTimeout(() => setAuthWaitOver(true), 3000); return () => clearTimeout(id); }, []);
  const waitingForAuth = !realtime.authKnown && !authWaitOver && !data.workingDashboard?.accountUid && !data.workingDashboard?.localOnly;

  // A backup of the Working Dashboard once a day, kept on the phone (the last 7): Settings > Automatic backups restores one.
  const dataRef = React.useRef(data);
  dataRef.current = data;
  useEffect(() => {
    if (!ready || Platform.OS === 'web') return undefined;
    const t0 = setTimeout(() => { runAutoBackup(dataRef.current).catch(() => {}); }, 8000);
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') runAutoBackup(dataRef.current).catch(() => {}); });
    return () => { clearTimeout(t0); sub.remove(); };
  }, [ready]);

  // Channels depend on the chosen ringtones, so wait until the store is loaded.
  useEffect(() => { if (ready) initNotifications(data.settings).catch(() => {}); }, [ready, data.settings?.ringtones]);

  /**
   * A Past Due Alert asked for before the navigator exists (a tap that launched the app, or an alarm while
   * the app is locked) is kept until it is ready.
   */
  const pending = useRef(null);
  const openWd = (alarmId) => { if (navRef.isReady()) navRef.navigate('PastDueAlert', { focus: alarmId || null }); else pending.current = alarmId || ''; };

  // Done / Snooze pressed with the app closed are written to storage; with it open they go
  // through the store, so the screens update and the copy in memory never overwrites them.
  useEffect(() => {
    setLiveWdUpdater((fn) => update((db) => ({ ...db, workingDashboard: fn(db.workingDashboard || {}) })));
    return () => setLiveWdUpdater(null);
  }, [update]);

  // The full-screen alarm's buttons (Done / Snooze 15m / DAR / Reminder only / Open app) open the app with what was pressed.
  // Read at launch and whenever the app comes back to the front.
  useEffect(() => {
    if (!ready) return undefined;
    // Text shared into the app (Gmail > Share > Working Dashboard): the dashboard opens a pre-filled New Entry from it.
    const takeShared = () => consumeSharedText().then((text) => {
      if (!text) return;
      const go = () => navRef.navigate('WorkingDashboard', { quick: text, at: Date.now() });
      if (navRef.isReady()) go(); else setTimeout(go, 1500);
    }).catch(() => {});
    const take = () => { takeShared(); return consumeInitialAlarmAction().then((a) => {
      if (!a) return;
      // Walk / water: Snooze rings it again later; the other buttons just close it. A Config style test does nothing.
      if (/^(nudge|preview):/.test(String(a.taskId || ''))) {
        const min = snoozeMinutesOf(a.action);
        if (min && String(a.taskId).startsWith('nudge:')) snoozeNudge(a.taskId, min).catch(() => {});
        return;
      }
      // The week summary alert (full screen): Open goes to the Report tab with the week's summary; the other buttons just close it.
      if (/^summary:/.test(String(a.taskId || ''))) {
        if (!a.action || a.action === 'OPEN') { const go = () => navRef.navigate('WorkingDashboard', { summary: 'week', at: Date.now() }); if (navRef.isReady()) go(); else setTimeout(go, 1500); }
        return;
      }
      const entryId = entryIdOfAlarm(a.taskId);
      if (!entryId) return;
      if (a.action) handleWdAction(a.action, entryId).catch(() => {});
      else openWd(a.taskId);
    }).catch(() => {}); };
    take();
    const sub = AppState.addEventListener('change', (st) => { if (st === 'active') take(); });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openWd only reads refs.
  }, [ready]);

  // An alarm starts ringing while the app is open: show the Past Due Alert screen right away
  // (with the app closed, the alarm itself opens it). Checked every couple of seconds while the app is in front.
  useEffect(() => {
    if (!ready || !trackerAvailable()) return undefined;
    let shown = '';
    const look = async () => {
      if (AppState.currentState !== 'active') return;
      const id = await getRingingTask();
      if (!id) { shown = ''; return; }
      if (id !== shown && entryIdOfAlarm(id)) { shown = id; openWd(id); }
    };
    const i = setInterval(look, 2500);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openWd only reads refs.
  }, [ready]);

  // Keeps the alerts booked with the app closed (and adds entries made on the web app).
  useEffect(() => { if (ready) registerWdRefresh().catch(() => {}); }, [ready]);

  // A notification tapped, or one of its buttons (Done / Snooze / Reminder only / Ring as alarm).
  useEffect(() => {
    const onResponse = (res) => {
      const payload = res?.notification?.request?.content?.data || {};
      // The week summary reminder: the Report tab with the week's summary.
      if (payload.kind === 'wd-summary') {
        const go = () => navRef.navigate('WorkingDashboard', { summary: 'week', at: Date.now() });
        if (navRef.isReady()) go(); else setTimeout(() => { if (navRef.isReady()) go(); }, 1500);
        return;
      }
      if (payload.kind !== 'wd-entry') return;
      const action = res.actionIdentifier;
      if (!action || action === Notifications.DEFAULT_ACTION_IDENTIFIER) openWd(payload.entryId ? wdAlarmId(payload.entryId, payload.key || 'due') : null);
      else {
        dismissEntryNotifications(payload.entryId, res.notification.request.identifier).catch(() => {});
        handleWdAction(action, payload.entryId, (res.notification.request.identifier || '') + action).catch(() => {});
      }
    };
    // The tap that launched the app: only a plain open, only if fresh, and never a button -
    // those were already applied by the background handler when they were tapped.
    Notifications.getLastNotificationResponseAsync().then((res) => {
      const fresh = res && Date.now() - Number(res.notification?.date || 0) < 2 * 60 * 1000;
      if (fresh && res.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) onResponse(res);
      Notifications.clearLastNotificationResponseAsync().catch(() => {});
    }).catch(() => {});
    const sub = addResponseListener(onResponse);
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- openWd only reads refs.
  }, []);

  // Home-screen widgets: redraw when the entries change (debounced), and when the lock or its "show on widgets" choice changes.
  useEffect(() => {
    if (!ready) return undefined;
    const id = setTimeout(() => { refreshWidgets().catch(() => {}); }, 1500);
    return () => clearTimeout(id);
  }, [ready, data.settings?.appLock?.enabled, data.settings?.widgets?.showWhenLocked, data.workingDashboard?.entries]);

  // Walk/water reminders are booked three days ahead and entry alerts only the soonest ones: top them up
  // whenever the app comes back to the front after a while (it can stay in memory for days).
  const wdRef = useRef(null);
  wdRef.current = { reminders: data.workingDashboard?.reminders, ringtone: data.workingDashboard?.alarmRingtone, entries: data.workingDashboard?.entries, alerts: data.workingDashboard?.alerts };
  useEffect(() => {
    if (!ready) return undefined;
    let last = Date.now();
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active' || Date.now() - last < 30 * 60000) return;
      last = Date.now();
      const { reminders, ringtone, entries, alerts } = wdRef.current || {};
      if (reminders) armTodaysReminders(reminders, ringtone, alerts).catch(() => {});
      if (entries) syncEntryAlerts(entries, ringtone, alerts).catch(() => {});
    });
    return () => sub.remove();
  }, [ready]);

  // Walk/water reminders are a daily schedule, so re-arm whatever's left of today's slots at launch too.
  useEffect(() => {
    if (!ready) return;
    const reminders = data.workingDashboard?.reminders;
    if (reminders) armTodaysReminders(reminders, data.workingDashboard?.alarmRingtone, data.workingDashboard?.alerts).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, at launch.
  }, [ready]);

  // Due-time alerts (and their follow-ups) for every open entry, including ones that came in from the sheet or
  // Firebase. Re-booked a moment after the entries change so a burst of edits is one pass.
  const wdEntries = data.workingDashboard?.entries;
  const wdRingtone = data.workingDashboard?.alarmRingtone;
  const wdAlerts = data.workingDashboard?.alerts;
  // Quiet hours' off days (holidays, leave days): known to every place that books alerts before the next booking.
  const wdHolidays = data.workingDashboard?.holidays;
  const wdLeave = data.workingDashboard?.leaveDays;
  useMemo(() => setAlertOffDays(wdHolidays || [], wdLeave || []), [wdHolidays, wdLeave]);
  // APK: the week summary reminder, booked again whenever its settings change.
  const summaryKey = JSON.stringify(['weeklySummary', 'weeklySummaryDay', 'weeklySummaryTime'].map((k) => wdAlerts?.[k]));
  useEffect(() => { if (ready && Platform.OS !== 'web') armWeeklySummary(wdAlerts).catch(() => {}); }, [ready, summaryKey]); // eslint-disable-line react-hooks/exhaustive-deps
  // Walk / water reminders keep quiet hours and days off too: booked again when those settings change.
  const quietKey = JSON.stringify(['quietHours', 'quietFrom', 'quietTo', 'quietOffDays'].map((k) => wdAlerts?.[k]));
  const firstQuiet = useRef(true);
  useEffect(() => {
    if (!ready) return;
    if (firstQuiet.current) { firstQuiet.current = false; return; }       // the launch booking above covers the first
    const reminders = data.workingDashboard?.reminders;
    if (reminders) armTodaysReminders(reminders, wdRingtone, wdAlerts).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when quiet hours, holidays or leave change.
  }, [ready, quietKey, wdHolidays, wdLeave]);
  useEffect(() => {
    if (!ready || !wdEntries) return undefined;
    const timer = setTimeout(() => { refreshWdAlerts({ pull: false, wd: { entries: wdEntries, alarmRingtone: wdRingtone, alerts: wdAlerts } }).catch(() => syncEntryAlerts(wdEntries, wdRingtone, wdAlerts).catch(() => {})); }, 2000);
    return () => clearTimeout(timer);
  }, [ready, wdEntries, wdRingtone, wdAlerts, wdHolidays, wdLeave]);

  // The navigator's onReady normally hides the splash; the timer covers the app-lock screen.
  useEffect(() => {
    if (!ready) return undefined;
    const i = setTimeout(hideSplashOnce, 700);
    return () => clearTimeout(i);
  }, [ready]);

  // The native window behind the app is the theme's background, so nothing grey can ever show through.
  useEffect(() => { SystemUI.setBackgroundColorAsync(t.bg).catch(() => {}); }, [t.bg]);

  /**
   * The exact-alarm permission decides whether a due-time alarm fires on time once the app is closed.
   * Without it Android downgrades every schedule to "inexact", so it is checked once per launch.
   */
  useEffect(() => {
    if (!ready || Platform.OS !== 'android') return;
    (async () => {
      if ((await isExactAlarmAllowed()) === false && shouldWarnExactAlarmOnce()) {
        Alert.alert(
          'Alarms may arrive late',
          'Android is currently blocking exact alarms for this app, so task alarms can be delayed or silently skipped. Turning this on once fixes it for every alarm - it does not depend on keeping the app open.',
          [{ text: 'Not now' }, { text: 'Fix it', onPress: () => requestExactAlarmPermission() }],
        );
      }
    })();
  }, [ready]);

  if (!ready || waitingForAuth) {
    return (
      <View style={{ flex: 1, backgroundColor: SPLASH.bg, alignItems: 'center', justifyContent: 'center' }}>
        {/* The logo drawing itself while the data loads (the splash screen hands over to it). */}
        <AnimatedLogo size={96} />
      </View>
    );
  }

  const navTheme = {
    ...(t.dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(t.dark ? DarkTheme : DefaultTheme).colors,
      background: t.bg,
      card: t.surface,
      text: t.text,
      primary: t.accent,
      border: t.border,
    },
  };

  const screenOptions = {
    headerStyle: { backgroundColor: t.bg },
    headerShadowVisible: false,
    headerTintColor: t.accent,
    headerTitleStyle: { fontWeight: '700', fontSize: t.fs(17), color: t.text },
    headerTitleAlign: 'center',
    headerLeft: (props) => <BackButton {...props} />,
    headerBackVisible: false,
    contentStyle: { backgroundColor: t.bg },
    animation: 'fade_from_bottom',
    animationDuration: 360,
    gestureEnabled: true,
  };

  return (
    // Nothing below the gate is mounted until the PIN / biometric check passes.
    <AppLockGate>
      {/* Sync runs whatever is on screen: the sign-in screen included, so it sees the sign-in happen. */}
      <RealtimeSync />
      {Platform.OS === 'web' && <NewVersion />}
      {Platform.OS === 'web' && <WebAlarmHost onOpen={(id) => openWd(id ? wdAlarmId(id, 'due') : null)} />}
      {showWelcome ? <Welcome /> : (
      <NavigationContainer
        ref={navRef}
        theme={navTheme}
        // Widget taps open the app: workingdashboard://work.
        linking={{ prefixes: ['workingdashboard://'], config: { screens: { WorkingDashboard: 'work', Settings: 'settings' } } }}
        onReady={() => {
          hideSplashOnce();
          const id = pending.current;
          pending.current = null;
          if (typeof id === 'string') navRef.navigate('PastDueAlert', { focus: id || null });
        }}
      >
        <StatusBar style={t.dark ? 'light' : 'dark'} />
        <Stack.Navigator screenOptions={screenOptions} initialRouteName="WorkingDashboard">
          <Stack.Screen name="WorkingDashboard" component={WorkingDashboard} options={{ title: 'Working Dashboard', headerShown: Platform.OS !== 'web', headerRight: (props) => <SettingsButton {...props} /> }} />
          <Stack.Screen name="Settings" component={Settings} options={{ title: 'Settings' }} />
          <Stack.Screen name="PastDueAlert" component={PastDueAlert} options={{ headerShown: false, presentation: 'fullScreenModal', animation: 'slide_from_bottom' }} />
        </Stack.Navigator>
      </NavigationContainer>
      )}
    </AppLockGate>
  );
}

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: SPLASH.bg }}>
      <SafeAreaProvider>
        {/* Outside the providers, so a crash inside one is still caught. */}
        <ErrorBoundary>
          <StoreProvider>
            <ThemeProvider>
              <Root />
            </ThemeProvider>
          </StoreProvider>
        </ErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
