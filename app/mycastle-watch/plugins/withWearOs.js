/**
 * withWearOs — dopisuje do manifestu to, bez czego Wear OS nie pokaże aplikacji.
 *
 * Zegarek z Wear OS jest Androidem, więc zwykły APK **instaluje się** na nim bez
 * przeszkód. I to jest właśnie mylące: `adb install` kończy się słowem `Success`,
 * a aplikacji nie ma w menu zegarka — bo launcher Wear OS pokazuje wyłącznie te
 * programy, które same się zadeklarowały jako zegarkowe.
 *
 * Plugin, a nie `sed` w skrypcie budowania: manifest powstaje z konfiguracji przy
 * każdym `expo prebuild --clean`, więc łatka nakładana po fakcie musi trafiać
 * w tekst, który za chwilę zostanie wygenerowany od nowa. Tutaj deklaracja jest
 * częścią konfiguracji i przeżywa regenerację.
 *
 * Dokładane są trzy rzeczy:
 *
 *  • `uses-feature android.hardware.type.watch` — mówi systemowi, czym ta
 *    aplikacja jest. Bez tego nie ma jej w menu.
 *  • `meta-data com.google.android.wearable.standalone` — aplikacja działa sama,
 *    bez części telefonowej. Nasza łączy się z serwerem po Wi-Fi, więc telefon
 *    nie jest jej do niczego potrzebny.
 *  • `uses-library com.google.android.wearable` z `required="false"` — biblioteka
 *    Wear OS jest opcjonalna, więc ten sam APK zainstaluje się także na telefonie
 *    (przydaje się przy sprawdzaniu, czy WebView w ogóle dochodzi do serwera).
 */

const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const WATCH_FEATURE = 'android.hardware.type.watch';
const WEARABLE_LIBRARY = 'com.google.android.wearable';

/**
 * Sama modyfikacja manifestu — bez opakowania Expo.
 *
 * Wydzielone, żeby dało się to sprawdzić bez uruchamiania prebuildu:
 * eksporty `expo/config-plugins` są nieprzepisywalne (`configurable: false`),
 * więc atrapy nie da się pod nie podstawić. Wynik jest ten sam, a błąd wychodzi
 * w sekundy zamiast po dwudziestu minutach budowania w kontenerze.
 *
 * Funkcja jest **idempotentna**: `expo prebuild` bywa uruchamiany kilka razy na
 * tym samym drzewie, a zdublowany `<uses-feature>` to błąd scalania manifestów.
 */
function applyWearOsManifest(manifest, application) {
  manifest['uses-feature'] = manifest['uses-feature'] ?? [];
  if (!manifest['uses-feature'].some((item) => item.$?.['android:name'] === WATCH_FEATURE)) {
    manifest['uses-feature'].push({ $: { 'android:name': WATCH_FEATURE } });
  }

  /*
   * Biblioteka Wear OS jako **opcjonalna**.
   *
   * Przy `required="true"` APK odmówiłby instalacji na telefonie — a to
   * najprostszy sposób sprawdzenia, czy WebView dochodzi do serwera, zanim
   * zacznie się walka z parowaniem zegarka.
   */
  application['uses-library'] = application['uses-library'] ?? [];
  if (!application['uses-library'].some((l) => l.$?.['android:name'] === WEARABLE_LIBRARY)) {
    application['uses-library'].push({
      $: { 'android:name': WEARABLE_LIBRARY, 'android:required': 'false' },
    });
  }

  application['meta-data'] = application['meta-data'] ?? [];
  const standalone = application['meta-data'].find(
    (m) => m.$?.['android:name'] === 'com.google.android.wearable.standalone',
  );
  if (standalone) {
    standalone.$['android:value'] = 'true';
  } else {
    application['meta-data'].push({
      $: {
        'android:name': 'com.google.android.wearable.standalone',
        'android:value': 'true',
      },
    });
  }

  return manifest;
}

function withWearOs(config) {
  return withAndroidManifest(config, (cfg) => {
    applyWearOsManifest(
      cfg.modResults.manifest,
      AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults),
    );
    return cfg;
  });
}

module.exports = withWearOs;
module.exports.applyWearOsManifest = applyWearOsManifest;
