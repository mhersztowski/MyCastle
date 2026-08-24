#!/usr/bin/env bash
set -e

# Build MyCastle Watch APK inside the mycastle-android Docker container
# Run from repo root:
#   docker compose -f docker-compose.cli.yml run --rm android /workspace/app/mycastle-watch/build.sh
#
# Output: app/mycastle-watch/android/app/build/outputs/apk/release/app-release.apk

export CI=1
export GRADLE_OPTS="-Dorg.gradle.jvmargs=-Xmx2g -XX:+HeapDumpOnOutOfMemoryError"

APP_DIR="/workspace/app/mycastle-watch"
cd "$APP_DIR"

# Register QEMU x86_64 emulation so Android build tools (aapt2 etc.) can run on ARM64 host
if [ -d /proc/sys/fs/binfmt_misc ]; then
  mount binfmt_misc -t binfmt_misc /proc/sys/fs/binfmt_misc 2>/dev/null || true
  if [ -f /usr/bin/qemu-x86_64-static ] && ! [ -f /proc/sys/fs/binfmt_misc/qemu-x86_64 ]; then
    echo ':qemu-x86_64:M::\x7fELF\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00\x02\x00\x3e\x00:\xff\xff\xff\xff\xff\xfe\xfe\x00\xff\xff\xff\xff\xff\xff\xff\xff\xfe\xff\xff\xff:/usr/bin/qemu-x86_64-static:F' > /proc/sys/fs/binfmt_misc/register 2>/dev/null \
      && echo "  QEMU x86_64 emulation registered" \
      || echo "  QEMU registration skipped (may already be active on host)"
  fi
fi

echo "==> Installing npm dependencies..."
npm install --yes

echo "==> Installing Expo-compatible native packages..."
# `react-native-webview` świadomie nieobecny: Wear OS nie zawiera silnika
# przeglądarki, więc każda próba utworzenia WebView kończy się
# `UnsupportedOperationException` przy starcie aplikacji.
npx expo install expo-asset expo-font expo-constants

echo "==> Generating placeholder assets..."
mkdir -p assets
python3 - <<'PYEOF'
import struct, zlib

def make_png(w, h, r, g, b):
    def chunk(tag, data):
        c = zlib.crc32(tag + data) & 0xffffffff
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', c)
    raw = b''.join(struct.pack('>BBBB', r, g, b, 255) * w for _ in range(h))
    raw = b''.join(b'\x00' + raw[i*w*4:(i+1)*w*4] for i in range(h))
    compressed = zlib.compress(raw)
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', compressed)
            + chunk(b'IEND', b''))

assets = {
    'assets/icon.png':          (1024, 1024, 26, 26, 46),
    'assets/splash-icon.png':   (1024, 1024, 26, 26, 46),
    'assets/adaptive-icon.png': (1024, 1024, 26, 26, 46),
}
for path, (w, h, r, g, b) in assets.items():
    with open(path, 'wb') as f:
        f.write(make_png(w, h, r, g, b))
    print(f'  created {path}')
PYEOF

echo "==> Running expo prebuild (generates native Android project)..."
npx expo prebuild --platform android --clean

echo "==> Sprawdzam manifest..."
MANIFEST="$APP_DIR/android/app/src/main/AndroidManifest.xml"

# Ruch po HTTP: `usesCleartextTraffic` jest w konfiguracji, ale dokładamy je
# także tutaj — starsze wersje prebuildu potrafiły je pominąć, a bez tego
# WebView milczy zamiast zgłosić błąd.
grep -q 'usesCleartextTraffic' "$MANIFEST" || \
  sed -i 's/android:allowBackup="true"/android:allowBackup="true" android:usesCleartextTraffic="true"/' "$MANIFEST"

# Deklaracja zegarka pochodzi z pluginu `plugins/withWearOs.js`. Sprawdzamy ją,
# bo jej brak nie objawia się błędem budowania: APK powstaje, instaluje się na
# zegarku i po prostu nie pojawia się w menu.
if grep -q 'android.hardware.type.watch' "$MANIFEST"; then
  echo "  Deklaracja zegarka obecna"
else
  echo "  BŁĄD: w manifeście nie ma android.hardware.type.watch."
  echo "        APK zbuduje się, ale Wear OS nie pokaże aplikacji w menu."
  echo "        Sprawdź, czy plugin ./plugins/withWearOs jest w app.config.js."
  exit 1
fi

echo "==> Building APK..."
cd android

mkdir -p /root/.gradle/init.d
cat > /root/.gradle/init.d/suppress-compose-kotlin-check.gradle << 'GRADLE_EOF'
gradle.projectsEvaluated {
    rootProject.allprojects { proj ->
        proj.tasks.matching { it.class.name.contains('KotlinCompile') }.each { task ->
            if (task.metaClass.respondsTo(task, 'getKotlinOptions')) {
                task.kotlinOptions.freeCompilerArgs += [
                    '-P',
                    'plugin:androidx.compose.compiler.plugins.kotlin:suppressKotlinVersionCompatibilityCheck=true'
                ]
            }
        }
    }
}
GRADLE_EOF

# Architektury: 32- i 64-bitowe ARM, bez x86.
#
# **Wear OS na Galaxy Watch 6 uruchamia aplikacje w trybie 32-bitowym.**
# Sprawdzone na sprzęcie (SM_L310): SoLoader ładuje biblioteki z
# `base.apk!/lib/armeabi-v7a`, mimo że procesor Exynos W930 jest 64-bitowy.
# Zbudowanie samego `arm64-v8a` daje APK, który instaluje się bez błędu
# i wywraca się dopiero przy starcie:
#
#     couldn't find DSO to load: libexpo-modules-core.so
#     ❌ Cannot install JSI interop
#
# Objaw jest mylący, bo gotowe biblioteki React Native wchodzą do APK we
# wszystkich wersjach — brakuje wyłącznie tych, które kompilują się ze źródeł
# (`expo-modules-core`). Aplikacja startuje, pokazuje splash i znika bez
# wyjątku w logu aplikacji.
#
# `x86` i `x86_64` pomijamy: to architektury emulatorów Androida na PC, na
# zegarku bezużyteczne. Każda oznacza osobną kompilację C++ przez toolchain
# NDK zbudowany pod x86_64 — czyli pod emulacją QEMU, bo kontener działa na
# ARM64. To właśnie tam pierwsza budowa przewróciła się na
# `expo-modules-core:buildCMakeRelWithDebInfo[x86_64]`.
echo "reactNativeArchitectures=armeabi-v7a,arm64-v8a" >> gradle.properties
echo "  Architektury: armeabi-v7a (Wear OS działa w trybie 32-bit) + arm64-v8a"

AAPT2_PATH=$(find /opt/android-sdk/build-tools -name "aapt2" -type f | sort -rV | head -1)
if [ -n "$AAPT2_PATH" ]; then
  echo "android.aapt2FromMavenOverride=$AAPT2_PATH" >> gradle.properties
  echo "  Using local aapt2: $AAPT2_PATH"
fi

chmod +x gradlew
./gradlew assembleRelease --no-daemon --quiet

APK_PATH="app/build/outputs/apk/release/app-release.apk"
if [ -f "$APK_PATH" ]; then
  echo ""
  echo "==> Done! APK: $APP_DIR/android/$APK_PATH"
else
  echo "==> Build failed — APK not found at $APK_PATH"
  exit 1
fi
