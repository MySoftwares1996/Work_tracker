// One stub for every @react-native-firebase/* and google-signin import: records each committed batch.
const batches = [];
export const __batches = () => batches;
export const __resetBatches = () => { batches.length = 0; };
export const getApp = () => ({});
export const getAuth = () => ({});
export const onAuthStateChanged = (_a, cb) => { cb(null); return () => {}; };
export const signInWithCredential = async () => ({ user: { uid: 'u1' } });
export const signOut = async () => {};
export const GoogleAuthProvider = { credential: (t) => ({ t }) };
export const getFirestore = () => ({});
export const collection = (...path) => ({ path: path.slice(1).join('/') });
export const doc = (...path) => ({ path: path.slice(1).join('/') });
export const onSnapshot = () => () => {};
export const getDocs = async () => ({ docs: [] });
export function writeBatch() {
  const ops = [];
  return {
    set: (ref, data, opts) => ops.push({ op: 'set', path: ref.path, data, opts }),
    delete: (ref) => ops.push({ op: 'delete', path: ref.path }),
    commit: async () => {
      if (ops.length > 500) throw new Error('A write batch can contain up to 500 operations.');
      batches.push(ops);
    },
  };
}
export const GoogleSignin = { configure: () => {}, hasPlayServices: async () => true, signIn: async () => ({}), signOut: async () => {} };
export const isSuccessResponse = () => false;
