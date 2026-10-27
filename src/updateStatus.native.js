import * as Updates from 'expo-updates';

/**
 * What the app knows about its own updates, for More > App updates: { enabled, channel, runtimeVersion, running, when }.
 * `enabled` is false in a build made without the update settings (docs/PHONE_UPDATES.md) - such a build cannot receive updates.
 */
export function updateStatus() {
  try {
    return {
      enabled: !!Updates.isEnabled,
      channel: Updates.channel || '',
      runtimeVersion: Updates.runtimeVersion || '',
      running: Updates.isEmbeddedLaunch ? 'the version built into the app' : `update ${String(Updates.updateId || '').slice(0, 8)}`,
      when: Updates.createdAt ? Updates.createdAt.toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '',
    };
  } catch {
    return { enabled: false, channel: '', runtimeVersion: '', running: 'unknown', when: '' };
  }
}

/** Looks for an update now and downloads it: { text, downloaded } - a sentence for the person, and whether a new version is waiting to be started. */
export async function checkForPhoneUpdateResult() {
  if (!Updates.isEnabled) return { text: 'This build cannot receive updates. It was made without the update settings, so a new APK build is needed (docs/PHONE_UPDATES.md).', downloaded: false };
  try {
    const res = await Updates.checkForUpdateAsync();
    if (res && res.isAvailable) { await Updates.fetchUpdateAsync(); return { text: 'A new version was downloaded.', downloaded: true }; }
    // Downloaded earlier (by the automatic check) and not started yet: it is still waiting for a restart.
    if (Updates.isUpdatePending) return { text: 'A new version is ready.', downloaded: true };
    return { text: 'The app is up to date.', downloaded: false };
  } catch (e) {
    return { text: `Could not check for an update: ${e && e.message ? e.message : 'no connection?'}`, downloaded: false };
  }
}

/** Starts the downloaded version now (the app restarts). */
export async function restartApp() {
  try { await Updates.reloadAsync(); } catch { /* the bar at the bottom or reopening the app still works */ }
}
