// Controllable stand-in for the device's fingerprint/face sensor.
let hardware = true, enrolled = true, nextResult = true;
export const __set = (h, e, result = true) => { hardware = h; enrolled = e; nextResult = result; };

export async function hasHardwareAsync() { return hardware; }
export async function isEnrolledAsync() { return enrolled; }
export async function authenticateAsync() { return { success: nextResult }; }
