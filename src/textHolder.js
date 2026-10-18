// The module that holds the platform's Text component (its `default` export), so fonts.js can wrap it once.
// Two files because Metro resolves every require statically: the phone has no react-native-web, the browser has no Libraries/.
export const textHolder = () => require('react-native/Libraries/Text/Text');
