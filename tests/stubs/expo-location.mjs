export const GeofencingEventType = { Enter: 1, Exit: 2 };
export const Accuracy = { High: 1 };
export const requestForegroundPermissionsAsync = async () => ({ status: 'granted' });
export const requestBackgroundPermissionsAsync = async () => ({ status: 'granted' });
export const startGeofencingAsync = async () => {};
export const stopGeofencingAsync = async () => {};
export const getCurrentPositionAsync = async () => ({ coords: { latitude: 0, longitude: 0 } });
export const getForegroundPermissionsAsync = async () => ({ status: 'granted' });
