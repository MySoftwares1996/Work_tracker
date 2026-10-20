/**
 * Ringtone registry.
 *
 * Android fixes a notification channel's sound at creation time and refuses to
 * change it afterwards, so "let the user pick a ringtone" really means "create
 * one channel per (group, ringtone) pair and schedule onto the right one".
 * ensureChannel() does that lazily and returns the channel id to schedule with.
 *
 * The .wav files live in assets/sounds and are copied into res/raw at prebuild
 * by the expo-notifications plugin entry in app.json. Android only accepts
 * lowercase a-z, 0-9 and underscore in res/raw file names - keep it that way.
 */
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { warnQuiet } from './quietCatch';

export const RINGTONES = [
  { id: 'default', label: 'System default', file: null,         asset: null },
  { id: 'chime',   label: 'Chime',          file: 'chime.wav',  asset: require('../assets/sounds/chime.wav') },
  { id: 'bell',    label: 'Bell',           file: 'bell.wav',   asset: require('../assets/sounds/bell.wav') },
  { id: 'ping',    label: 'Ping',           file: 'ping.wav',   asset: require('../assets/sounds/ping.wav') },
  { id: 'drop',    label: 'Water drop',     file: 'drop.wav',   asset: require('../assets/sounds/drop.wav') },
  { id: 'alarm',   label: 'Alarm',          file: 'alarm.wav',  asset: require('../assets/sounds/alarm.wav') },
  { id: 'silent',  label: 'Silent',         file: null,         asset: null, silent: true },
];

export const ringtoneById = (id) => RINGTONES.find((r) => r.id === id) || RINGTONES[0];
export const ringtoneLabel = (id) => ringtoneById(id).label;

/** Importance and vibration differ per group, the sound is what the user picks. */
const GROUPS = {
  tasks: {
    name: 'Task alarms',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 400, 200, 400],
    bypassDnd: true,
  },
  attendance: {
    name: 'Attendance',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200],
    bypassDnd: false,
  },
};

export const channelIdFor = (group, ringtoneId = 'default') => `${group}__${ringtoneId}`;

const created = new Set();

/**
 * Create (once) and return the channel id carrying this ringtone.
 * Safe to call on every schedule - it short-circuits after the first time.
 */
export async function ensureChannel(group, ringtoneId = 'default') {
  const id = channelIdFor(group, ringtoneId);
  if (Platform.OS !== 'android') return id;
  if (created.has(id)) return id;

  const g = GROUPS[group] || GROUPS.tasks;
  const tone = ringtoneById(ringtoneId);

  try {
    await Notifications.setNotificationChannelAsync(id, {
      name: `${g.name} - ${tone.label}`,
      importance: tone.silent ? Notifications.AndroidImportance.LOW : g.importance,
      sound: tone.silent ? null : tone.file || 'default',
      vibrationPattern: g.vibrationPattern,
      enableVibrate: !tone.silent,
      bypassDnd: g.bypassDnd && !tone.silent,
    });
    created.add(id);
  } catch (e) {
    console.warn('channel create failed', id, e?.message);
  }
  return id;
}

/** Warm the channels the user has actually chosen, so the first alert is instant. */
export async function ensureSelectedChannels(settings = {}) {
  const r = settings.ringtones || {};
  await ensureChannel('tasks', r.task || 'chime');
  await ensureChannel('attendance', r.attendance || 'default');
}

/* ---------- in-app preview ---------- */

let player = null;

/** Play a ringtone through the speaker so the user can audition it in Settings. */
export async function previewRingtone(ringtoneId, { loop = false } = {}) {
  const tone = ringtoneById(ringtoneId);
  await stopPreview();
  if (!tone.asset) return false;               // system default / silent: nothing to preview
  try {
    const { createAudioPlayer, setAudioModeAsync } = require('expo-audio');
    await setAudioModeAsync({ playsInSilentMode: true, shouldPlayInBackground: false }).catch(warnQuiet('ringtones'));
    player = createAudioPlayer(tone.asset);
    player.loop = loop;
    player.play();
    return true;
  } catch (e) {
    console.warn('preview failed', e?.message);
    player = null;
    return false;
  }
}

export async function stopPreview() {
  if (!player) return;
  try { player.pause?.(); player.remove?.(); } catch {}
  player = null;
}
