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

/** Looks for an update now and downloads it. Resolves a sentence for the person; reloads nothing by itself. */
export async function checkForPhoneUpdate() {
  if (!Updates.isEnabled) return 'This build cannot receive updates. It was made without the update settings, so a new APK build is needed (docs/PHONE_UPDATES.md).';
  try {
    const res = await Updates.checkForUpdateAsync();
    if (res && res.isAvailable) { await Updates.fetchUpdateAsync(); return 'A new version was downloaded. Tap Restart in the bar at the bottom, or close and open the app.'; }
    return 'The app is up to date.';
  } catch (e) {
    return `Could not check for an update: ${e && e.message ? e.message : 'no connection?'}`;
  }
}
