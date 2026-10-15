# Native compile stubs

Used by `scripts/compile-native.sh` to compile `modules/native-tools` with a
real Kotlin compiler, without the Android SDK or a Gradle build.

The Expo stubs reproduce the **exact** public signatures from
`expo-modules-core` 57.0.18 (the version Expo SDK 57 installs) - including the
full `AsyncFunction` overload set with its `reified` generics, `crossinline`
bodies and `@JvmName` annotations. Overload resolution and lambda return-type
inference against that set is what decides whether the module compiles, so a
simplified stub would prove nothing.

`compile-native.sh` also checks these stubs against the copy of
expo-modules-core in `node_modules`, and fails if Expo has changed the overload
set, so the stubs cannot silently go stale.

Android classes come from a real `android.jar` (API 35), not stubs.
