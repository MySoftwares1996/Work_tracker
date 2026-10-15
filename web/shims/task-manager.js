// Background tasks (actions taken with the app closed) exist only on the phone. In the browser the open tab
// does the same work itself, so the tasks are remembered but never run in the background.
const tasks = new Map();
export const defineTask = (name, fn) => { tasks.set(name, fn); };
export const isTaskDefined = (name) => tasks.has(name);
export const isTaskRegisteredAsync = async () => false;
export const unregisterTaskAsync = async () => {};
export const unregisterAllTasksAsync = async () => {};
export const isAvailableAsync = async () => false;
