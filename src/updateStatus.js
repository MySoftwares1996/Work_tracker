/** The website has no phone updates: an empty stand-in for updateStatus.native.js. */
export const updateStatus = () => null;
export const checkForPhoneUpdateResult = async () => ({ text: 'Phone updates are for the Android app.', downloaded: false });
export const restartApp = async () => {};
