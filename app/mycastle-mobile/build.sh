#!/usr/bin/env bash
set -e

# Build MyCastle Mobile APK inside the mycastle-android Docker container
# Run from repo root:
#   docker compose -f docker-compose.cli.yml run --rm android /workspace/app/mycastle-mobile/build.sh
#
# Output: app/mycastle-mobile/android/app/build/outputs/apk/release/app-release.apk

# CI=1 disables all interactive prompts in Expo, npm, and Gradle
export CI=1
# GRADLE_OPTS sets JVM args for the Gradle client process itself
export GRADLE_OPTS="-Xmx4g -XX:MaxMetaspaceSize=512m"

APP_DIR="/workspace/app/mycastle-mobile"
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
npx expo install react-native-webview expo-constants expo-asset expo-font

echo "==> Generating placeholder assets..."
mkdir -p assets
node -e "
const { createCanvas } = require('canvas');
// Try canvas module, fall back to creating minimal PNG bytes
" 2>/dev/null || true

# Create minimal valid 1x1 PNG files if assets don't exist
python3 - <<'PYEOF'
import struct, zlib, os

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

echo "==> Config:"
echo "    MYCASTLE_SERVER_URL = ${MYCASTLE_SERVER_URL:-http://192.168.0.207:1894 (default)}"
echo "    MYCASTLE_APP_NAME   = ${MYCASTLE_APP_NAME:-MyCastle (default)}"

echo "==> Running expo prebuild (generates native Android project)..."
npx expo prebuild --platform android --clean

echo "==> Patching AndroidManifest.xml for cleartext HTTP traffic..."
MANIFEST="$APP_DIR/android/app/src/main/AndroidManifest.xml"
sed -i 's/android:allowBackup="true"/android:allowBackup="true" android:usesCleartextTraffic="true"/' "$MANIFEST"
echo "  Added usesCleartextTraffic"

# Trwały klucz podpisujący.
#
# `expo prebuild --clean` kasuje cały katalog `android/`, a razem z nim
# `app/debug.keystore` — i generuje **nowy** przy następnym uruchomieniu.
# Wygenerowany projekt podpisuje wydanie tym samym kluczem co wersję
# deweloperską (`release { signingConfig signingConfigs.debug }`), więc każda
# budowa dawała APK z innym podpisem.
#
# Android odmawia nadpisania zainstalowanej aplikacji pakietem podpisanym
# innym kluczem. Objaw jest bezużyteczny — instalator pokazuje samo
# „Aplikacja nie została zainstalowana", bez słowa o podpisie — a wygląda
# jak uszkodzony plik, więc szuka się błędu w pobieraniu i w budowaniu.
#
# Klucz leży poza `android/`, w katalogu wykluczonym z gita: to poświadczenie,
# nie kod. Trzeba go **zachować** — po jego utracie kolejny APK znów nie wejdzie
# na wierzch zainstalowanej aplikacji i będzie ją trzeba raz odinstalować.
# Inną ścieżkę wskazuje `MYCASTLE_KEYSTORE`.
#
# Nazwa i hasła są celowo takie, jakich oczekuje wygenerowany `build.gradle`
# (`androiddebugkey`/`android`) — dzięki temu podmiana pliku wystarcza i nie
# trzeba łatać konfiguracji Gradle'a, która i tak powstaje od nowa.
KEYSTORE="${MYCASTLE_KEYSTORE:-$APP_DIR/.keystore/mycastle.keystore}"
if [ ! -f "$KEYSTORE" ]; then
  echo "==> Tworzę trwały klucz podpisujący: $KEYSTORE"
  mkdir -p "$(dirname "$KEYSTORE")"
  keytool -genkeypair -v -keystore "$KEYSTORE" \
    -storepass android -keypass android -alias androiddebugkey \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -dname "CN=MyCastle, OU=Mobile, O=MyCastle, L=Unknown, ST=Unknown, C=PL" >/dev/null
else
  echo "==> Używam istniejącego klucza podpisującego: $KEYSTORE"
fi
cp "$KEYSTORE" "$APP_DIR/android/app/debug.keystore"

# Generate the autolinking config that the React Gradle plugin consumes.
#
# `settings.gradle` asks the React settings plugin to produce
# android/build/generated/autolinking/autolinking.json during Gradle's settings
# phase. After `expo prebuild --clean` wipes android/, that generation has been
# observed not to happen in the same invocation that runs assembleRelease, and
# the build then dies at :app:generateAutolinkingPackageList with
# "input file was expected to be present but it doesn't exist".
#
# Writing the file here removes the ordering question entirely: it is byte-for-byte
# what the settings plugin would run, so Gradle either accepts it or refreshes it
# from the same source.
echo "==> Generating autolinking config..."
mkdir -p android/build/generated/autolinking
node --no-warnings --eval \
  "require(require.resolve('expo-modules-autolinking', { paths: [require.resolve('expo/package.json')] }))(process.argv.slice(1))" \
  react-native-config --json --platform android \
  > android/build/generated/autolinking/autolinking.json
echo "  wrote android/build/generated/autolinking/autolinking.json"

echo "==> Building APK..."
cd android

# Compose Compiler 1.5.15 bundled in expo-modules-core requires Kotlin 1.9.25, but expo SDK 52
# generates a project with Kotlin 1.9.24. Add a Gradle init script that suppresses this check
# globally (the minor version difference is safe in practice).
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

# Force Gradle to use the ARM64-native aapt2 from the local SDK
# instead of downloading the x86_64 version from Maven (which fails on ARM64 hosts)
AAPT2_PATH=$(find /opt/android-sdk/build-tools -name "aapt2" -type f | sort -rV | head -1)
if [ -n "$AAPT2_PATH" ]; then
  echo "android.aapt2FromMavenOverride=$AAPT2_PATH" >> gradle.properties
  echo "  Using local aapt2: $AAPT2_PATH"
fi

# Increase JVM heap for the build process (controls --no-daemon JVM, overrides any default)
sed -i '/^org\.gradle\.jvmargs/d' gradle.properties
echo "org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=512m -XX:+HeapDumpOnOutOfMemoryError" >> gradle.properties
echo "  Set org.gradle.jvmargs=-Xmx4g"

# Blokady po kontenerze ubitym w połowie budowy.
#
# Katalog `.gradle` leży w podmontowanym drzewie, więc przeżywa kontener.
# Gradle nie odróżnia blokady trzymanej przez żywy proces od porzuconej i po
# prostu na nią czeka — bez tego kroku następne uruchomienie stoi kilkanaście
# minut i kończy się „Timeout waiting to lock", co wygląda na awarię budowy,
# a nie na ślad po poprzedniej.
#
# Kasowanie jest bezpieczne, bo w kontenerze idzie jedna budowa naraz
# i z `--no-daemon`: żaden proces nie może w tym momencie trzymać blokady.
if find .gradle -name '*.lock' -type f 2>/dev/null | grep -q .; then
  echo "  Usuwam blokady Gradle po poprzednim uruchomieniu"
  find .gradle -name '*.lock' -type f -delete
fi

chmod +x gradlew
./gradlew assembleRelease --no-daemon --quiet

APK_PATH="app/build/outputs/apk/release/app-release.apk"
if [ -f "$APK_PATH" ]; then
  echo ""
  echo "==> Done! APK: $APP_DIR/android/$APK_PATH"
  # Odcisk certyfikatu — po nim poznaje się, czy APK wejdzie na wierzch tego,
  # co już jest zainstalowane. Inny odcisk = instalacja odmówi.
  APKSIGNER=$(find "${ANDROID_HOME:-/opt/android-sdk}/build-tools" -name apksigner 2>/dev/null | sort -rV | head -1)
  if [ -n "$APKSIGNER" ]; then
    echo "    podpis: $("$APKSIGNER" verify --print-certs "$APK_PATH" 2>/dev/null | grep -m1 'SHA-256 digest')"
  fi
else
  echo "==> Build failed — APK not found at $APK_PATH"
  exit 1
fi
