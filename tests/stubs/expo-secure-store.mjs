// In-memory stand-in for the device's encrypted key-value store.
let store = {};
export const __reset = () => { store = {}; };

export async function getItemAsync(key) {
  return key in store ? store[key] : null;
}
export async function setItemAsync(key, value) {
  store[key] = String(value);
}
export async function deleteItemAsync(key) {
  delete store[key];
}
