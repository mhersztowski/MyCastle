/**
 * withBooxPen — dopisuje repozytorium Onyksa do wygenerowanego projektu Androida.
 *
 * ## Dlaczego to nie mogło zostać w module
 *
 * Naturalnym miejscem na `maven { url … }` jest `build.gradle` samego modułu
 * `boox-pen` — i tam ten wpis stał, i **nie działał**. Gradle rozwiązuje
 * zewnętrzne zależności modułu projektowego repozytoriami **konsumenta**, a nie
 * modułu: rozwiązywana konfiguracja to `:app:releaseRuntimeClasspath`, więc
 * liczą się repozytoria `:app`. Objaw był mylący, bo komunikat wskazuje na
 * `project :app > project :expo > project :boox-pen` i wygląda, jakby chodziło
 * o moduł:
 *
 *     Could not find com.onyx.android.sdk:onyxsdk-pen:1.5.4.3.
 *     Searched in the following locations: …
 *
 * — a na liście przeszukanych miejsc repozytorium Onyksa po prostu nie ma.
 *
 * ## Dlaczego wtyczka, a nie `sed` w skrypcie budowania
 *
 * `android/build.gradle` powstaje od nowa przy każdym `expo prebuild --clean`.
 * Łatka nakładana po fakcie musiałaby trafiać w tekst, który za chwilę zostanie
 * wygenerowany ponownie. Tutaj wpis jest częścią konfiguracji i przeżywa
 * regenerację — dokładnie jak `withWearOs` w aplikacji zegarkowej.
 */

const { withProjectBuildGradle } = require('expo/config-plugins');

const ONYX_REPO = 'https://repo.boox.com/repository/maven-public/';

/** Znacznik idempotencji — `prebuild` bywa uruchamiany kilka razy na tym samym drzewie. */
const MARKER = 'repo.boox.com';

const BLOCK = [
  '',
  '        // SDK pióra Onyksa — jedyne miejsce, w którym te artefakty istnieją;',
  '        // Onyx nie publikuje ich w Maven Central. Wpis musi być tutaj, a nie',
  '        // w module `boox-pen`: zależności modułu projektowego rozwiązuje',
  '        // repozytoriami konsumenta, czyli `:app`.',
  `        maven { url '${ONYX_REPO}' }`,
].join('\n');

/**
 * Sama modyfikacja tekstu — bez opakowania Expo, żeby dało się ją sprawdzić
 * bez uruchamiania prebuildu (który trwa minuty i wymaga kontenera).
 */
function addOnyxRepository(contents) {
  if (contents.includes(MARKER)) return contents;
  const anchor = /allprojects\s*\{\s*\n(\s*)repositories\s*\{/;
  if (!anchor.test(contents)) {
    // Lepiej zatrzymać budowanie tutaj niż pozwolić mu dojść do
    // nierozstrzygalnej zależności pół godziny później.
    throw new Error(
      'withBooxPen: nie znalazłem bloku allprojects { repositories { … } } ' +
        'w android/build.gradle — szablon Expo się zmienił',
    );
  }
  return contents.replace(anchor, (match) => `${match}${BLOCK}`);
}

function withBooxPen(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error('withBooxPen: oczekiwałem build.gradle w Groovym, dostałem ' + cfg.modResults.language);
    }
    cfg.modResults.contents = addOnyxRepository(cfg.modResults.contents);
    return cfg;
  });
}

module.exports = withBooxPen;
module.exports.addOnyxRepository = addOnyxRepository;
