#!/usr/bin/env bash
# Build MyCastleCAD Mobile APK — WebView wrapper pointing at the CAD app (port 1898).
# Run from repo root:
#   docker compose -f docker-compose.cli.yml run --rm android /workspace/app/mycastle-mobile/build-cad.sh
#
# Output: app/mycastle-mobile/android/app/build/outputs/apk/release/app-release.apk

export MYCASTLE_APP_NAME=MyCastleCAD
export MYCASTLE_SERVER_URL=https://cad.hersztowski.org
export MYCASTLE_APP_PACKAGE=com.mycastle.cad
export MYCASTLE_APP_SLUG=mycastle-cad

exec "$(dirname "$0")/build.sh"
