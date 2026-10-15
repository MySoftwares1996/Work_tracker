// Background fetch exists only on the phone; in the browser the open tab syncs by itself.
export const BackgroundFetchResult = { NoData: 1, NewData: 2, Failed: 3 };
export const BackgroundFetchStatus = { Denied: 1, Restricted: 2, Available: 3 };
export const getStatusAsync = async () => BackgroundFetchStatus.Restricted;
export const registerTaskAsync = async () => {};
export const unregisterTaskAsync = async () => {};
