/**
 * Konfiguracja Expo dla zegarka — czytana przy budowaniu.
 *
 * Zastępuje `app.json`, bo adres serwera musi dać się podmienić bez edycji
 * pliku w repozytorium (tak samo jak w `mycastle-mobile`).
 *
 * ## Dlaczego deklaracja zegarka jest tu najważniejsza
 *
 * Wear OS to Android, więc zwykły APK **instaluje się** na zegarku bez
 * przeszkód — i właśnie dlatego brak deklaracji jest tak mylący: instalacja
 * kończy się powodzeniem, a aplikacji nie ma na liście. Program pokazuje się
 * w zegarkowym menu dopiero, gdy manifest zawiera:
 *
 *   • `<uses-feature android:name="android.hardware.type.watch" />` — mówi
 *     systemowi, że to aplikacja zegarka, a nie telefonu;
 *   • kategorię intencji, po której launcher Wear OS zbiera aplikacje.
 *
 * Zmienne środowiskowe:
 *   MYCASTLE_SERVER_URL   adres backendu (domyślnie http://192.168.0.207:1894)
 *   MYCASTLE_APP_NAME     nazwa widoczna na zegarku
 *   MYCASTLE_APP_PACKAGE  nazwa pakietu Androida
 */

const serverUrl = process.env.MYCASTLE_SERVER_URL || 'http://192.168.0.207:1894';
const appName = process.env.MYCASTLE_APP_NAME || 'MyCastleWatch';
const appPackage = process.env.MYCASTLE_APP_PACKAGE || 'com.mycastle.watch';

module.exports = {
  expo: {
    name: appName,
    slug: 'mycastle-watch',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'dark',
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#1a1a2e',
    },
    jsEngine: 'jsc',
    ios: {
      supportsTablet: true,
      bundleIdentifier: appPackage,
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#1a1a2e',
      },
      package: appPackage,
      usesCleartextTraffic: true,
    },
    web: {
      bundler: 'metro',
    },
    plugins: ['expo-asset', 'expo-font', './plugins/withWearOs'],
    extra: {
      serverUrl,
      appName,
    },
  },
};
