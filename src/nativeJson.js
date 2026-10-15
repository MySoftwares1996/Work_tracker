/**
 * The native module returns JSON strings rather than maps and lists, because
 * Expo's automatic type conversion does not cover every shape and a converter
 * failure shows up as an opaque runtime error on the device. A string always
 * crosses the bridge intact.
 *
 * Kept here, outside modules/, so it can be tested directly.
 */
export function parseNative(raw, fallback) {
  if (raw == null) return fallback;
  if (typeof raw !== 'string') return raw;      // tolerate a future native change
  try {
    const parsed = JSON.parse(raw);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}
