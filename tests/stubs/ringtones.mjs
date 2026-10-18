// ringtones.js uses Metro's require() for .wav assets, which node cannot do.
export const RINGTONES = [{ id: 'default', label: 'System default', file: null, asset: null }];
export const ringtoneById = () => RINGTONES[0];
export const ringtoneLabel = () => 'System default';
export const channelIdFor = (g, r) => `${g}__${r}`;
export const ensureChannel = async (g, r = 'default') => `${g}__${r}`;
export const ensureSelectedChannels = async () => {};
export const previewRingtone = async () => false;
export const stopPreview = async () => {};
