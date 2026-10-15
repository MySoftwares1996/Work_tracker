#!/usr/bin/env bash
# Compiles modules/native-tools with a real Kotlin compiler against the real
# Android API. Catches errors that otherwise only appear 15 minutes into an EAS
# build. Needs network on first run (downloads are cached in .native-cache/).
set -euo pipefail
cd "$(dirname "$0")/.."

KOTLIN_VERSION=2.0.21        # Expo's default kotlinVersion for SDK 57
CACHE=.native-cache
mkdir -p "$CACHE"

if [ ! -x "$CACHE/kotlinc/bin/kotlinc" ]; then
  echo "Downloading Kotlin $KOTLIN_VERSION..."
  curl -sSfL -o "$CACHE/kc.zip" "https://github.com/JetBrains/kotlin/releases/download/v$KOTLIN_VERSION/kotlin-compiler-$KOTLIN_VERSION.zip"
  unzip -q -o "$CACHE/kc.zip" -d "$CACHE" && rm "$CACHE/kc.zip"
fi
if [ ! -f "$CACHE/android.jar" ]; then
  echo "Downloading android.jar (API 35)..."
  curl -sSfL -o "$CACHE/android.jar" "https://raw.githubusercontent.com/Reginer/aosp-android-jar/main/android-35/android.jar"
fi

# Stubs must still match the installed expo-modules-core.
REAL=node_modules/expo-modules-core/android/src/main/java/expo/modules/kotlin/objects/ObjectDefinitionBuilder.kt
if [ -f "$REAL" ]; then
  for sig in 'JvmName("AsyncFunctionWithoutArgs")' 'JvmName("AsyncFunctionWithPromise")' 'crossinline body: (p0: P0, p1: Promise) -> R'; do
    grep -qF "$sig" "$REAL" || { echo "STALE STUBS: expo-modules-core no longer has: $sig"; exit 1; }
  done
else
  echo "(node_modules not installed - skipping the stub freshness check)"
fi

OUT=$(mktemp -d)
"$CACHE/kotlinc/bin/kotlinc" -cp "$CACHE/android.jar" -d "$OUT" -jvm-target 17 \
  $(find tests/native-stubs -name '*.kt') \
  modules/native-tools/android/src/main/java/expo/modules/nativetools/*.kt 2>&1 | tee "$OUT/log" | grep -E "error:|warning:" || true

if grep -q "error:" "$OUT/log"; then
  echo; echo "Native module does NOT compile."; exit 1
fi
echo "Native module compiles: $(find "$OUT" -name '*.class' | wc -l) classes."
