/**
 * @react-native-google-signin in the browser. The phone shows Google's account sheet and hands the ID token
 * to Firebase; a browser does the same with Google's sign-in popup, and returns that token in the shape
 * src/firebaseSync.js already reads, so the sign-in code is shared.
 */
import { getAuth, GoogleAuthProvider, signInWithPopup, reauthenticateWithPopup, signOut as fbSignOut } from 'firebase/auth';
import { firebaseApp } from '../../src/firebaseWebConfig';

export const isSuccessResponse = (res) => res?.type === 'success';

// Extra access (e.g. Gmail) granted in this tab: a browser gets an access token from the sign-in popup, valid
// for about an hour and not refreshable, so it is asked for again (one tap) once it runs out.
const access = { token: null, expiresAt: 0, scopes: [] };
const tokenValid = () => !!access.token && Date.now() < access.expiresAt;

export const GoogleSignin = {
  configure() {},
  async hasPlayServices() { return true; },
  async signIn() {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
      const result = await signInWithPopup(getAuth(firebaseApp()), provider);
      const cred = GoogleAuthProvider.credentialFromResult(result);
      return { type: 'success', data: { idToken: cred?.idToken || null, user: result.user } };
    } catch (e) {
      if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') return { type: 'cancelled', data: null };
      if (e?.code === 'auth/unauthorized-domain') {
        throw new Error(`This web address (${window.location.hostname}) is not allowed to sign in yet. Firebase console -> Authentication -> Settings -> Authorized domains -> add it.`);
      }
      throw e;
    }
  },
  async signOut() {
    Object.assign(access, { token: null, expiresAt: 0, scopes: [] });
    try { await fbSignOut(getAuth(firebaseApp())); } catch { /* already signed out */ }
  },
  // As @react-native-google-signin: who is signed in, and the extra access granted (only while its token is valid).
  getCurrentUser() {
    const u = getAuth(firebaseApp()).currentUser;
    return u ? { user: { id: u.uid, email: u.email, name: u.displayName }, scopes: tokenValid() ? access.scopes : [] } : null;
  },
  async signInSilently() {
    return getAuth(firebaseApp()).currentUser ? { type: 'success', data: this.getCurrentUser() } : { type: 'noSavedCredentialFound', data: null };
  },
  /** Asks for extra access with Google's popup, for the account already signed in (must follow a tap). */
  async addScopes({ scopes = [] } = {}) {
    const auth = getAuth(firebaseApp());
    const provider = new GoogleAuthProvider();
    scopes.forEach((x) => provider.addScope(x));
    if (auth.currentUser?.email) provider.setCustomParameters({ login_hint: auth.currentUser.email });
    try {
      const result = auth.currentUser ? await reauthenticateWithPopup(auth.currentUser, provider) : await signInWithPopup(auth, provider);
      const cred = GoogleAuthProvider.credentialFromResult(result);
      if (!cred?.accessToken) return null;
      Object.assign(access, { token: cred.accessToken, expiresAt: Date.now() + 55 * 60000, scopes });
      return { type: 'success', data: this.getCurrentUser() };
    } catch (e) {
      if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') return null;
      if (e?.code === 'auth/user-mismatch') throw new Error('Choose the same Google account you are signed in with.');
      throw e;
    }
  },
  async getTokens() {
    if (!tokenValid()) throw new Error('Access has expired - try again.');
    return { accessToken: access.token, idToken: null };
  },
};

export default { GoogleSignin, isSuccessResponse };
