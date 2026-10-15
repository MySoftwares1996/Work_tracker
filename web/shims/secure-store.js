/**
 * expo-secure-store in the browser. A browser has no Keystore, so values are kept in this site's own
 * storage. The PIN still stops someone using an unlocked, open tab; it is not encryption.
 */
const PREFIX = 'wd_secure_';
const store = () => { try { return window.localStorage; } catch { return null; } };

export async function getItemAsync(key) { return store()?.getItem(PREFIX + key) ?? null; }
export async function setItemAsync(key, value) { store()?.setItem(PREFIX + key, String(value)); }
export async function deleteItemAsync(key) { store()?.removeItem(PREFIX + key); }
export const isAvailableAsync = async () => !!store();
