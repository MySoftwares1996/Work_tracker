const mem = {};
export default {
  getItem: async (k) => mem[k] ?? null,
  setItem: async (k, v) => { mem[k] = v; },
  removeItem: async (k) => { delete mem[k]; },
  multiGet: async (ks) => ks.map((k) => [k, mem[k] ?? null]),
  multiSet: async (ps) => { for (const [k, v] of ps) mem[k] = v; },
  getAllKeys: async () => Object.keys(mem),
  multiRemove: async (ks) => { for (const k of ks) delete mem[k]; },
  __reset: () => { for (const k of Object.keys(mem)) delete mem[k]; },
};
