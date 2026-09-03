/**
 * Dynamic Expo config — reads env vars at build time.
 *
 * Env vars:
 *   MYCASTLE_SERVER_URL   URL of the backend / app  (default: http://192.168.0.207:1894)
 *   MYCASTLE_APP_NAME     Display name shown on Android (default: MyCastle)
 *   MYCASTLE_APP_PACKAGE  Android package name       (default: com.mycastle.mobile)
 *   MYCASTLE_APP_SLUG     Expo slug                  (default: mycastle-mobile)
 */

const serverUrl  = process.env.MYCASTLE_SERVER_URL  || 'http://192.168.0.207:1894';
const appName    = process.env.MYCASTLE_APP_NAME    || 'MyCastle';
const appPackage = process.env.MYCASTLE_APP_PACKAGE || 'com.mycastle.mobile';
const appSlug    = process.env.MYCASTLE_APP_SLUG    || 'mycastle-mobile';

module.exports = {
  expo: {
    name: appName,
    slug: appSlug,
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'automatic',
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
      // `resize` (→ windowSoftInputMode=adjustResize) skraca okno WebView, gdy
      // wychodzi klawiatura. Tego trybu trzyma się detekcja klawiatury w
      // edytorze kodu (`keyboardInset.ts`) — przy `pan` okno jedzie poza ekran
      // bez żadnej zmiany wymiarów, więc pasek kursora nie miałby się po czym
      // zorientować. Expo używa `resize` domyślnie; zapisujemy to jawnie.
      softwareKeyboardLayoutMode: 'resize',
      /*
       * Mikrofon dla asystentek głosowych — Aury w MyCastle i Kasi w Media.
       *
       * `react-native-webview` umie poprosić o uprawnienie w imieniu strony
       * (obsługuje `PermissionRequest`), ale Android odrzuci prośbę bez
       * pokazania okna, jeśli uprawnienia nie ma w manifeście. Objaw jest
       * mylący: `getUserMedia` odpowiada odmową natychmiast, tak samo jak przy
       * świadomym odrzuceniu przez użytkownika — więc wygląda to na decyzję,
       * której nikt nie podjął.
       *
       * `MODIFY_AUDIO_SETTINGS` jest potrzebne, żeby przełączyć tor audio na
       * czas nagrywania; bez niego mikrofon bywa wyciszany przez odtwarzanie.
       */
      permissions: [
        'android.permission.RECORD_AUDIO',
        'android.permission.MODIFY_AUDIO_SETTINGS',
      ],
    },
    web: {
      bundler: 'metro',
    },
    plugins: ['expo-asset', 'expo-font', './plugins/withBooxPen'],
    extra: {
      serverUrl,
      appName,
    },
  },
};
