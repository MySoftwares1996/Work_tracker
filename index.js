import { registerRootComponent } from 'expo';
import { registerWidgetTaskHandler } from 'react-native-android-widget';
import App from './App';
import { widgetTaskHandler } from './src/widgets';

registerRootComponent(App);
// Home-screen widgets are drawn by this handler, also with the app closed.
registerWidgetTaskHandler(widgetTaskHandler);
