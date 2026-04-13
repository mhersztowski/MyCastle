#!/usr/bin/env bash
set -e

# Build MyCastle Mobile APK inside the mycastle-android Docker container
# Run from repo root:
#   docker compose -f docker-compose.cli.yml run --rm android /workspace/app/mycastle-mobile/build.sh
#
# Output: app/mycastle-mobile/android/app/build/outputs/apk/release/app-release.apk

# CI=1 disables all interactive prompts in Expo, npm, and Gradle
export CI=1
# Suppress Gradle JVM memory warnings
export GRADLE_OPTS="-Dorg.gradle.jvmargs=-Xmx2g -XX:+HeapDumpOnOutOfMemoryError"

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
