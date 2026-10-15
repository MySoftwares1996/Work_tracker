// @react-native-firebase/app in the browser: the Firebase JS SDK's app, set up from src/firebaseWebConfig.js.
import { firebaseApp } from '../../src/firebaseWebConfig';

export const getApp = () => firebaseApp();
export default { app: getApp };
