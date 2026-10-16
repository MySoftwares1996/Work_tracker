// The phone's report code is shared with this website; its storage module imports React Native's AsyncStorage, which a website does not need.
const none = async () => null;
export default { getItem: none, setItem: none, removeItem: none, multiGet: async () => [], multiSet: none, multiRemove: none, getAllKeys: async () => [], clear: none };
