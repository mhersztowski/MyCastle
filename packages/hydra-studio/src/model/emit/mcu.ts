/**
 * Co trzeba wiedzieć o układzie, żeby zbudować dla niego wsad.
 *
 * Tablica jest zapisem wiedzy zdobytej przy uruchamianiu prawdziwych buildów
 * Hydry na pięciu platformach. Każdy wpis w `flags` i `settings` ma za sobą
 * konkretną nieudaną kompilację — bez nich generator produkowałby pliki, które
 * wyglądają rozsądnie i nie działają. To jest właściwie cała wartość tej
 * warstwy: użytkownik nie musi tego odkrywać po raz drugi.
 */

export interface McuProfile {
    /**
     * Rodzaj celu.
     *
     * `mcu` — wsad na układ, budowany przez PlatformIO.
     * `native` — program na maszynę deweloperską, budowany CMake'em. Wyniku
     * nie da się przenieść między systemami, więc ta gałąź ma własny emiter
     * i własne presety (patrz emit/host.ts).
     * `wasm` — ten sam program dla przeglądarki, budowany CMake'em przez
     * emscripten. W odróżnieniu od `native` wynik **jest** przenośny: jeden
     * `.wasm` chodzi na każdym systemie, więc nie ma tu presetów per maszyna.
     */
    kind?: 'mcu' | 'native' | 'wasm';
    /** Platforma PlatformIO. */
    platform: string;
    /** Domyślna płytka PlatformIO, gdy `.hydra` jej nie podaje. */
    defaultBoard: string;
    /** Rdzeń Arduino, gdy platforma daje wybór. */
    core?: string;
    /** Flagi wymagane, żeby wsad w ogóle się zbudował. */
    flags?: readonly string[];
    /** Ustawienia PlatformIO poza flagami. */
    settings?: Readonly<Record<string, string>>;
    /** Biblioteki, których nie da się zadeklarować w library.json. */
    libDeps?: readonly string[];
    /** Możliwości typowe dla układu — punkt wyjścia, gdy `.hydra` milczy. */
    capabilities: readonly string[];
    /** Czy jest jednostka zmiennoprzecinkowa; bez niej regulatory idą na Q16.16. */
    hasFpu: boolean;
}

const ARM_TOOLCHAIN_NOTE = 'stm32duino/STM32duino FreeRTOS@^10.3.2';

export const MCU_PROFILES: Readonly<Record<string, McuProfile>> = {
    /**
     * Maszyna deweloperska — pełnoprawny cel, nie tryb podglądu.
     *
     * Chodzi ten sam rdzeń, te same taski i ta sama magistrala; wymienione są
     * wyłącznie backendy: HAL na atrapy, scheduler na pthready, panel na okno
     * SDL. Dzięki temu interfejs projektuje się bez sprzętu, a logikę
     * uruchamia pod sanitizerami.
     *
     * Możliwości obejmują magistrale, choć na PC ich nie ma. To nie pomyłka:
     * atrapa I2C jest zasilana z sekcji `simulation.sources`, więc pack
     * czujnika naprawdę działa na tym celu — tylko z modelu, a nie z układu.
     * Wykluczenie ich oznaczałoby, że projekt z jednym czujnikiem przestaje
     * dać się otworzyć w oknie, czyli że cel `native` nie służy do niczego.
     */
    native: {
        kind: 'native',
        platform: 'native',
        defaultBoard: 'native',
        capabilities: ['i2c', 'spi', 'uart', 'pwm', 'adc', 'fpu', 'smp'],
        hasFpu: true,
    },

    /**
     * Przeglądarka — ten sam program, co na celu `native`, tylko rysowany
     * do kanwy zamiast do okna.
     *
     * Wymienione są dokładnie te same backendy (HAL na atrapy, panel na SDL),
     * bo emscripten ma własny port SDL2 i `SdlDisplay` kompiluje się pod niego
     * bez zmian. Różnice są dwie i obie leżą poza profilem: budowanie idzie
     * przez `emcmake`, a wynik nie jest programem systemu, tylko parą
     * `.js` + `.wasm` do wczytania na stronie.
     *
     * Brak `smp` w możliwościach nie jest przeoczeniem. Wątek w emscriptenie
     * to Web Worker, a ten wymaga SharedArrayBuffer, czyli nagłówków
     * COOP/COEP na serwerze — a te odcinają stronie zasoby cross-origin.
     * Cel przeglądarkowy jest jednowątkowy świadomie; aplikacja z własną
     * pętlą woła `App::housekeeping()` sama (`housekeepingMs(0)`).
     *
     * `ethernet` jest tu z rozmysłem, choć karta nie ma karty sieciowej.
     * Gniazd TCP w przeglądarce nie ma, więc `browserTcpBridge()` pożycza je
     * od gospodarza strony przez `/ws/tcp` — z punktu widzenia modułu `net`
     * łącze jest zwykłe i przewodowe. Bez tego wpisu każdy cel przeglądarkowy
     * z włączonym `net` dostawał ostrzeżenie o braku możliwości, mimo że
     * budował się i łączył poprawnie.
     */
    wasm: {
        kind: 'wasm',
        platform: 'native',
        defaultBoard: 'wasm',
        capabilities: ['i2c', 'spi', 'uart', 'pwm', 'adc', 'fpu', 'ethernet'],
        hasFpu: true,
    },
    esp32: {
        platform: 'espressif32',
        defaultBoard: 'esp32dev',
        capabilities: ['i2c', 'spi', 'uart', 'pwm', 'adc', 'dac', 'wifi', 'ble', 'smp', 'fpu', 'rtc', 'can'],
        hasFpu: true,
    },
    esp32s2: {
        platform: 'espressif32',
        defaultBoard: 'esp32-s2-saola-1',
        capabilities: ['i2c', 'spi', 'uart', 'pwm', 'adc', 'dac', 'wifi', 'psram', 'usb-device', 'fpu', 'rtc'],
        hasFpu: true,
    },
    esp32s3: {
        platform: 'espressif32',
        defaultBoard: 'esp32-s3-devkitc-1',
        capabilities: ['i2c', 'spi', 'uart', 'pwm', 'adc', 'wifi', 'ble', 'psram',
                       'usb-device', 'usb-host', 'smp', 'fpu', 'rtc'],
        hasFpu: true,
    },
    esp32c3: {
        platform: 'espressif32',
        defaultBoard: 'esp32-c3-devkitm-1',
        // C3 nie ma USB-OTG, tylko sprzętowe USB Serial/JTAG. Bez ARDUINO_USB_MODE
        // rdzeń nie deklaruje `Serial` w ogóle: HardwareSerial oddaje tę nazwę na
        // rzecz CDC, a HWCDC deklaruje ją dopiero przy tej fladze.
        flags: ['-D ARDUINO_USB_CDC_ON_BOOT=1', '-D ARDUINO_USB_MODE=1'],
        capabilities: ['i2c', 'spi', 'uart', 'pwm', 'adc', 'wifi', 'ble', 'usb-device', 'rtc'],
        hasFpu: false,
    },
    esp32c6: {
        platform: 'espressif32',
        defaultBoard: 'esp32-c6-devkitc-1',
        flags: ['-D ARDUINO_USB_CDC_ON_BOOT=1', '-D ARDUINO_USB_MODE=1'],
        capabilities: ['i2c', 'spi', 'uart', 'pwm', 'adc', 'wifi', 'ble', 'usb-device', 'rtc'],
        hasFpu: false,
    },
    rp2040: {
        platform: 'https://github.com/maxgerhardt/platform-raspberrypi.git',
        defaultBoard: 'pico',
        core: 'earlephilhower',
        // Rdzeń Philhowera kompiluje FreeRTOS dopiero po tym przełączniku;
        // bez niego nagłówek jądra celowo przerywa kompilację komunikatem
        // „#define __FREERTOS 1 to use FreeRTOS in your application".
        flags: ['-D __FREERTOS=1'],
        capabilities: ['i2c', 'spi', 'uart', 'pwm', 'adc', 'usb-device', 'smp'],
        hasFpu: false,   // Cortex-M0+ — regulatory pracują na Q16.16
    },
    rp2350: {
        platform: 'https://github.com/maxgerhardt/platform-raspberrypi.git',
        defaultBoard: 'rpipico2',
        core: 'earlephilhower',
        flags: ['-D __FREERTOS=1'],
        capabilities: ['i2c', 'spi', 'uart', 'pwm', 'adc', 'usb-device', 'smp', 'fpu'],
        hasFpu: true,
    },
    stm32g4: {
        platform: 'ststm32',
        defaultBoard: 'nucleo_g474re',
        // FreeRTOS musi być zadeklarowany w środowisku, a nie w library.json:
        // filtr platform nie działa dla zależności z rejestru i pakiet STM32
        // wciągałby się także do budowy dla ESP32 i RP2040.
        libDeps: [ARM_TOOLCHAIN_NOTE],
        settings: { 'build_flags.extra': '-D HAL_IWDG_MODULE_ENABLED' },
        capabilities: ['i2c', 'spi', 'uart', 'pwm', 'adc', 'dac', 'can', 'fpu', 'rtc'],
        hasFpu: true,
    },
    stm32f4: {
        platform: 'ststm32',
        defaultBoard: 'nucleo_f411re',
        libDeps: [ARM_TOOLCHAIN_NOTE],
        capabilities: ['i2c', 'spi', 'uart', 'pwm', 'adc', 'dac', 'can', 'fpu', 'rtc'],
        hasFpu: true,
    },
    stm32h7: {
        platform: 'ststm32',
        defaultBoard: 'nucleo_h743zi',
        libDeps: [ARM_TOOLCHAIN_NOTE],
        capabilities: ['i2c', 'spi', 'uart', 'pwm', 'adc', 'dac', 'can', 'ethernet', 'fpu', 'rtc', 'sdcard'],
        hasFpu: true,
    },
};

export function profileFor(mcu: string): McuProfile | undefined {
    return MCU_PROFILES[mcu];
}
