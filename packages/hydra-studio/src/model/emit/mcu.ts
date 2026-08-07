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
