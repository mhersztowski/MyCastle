/**
 * Wgrywanie wsadu z przeglądarki.
 *
 * Wydzielone z `mycastle-web`, bo tej samej drogi potrzebuje edytor Monaco:
 * aplikacje nie mogą importować jedna z drugiej, a duplikat protokołu
 * rozjechałby się przy pierwszej poprawce po jednej ze stron.
 *
 * Zakres jest celowo wąski — sam transport i sam protokół. Dialog wgrywania
 * zostaje w aplikacji, bo w każdej wygląda inaczej: w MyCastle dokłada listę
 * gotowych wsadów i rejestr urządzeń, w edytorze wgrywa wyłącznie to, co
 * przed chwilą powstało z budowy.
 *
 * **Obsługiwane układy to rodzina ESP32** i wynika to z `esptool-js`, a nie
 * z tej paczki. RP2040/RP2350 wgrywa się plikiem `.uf2` na dysk masowy,
 * a STM32 wymaga DFU albo ST-Linka — obie drogi są inne na tyle, że nie mają
 * czego dzielić z tym kodem.
 */

export { WebSerialService } from './WebSerialService';
export type { WebSerialOptions } from './WebSerialService';

export { EspFlashService, readFileAsBinaryString } from './EspFlashService';
export type {
    FlashFileEntry,
    FlashProgress,
    FlashSettings,
    FlashState,
} from './EspFlashService';
