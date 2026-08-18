#!/usr/bin/env bash
# Build MyCastleMedia Mobile APK — WebView wrapper pointing at media.hersztowski.org.
# Run from repo root:
#   docker compose -f docker-compose.cli.yml run --rm android /workspace/app/mycastle-mobile/build-media.sh
#
# Bez wtyczki compose (Colima + docker z Homebrew) to samo bez niej:
#   docker run --rm --privileged -v "$PWD":/workspace -w /workspace \
#     mycastle-android:local /workspace/app/mycastle-mobile/build-media.sh
#
# `--privileged` jest wymagane: build.sh rejestruje emulację QEMU x86_64,
# bez której aapt2 nie ruszy na ARM-ie.
#
# Output: app/mycastle-mobile/android/app/build/outputs/apk/release/app-release.apk

export MYCASTLE_APP_NAME=MyCastleMedia
export MYCASTLE_SERVER_URL=https://media.hersztowski.org
export MYCASTLE_APP_PACKAGE=com.mycastle.media
export MYCASTLE_APP_SLUG=mycastle-media

exec "$(dirname "$0")/build.sh"
