/**
 * Schemat pliku .hydra w wersji 0.4.
 *
 * Odzwierciedla plik wzorcowy rover-01.hydra. Pola, których treść zależy od
 * packa albo od sterownika (konfiguracja komponentu, modele symulacji),
 * zostawione są jako `any` — sprawdza je schemat dostarczony przez pack,
 * a nie ten plik. Wpisanie ich tutaj oznaczałoby, że dodanie nowego czujnika
 * wymaga zmiany w rdzeniu Studia.
 */

import { NATIVE_PIXEL_FORMATS, PARTITION_SCHEMES } from './emit/plan';
import {
    any, anyOf, bool, list, map, num, obj, oneOf, optional, required, str,
    type ObjectNode,
} from './schema';

/**
 * Rodziny układów, dla których Hydra ma backend.
 *
 * `native` jest na tej liście świadomie, choć nie jest układem: to maszyna
 * deweloperska jako cel budowy — ten sam rdzeń i te same taski, atrapy HAL
 * zamiast Arduino i okno SDL zamiast panelu. Trzymanie go osobno oznaczałoby
 * drugą oś w modelu i drugi zestaw reguł w każdym emiterze.
 */
export const MCUS = ['native', 'wasm',
                     'esp32', 'esp32s2', 'esp32s3', 'esp32c3', 'esp32c6',
                     'rp2040', 'rp2350', 'stm32g4', 'stm32f4', 'stm32h7'] as const;

/**
 * Możliwości sprzętowe płytki.
 *
 * Oś podziału celowo nie przebiega po rodzinie układu. Nucleo-G474RE i płytka
 * z tym samym STM32G4 plus warstwą fizyczną Ethernetu różnią się tym, co
 * potrafią, a nie tym, jaki mają procesor — pack wymagający sieci pasuje do
 * drugiej, nie do pierwszej. Ta lista jest wspólna dla `targets[].capabilities`
 * i dla `requires` w manifeście packa.
 */
export const CAPABILITIES = [
    'i2c', 'spi', 'uart', 'pwm', 'adc', 'dac',
    'wifi', 'ble', 'ethernet',
    'psram', 'sdcard', 'usb-host', 'usb-device',
    'fpu', 'smp', 'can', 'rtc',
] as const;

const MODULE_NAMES = ['core', 'sense', 'net', 'ui', 'motion', 'ota', 'minis', 'media', 'arduboy'] as const;

/** Nadpisania modułów per cel: `off`, `on` albo zagnieżdżona konfiguracja. */
const moduleOverride = anyOf('Włączenie, wyłączenie albo nadpisanie ustawień modułu', [
    oneOf('Włącz lub wyłącz moduł w całości', ['on', 'off']),
    bool('Włącz lub wyłącz moduł w całości'),
    map('Nadpisania wybranych ustawień modułu', any('Wartość ustawienia')),
]);

const target: ObjectNode = obj('Cel sprzętowy — jedno środowisko budowania', {
    mcu: required(oneOf('Rodzina układu', MCUS)),
    board: optional(str('Plik pinów płytki, np. boards/rover_s3.hpp', {
        pattern: /\.hpp$/, patternHint: 'ścieżka musi wskazywać nagłówek .hpp',
    })),
    platformio: optional(obj('Odwzorowanie na środowisko PlatformIO', {
        board: required(str('Identyfikator płytki w PlatformIO, np. esp32-s3-devkitc-1')),
        f_cpu: optional(num('Taktowanie rdzenia', { integer: true, min: 1_000_000, unit: 'Hz' })),
        platform: optional(str('Wersja platformy, np. espressif32@7.0.1')),
        /**
         * Które pliki z `src/` wchodzą do tego celu, w składni PlatformIO —
         * np. `+<*> -<main_ntrip.cpp>`. Potrzebne, gdy projekt ma kilka
         * wariantów aplikacji: dwa pliki z `setup()` w jednym środowisku nie
         * zlinkują się, a wybór wariantu jest cechą celu, nie kodu.
         */
        build_src_filter: optional(str('Które pliki źródłowe wchodzą do celu')),
    })),
    capabilities: optional(list('Co ta płytka potrafi — patrz CAPABILITIES', oneOf('Możliwość', CAPABILITIES),
                                { unique: true })),
    memory: optional(obj('Pamięć', {
        psram: optional(oneOf('Rodzaj pamięci PSRAM', ['off', 'quad', 'opi'])),
        flash: optional(str('Rozmiar pamięci Flash, np. 16MB', {
            pattern: /^\d+(?:KB|MB|GB)$/i, patternHint: 'zapis w postaci 8MB, 16MB, 512KB',
        })),
        partitions: optional(oneOf('Schemat partycji — nazwa logiczna, nie plik', PARTITION_SCHEMES)),
    })),
    native: optional(obj('Okno programu — cel `native` (pulpit) albo `wasm` (kanwa w przeglądarce)', {
        display: optional(bool('Czy otwierać okno; false = program bez interfejsu (CI, ssh)')),
        window: optional(obj('Powierzchnia rysowania — jej rozmiar, nie rozmiar okna', {
            width:  optional(num('Szerokość powierzchni', { integer: true, min: 16, max: 4096, unit: 'px' })),
            height: optional(num('Wysokość powierzchni', { integer: true, min: 16, max: 4096, unit: 'px' })),
            scale:  optional(num('Powiększenie na ekranie; piksel bufora = kwadrat scale×scale',
                                 { integer: true, min: 1, max: 16 })),
            format: optional(oneOf('Format piksela — ten sam co panelu, który ma to zastąpić',
                                   NATIVE_PIXEL_FORMATS)),
            title:  optional(str('Tytuł okna; domyślnie nazwa projektu')),
        })),
    })),
    smp: optional(obj('Przydział tasków do rdzeni', {
        pin_tasks: optional(map('Task → numer rdzenia', num('Numer rdzenia', { integer: true, min: 0, max: 3 }))),
    })),
    modules: optional(map('Nadpisania modułów tylko dla tego celu', moduleOverride,
                          { keyHint: `dozwolone moduły: ${MODULE_NAMES.join(', ')}` })),
});

const coreModule = obj('Rdzeń: logowanie, magistrala zdarzeń, watchdog, shell', {
    log: optional(obj('Logowanie', {
        default: optional(oneOf('Domyślny poziom', ['trace', 'debug', 'info', 'warn', 'error', 'off'])),
        per_module: optional(map('Poziom dla wybranego modułu',
                                 oneOf('Poziom', ['trace', 'debug', 'info', 'warn', 'error', 'off']))),
        sinks: optional(list('Gdzie trafiają logi', oneOf('Ujście', ['uart0', 'uart1', 'ringbuf', 'rtt', 'usb', 'mqtt']),
                             { unique: true })),
        ringbuf_kb: optional(num('Rozmiar bufora cyklicznego', { integer: true, min: 1, max: 256, unit: 'KB' })),
    })),
    eventbus: optional(obj('Magistrala zdarzeń', {
        queue_depth: optional(num('Głębokość skrzynki odbiorczej', { integer: true, min: 1, max: 1024 })),
        pool: optional(list('Pule buforów dla większych ładunków',
            obj('Pula', {
                size: required(num('Rozmiar bufora', { integer: true, min: 1, unit: 'B' })),
                count: required(num('Liczba buforów', { integer: true, min: 1 })),
            }))),
    })),
    watchdog: optional(obj('Nadzorca', {
        task_timeout_ms: optional(num('Po tylu milisekundach bez oznaki życia task uznajemy za zawieszony',
                                      { integer: true, min: 1, unit: 'ms' })),
        hw: optional(bool('Użyj sprzętowego watchdoga układu')),
    })),
    shell: optional(obj('Shell diagnostyczny', {
        transports: optional(list('Kanały dostępu', oneOf('Kanał', ['usb', 'uart', 'ws', 'telnet']), { unique: true })),
        history: optional(num('Ile poleceń pamiętać', { integer: true, min: 0, max: 200 })),
    })),
});

const senseModule = obj('Czujniki', {
    hub: optional(obj('Odpytywanie', {
        max_sensors: optional(num('Ilu czujników najwyżej', { integer: true, min: 1, max: 64 })),
        timestamp: optional(oneOf('Rozdzielczość znacznika czasu', ['ms', 'us'])),
    })),
    calibration_store: optional(oneOf('Gdzie trzymać kalibrację', ['nvs', 'file', 'none'])),
});

const netModule = obj('Sieć', {
    profile: optional(str('Gotowy zestaw ustawień, np. mqtt-wifi')),
    hostname: optional(str('Nazwa urządzenia; służy też za nazwę mDNS', {
        pattern: /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/,
        patternHint: 'małe litery, cyfry i myślniki; nie zaczyna się ani nie kończy myślnikiem',
    })),
    wifi: optional(obj('Wi-Fi', {
        credentials: optional(str('Skąd wziąć dane logowania — zwykle „secrets"')),
        fallback_ap: optional(obj('Punkt dostępowy uruchamiany, gdy nie uda się połączyć', {
            ssid: required(str('Nazwa sieci')),
            timeout_s: optional(num('Po ilu sekundach wyłączyć', { integer: true, min: 10, unit: 's' })),
        })),
    })),
    mqtt: optional(obj('MQTT', {
        broker: required(str('Adres brokera, np. mqtts://mqtt.local:8883', {
            pattern: /^mqtts?:\/\/[^\s]+$/, patternHint: 'adres zaczyna się od mqtt:// albo mqtts://',
        })),
        base_topic: optional(str('Przedrostek tematów')),
        lwt: optional(obj('Testament — broker rozgłosi go, gdy urządzenie zamilknie', {
            topic: required(str('Temat')),
            payload: optional(str('Treść')),
            qos: optional(num('Poziom dostarczenia', { integer: true, min: 0, max: 2 })),
            // Bez zatrzymania testament zobaczą tylko ci, którzy akurat są
            // podłączeni — a wiadomość „urządzenie zamilkło" przydaje się
            // właśnie temu, kto podłącza się później.
            retain: optional(bool('Czy broker ma zatrzymać ostatnią wiadomość')),
        })),
        tls: optional(obj('Szyfrowanie', {
            ca: optional(str('Certyfikat urzędu certyfikacji w formacie PEM')),
            client_cert: optional(str('Certyfikat urządzenia — uwierzytelnianie dwustronne')),
            client_key: optional(str('Klucz urządzenia')),
            insecure: optional(bool('Wyłącz weryfikację tożsamości serwera — chroni tylko przed biernym podsłuchem')),
        })),
    })),
    ota: optional(obj('Aktualizacja przez sieć', {
        channel: required(str('Adres kanału aktualizacji')),
        verify: optional(str('Sposób weryfikacji wsadu, np. ed25519:keys/ota_pub.pem')),
        auto: optional(bool('Aktualizuj samoczynnie zamiast czekać na polecenie')),
    })),
});

const uiModule = obj('Interfejs użytkownika', {
    backend: optional(oneOf('Warstwa rysująca', ['hydra', 'lvgl9'])),
    theme: optional(obj('Motyw', {
        base: optional(oneOf('Wariant', ['dark', 'light'])),
        accent: optional(str('Kolor wyróżnienia', {
            pattern: /^#[0-9a-fA-F]{6}$/, patternHint: 'kolor w zapisie #rrggbb',
        })),
        scale: optional(num('Skala interfejsu', { min: 0.5, max: 4 })),
    })),
    screens: optional(list('Ekrany aplikacji', str('Nazwa klasy ekranu'), { unique: true })),
    home: optional(str('Ekran pokazywany po starcie')),
});

const motionModule = obj('Napęd', {
    kinematics: optional(obj('Model ruchu', {
        model: required(oneOf('Rodzaj napędu', ['differential', 'ackermann', 'mecanum', 'tank'])),
        wheel_mm: optional(num('Średnica koła', { min: 1, unit: 'mm' })),
        track_mm: optional(num('Rozstaw kół', { min: 1, unit: 'mm' })),
    })),
    control: optional(obj('Pętla regulacji', {
        period_us: optional(num('Okres pętli', { integer: true, min: 100, max: 100_000, unit: 'µs' })),
        deadline_policy: optional(obj('Reakcja na przekroczenie terminu', {
            miss_limit: optional(num('Ile spóźnień z rzędu wolno', { integer: true, min: 1 })),
            on_breach: optional(oneOf('Co zrobić po przekroczeniu progu', ['ignore', 'degrade', 'stop', 'reboot'])),
        })),
    })),
    safety: optional(obj('Łańcuch bezpieczeństwa', {
        estop: optional(obj('Zatrzymanie awaryjne', {
            gpio: required(str('Pin, np. Pin.EStop')),
            active: optional(oneOf('Stan aktywny', ['low', 'high'])),
        })),
        cmd_watchdog_ms: optional(num('Brak nowego zadania przez ten czas zatrzymuje napęd',
                                      { integer: true, min: 10, unit: 'ms' })),
        current_limit_a: optional(num('Próg prądowy', { min: 0.1, unit: 'A' })),
    })),
});

/**
 * Moduł IoT MyCastle.
 *
 * Łącza są listą, a nie polem: bramka ma ich dwa, węzeł jedno, a kolejność
 * decyduje o tym, które jest trasą domyślną. Sam adres urządzenia zostaje
 * w kodzie, bo to tożsamość sztuki sprzętu, a nie ustawienie projektu.
 */
/**
 * Potok multimedialny.
 *
 * Opisujemy tu **budżet i rytm**, a nie graf: kto z kim jest połączony, wynika
 * z kodu, bo połączenie niesie typ i politykę przepełnienia, których w YAML-u
 * nie da się sprawdzić przed kompilacją. Pule i okresy domen to co innego —
 * te liczby dobiera się do urządzenia, nie do algorytmu.
 */
const mediaModule = obj('Potok multimedialny: audio i obraz', {
    pools: optional(list('Pule buforów; rozmiar bloku przekłada się na opóźnienie',
        obj('Pula', {
            block_bytes: required(num('Rozmiar bloku', { integer: true, min: 16, max: 1 << 22, unit: 'B' })),
            count: required(num('Liczba bloków', { integer: true, min: 2, max: 64 })),
            memory: optional(oneOf('Skąd pamięć', ['internal', 'psram', 'dma'])),
        }))),
    domains: optional(list('Domeny czasowe — jedna domena to jeden task',
        obj('Domena', {
            name: required(str('Nazwa, np. capture')),
            period_ms: required(num('Okres kroku', { integer: true, min: 1, max: 10000, unit: 'ms' })),
            priority: optional(oneOf('Priorytet taska', ['realtime', 'high', 'normal', 'low', 'idle'])),
            core: optional(num('Rdzeń; ignorowane na układach jednordzeniowych',
                               { integer: true, min: 0, max: 3 })),
        }))),
    audio: optional(obj('Domyślne parametry strumienia audio', {
        sample_rate: optional(num('Częstotliwość próbkowania',
                                  { integer: true, min: 8000, max: 192000, unit: 'Hz' })),
        format: optional(oneOf('Format próbki', ['u8', 's16', 's24', 's32', 'f32'])),
        channels: optional(num('Liczba kanałów', { integer: true, min: 1, max: 8 })),
        frames_per_block: optional(num('Ramki w bloku; wprost wyznacza opóźnienie',
                                       { integer: true, min: 8, max: 4096 })),
    })),
});

/**
 * Zgodność z Arduboy2.
 *
 * Moduł nie ma czego konfigurować i to jest zamierzone: gra na Arduboya
 * zakłada konkretny sprzęt — ekran 128×64, sześć przycisków, 1 KB EEPROM-u —
 * a pole, które pozwalałoby to zmienić, pozwalałoby zarazem zbudować projekt,
 * w którym cudza gra nie zadziała. Rozmiar okna na celu natywnym ustawia się
 * w sekcji `native`, tak jak dla każdego innego projektu.
 */
const arduboyModule = obj('Zgodność z Arduboy2 — gry na Arduboya bez zmian w źródle', {
    scale: optional(num('Powiększenie okna na celu natywnym',
                        { integer: true, min: 1, max: 16 })),
});

const minisModule = obj('Platforma IoT MyCastle', {
    user: optional(str('Nazwa użytkownika w MyCastle')),
    heartbeat_s: optional(num('Co ile wysyłać puls; 0 = tylko telemetria',
                              { integer: true, min: 0, max: 3600, unit: 's' })),
    auto_register: optional(bool('Czy zgłaszać się do listy urządzeń po połączeniu')),
    gateway: optional(bool('Tryb bramki: subskrypcje z symbolem wieloznacznym '
                           + 'i przekazywanie ruchu urządzeń za tym')),
    links: optional(list('Łącza w kolejności rejestracji; pierwsze do serwera '
                         + 'jest trasą domyślną',
        obj('Łącze', {
            kind: required(oneOf('Rodzaj łącza', ['mqtt', 'websocket', 'rs485', 'rs232'])),
            uart: optional(num('Numer portu szeregowego', { integer: true, min: 0, max: 2 })),
            node: optional(num('Numer węzła na magistrali; 0 = bramka',
                               { integer: true, min: 0, max: 254 })),
            de_pin: optional(str('Pin sterujący nadajnikiem RS-485, np. Pin.Rs485De')),
        }))),
    routing: optional(obj('Trasowanie', {
        max_hops: optional(num('Limit przeskoków między bramkami',
                               { integer: true, min: 1, max: 8 })),
        learn: optional(bool('Czy budować tablicę tras z ruchu')),
        route_ttl_s: optional(num('Po jakim czasie ciszy zapomnieć trasę; 0 = nigdy',
                                  { integer: true, min: 0, max: 86400, unit: 's' })),
    })),
});

/**
 * Warstwa skryptowa.
 *
 * Osobno od `ota`, bo rozwiązuje inny problem. Aktualizacja wsadu wymienia
 * **całe** urządzenie razem ze sterownikami i restartem; skrypt wymienia samą
 * regułę działania, w locie i bez przerwy w telemetrii. Urządzenie pod sufitem
 * potrzebuje jednego i drugiego, ale nie w tych samych sytuacjach.
 *
 * Silnik jest wyborem projektu, nie frameworka: `ScriptModule` dostaje
 * `IScriptEngine*` i nie zna żadnego z nich. Tutaj decyduje się wyłącznie o tym,
 * czyje źródła w ogóle wejdą do wsadu.
 */
const scriptModule = obj('Skrypty i moduły WebAssembly', {
    /**
     * Silnik wykonujący. `lua` to źródło i bajtkod Lua, `wasm3` i `wamr` to
     * WebAssembly — a więc wszystko, co da się do niego skompilować, w tym C++.
     * Reguła kciuka: poniżej 256 KB RAM `wasm3` (~64 KB), powyżej `wamr`,
     * który jest szybszy i umie kod kompilowany z wyprzedzeniem.
     */
    engine: optional(oneOf('Silnik', ['lua', 'wasm3', 'wamr'])),
    period_ms: optional(num('Co ile wołać loop() skryptu',
                            { integer: true, min: 1, max: 60_000, unit: 'ms' })),
    /**
     * Ile instrukcji maszyny wirtualnej wolno wykonać w jednym przebiegu.
     * Zero znosi limit — wtedy skrypt z pętlą bez końca zawiesza swój task,
     * a nadzorca zrestartuje urządzenie.
     */
    budget: optional(num('Limit instrukcji na przebieg', { integer: true, min: 0 })),
    /** Które grupy funkcji skrypt w ogóle widzi. */
    bindings: optional(list('Udostępnione grupy funkcji',
        oneOf('Grupa', ['core', 'log', 'gpio', 'adc', 'pwm', 'i2c', 'event']),
        { unique: true })),

    /**
     * Wgrywanie przez łącze IoT. Bez tego skrypt wchodzi wyłącznie z wsadem
     * albo z shella — czyli wymaga kabla.
     */
    delivery: optional(obj('Dostarczanie przez sieć', {
        slot_bytes: optional(num('Pojemność jednego slotu magazynu; slotów są dwa',
                                 { integer: true, min: 256, max: 1 << 20, unit: 'B' })),
        /**
         * Ścieżka obrazu w systemie plików. Bez niej urządzenie po zaniku
         * zasilania wraca do skryptu wkompilowanego we wsad, a wszystko, co
         * wgrano przez sieć, przepada.
         */
        persist: optional(str('Plik, w którym przetrwa wgrany obraz')),
        /**
         * Jak długo obserwować nową wersję, zanim zostanie uznana za dobrą.
         * Skrót mówi tylko, że obraz nie uszkodził się w drodze — nie że
         * skrypt wstaje i nie wywala się w `loop()`.
         */
        trial_ms: optional(num('Okres próbny nowej wersji',
                               { integer: true, min: 0, max: 600_000, unit: 'ms' })),
        /**
         * Czy obraz musi być podpisany. Sam skrót policzy równie dobrze
         * napastnik — bez podpisu urządzenie wystawione do Internetu przyjmie
         * cudzy skrypt.
         */
        require_signature: optional(bool('Przyjmuj wyłącznie podpisane obrazy')),
    })),
});

const otaModule = obj('Aktualizacja wsadu', {
    channel: optional(str('Adres kanału aktualizacji')),
    verify: optional(str('Sposób weryfikacji')),
    auto: optional(bool('Aktualizuj samoczynnie')),
});

export const HYDRA_SCHEMA: ObjectNode = obj('Plik projektu Hydra', {
    hydra: required(str('Wersja schematu pliku', {
        pattern: /^\d+\.\d+$/, patternHint: 'wersja w postaci „0.4"',
    })),

    project: required(obj('Metadane projektu', {
        name: required(str('Nazwa projektu', {
            pattern: /^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/,
            patternHint: 'małe litery, cyfry, kropka, myślnik i podkreślenie',
        })),
        version: required(str('Wersja projektu', {
            pattern: /^\d+\.\d+\.\d+(?:[-+].+)?$/, patternHint: 'wersja semantyczna, np. 1.3.0',
        })),
        description: optional(str('Krótki opis')),
        authors: optional(list('Autorzy', str('Imię i adres'))),
        license: optional(str('Licencja')),
        framework: optional(str('Wymagany zakres wersji frameworka, np. ">=0.4.2 <0.5"')),
    })),

    targets: required(map('Cele sprzętowe', target, {
        reserved: ['default'],
        keyPattern: /^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$/,
        keyHint: 'nazwa celu: małe litery, cyfry i myślniki',
    })),

    modules: optional(obj('Konfiguracja modułów frameworka', {
        core: optional(coreModule),
        sense: optional(senseModule),
        net: optional(netModule),
        ui: optional(uiModule),
        motion: optional(motionModule),
        ota: optional(otaModule),
    script: optional(scriptModule),
    minis: optional(minisModule),
    media: optional(mediaModule),
    arduboy: optional(arduboyModule),
    })),

    dependencies: optional(map('Paczki Hydry używane przez projekt',
        anyOf('Wersja albo pełny opis źródła', [
            str('Zakres wersji, np. "^1.2.0"'),
            obj('Źródło paczki', {
                version: optional(str('Zakres wersji')),
                path: optional(str('Katalog w repozytorium')),
                git: optional(str('Adres repozytorium')),
                ref: optional(str('Gałąź, znacznik albo commit')),
            }),
        ]),
        { keyPattern: /^[a-z0-9][a-z0-9-]*$/, keyHint: 'nazwa paczki: małe litery, cyfry i myślniki' })),

    hardware: optional(obj('Sprzęt', {
        schematic: optional(str('Plik schematu', {
            pattern: /\.hsch$/, patternHint: 'schemat ma rozszerzenie .hsch',
        })),
        codegen: optional(obj('Generowanie ze schematu', {
            boards_header: optional(bool('Twórz boards/*.hpp przy zapisie schematu')),
            fail_on_erc: optional(bool('Błąd reguł elektrycznych zatrzymuje budowę')),
        })),
        buses: optional(map('Magistrale', obj('Magistrala', {
            hz: optional(num('Częstotliwość zegara', { integer: true, min: 1000, unit: 'Hz' })),
            baud: optional(num('Prędkość transmisji', { integer: true, min: 300, unit: 'bit/s' })),
            pullups: optional(oneOf('Rezystory podciągające', ['internal', 'external', 'none'])),
            recovery: optional(bool('Próbuj odblokować zawieszoną magistralę')),
            role: optional(str('Rola magistrali, np. rs485')),
            de_pin: optional(str('Pin kierunku transmisji dla RS-485')),
        }), { keyPattern: /^(i2c|spi|uart|can)\d$/, keyHint: 'nazwa magistrali: i2c0, spi1, uart1, can0…' })),
        components: optional(map('Układy na płytce', obj('Układ', {
            part: required(str('Oznaczenie i miejsce, np. „BMP280 @ i2c0:0x76"')),
            role: optional(str('Do czego służy, np. motion.encoder.left')),
            pins: optional(map('Przypisanie wyprowadzeń', str('Nazwa pinu'))),
            hub: optional(any('Ustawienia odpytywania — sprawdzane schematem z packa')),
            pwm: optional(any('Ustawienia PWM — sprawdzane schematem z packa')),
            measure: optional(any('Ustawienia pomiaru — sprawdzane schematem z packa')),
            alerts: optional(any('Progi alarmowe — sprawdzane schematem z packa')),
        }, 'allow'), { keyPattern: /^[a-z_][a-z0-9_]*$/, keyHint: 'nazwa układu: małe litery, cyfry i podkreślenia' })),
    })),

    simulation: optional(obj('Symulacja', {
        engine: optional(oneOf('Silnik', ['functional', 'qemu', 'renode'])),
        timestep_us: optional(num('Krok czasu', { integer: true, min: 1, unit: 'µs' })),
        sources: optional(map('Skąd czujniki biorą dane', any('Model źródła — zależny od packa'))),
        world: optional(obj('Świat', {
            physics: optional(str('Model fizyki')),
            arena: optional(str('Plik areny')),
        })),
        record: optional(obj('Zapis przebiegów', {
            vcd: optional(list('Magistrale do zapisania', str('Nazwa magistrali'))),
            eventbus: optional(bool('Zapisuj zdarzenia')),
        })),
    })),

    test: optional(obj('Testy', {
        host: optional(obj('Poziom 1 — na maszynie, z atrapami sprzętu', {
            env: optional(str('Środowisko')),
            sanitizers: optional(list('Kontrole czasu wykonania',
                                      oneOf('Kontrola', ['address', 'undefined', 'thread', 'leak']), { unique: true })),
            filter: optional(str('Które testy uruchamiać')),
        })),
        target: optional(obj('Poziom 2 — na układzie', {
            envs: optional(list('Cele', str('Nazwa celu'), { unique: true })),
        })),
        hil: optional(obj('Poziom 3 — na farmie sprzętowej', {
            runner: optional(str('Nazwa runnera')),
            fixtures: optional(map('Stanowisko dla celu', any('Opis stanowiska'))),
            suites: optional(map('Zestawy testów', any('Opis zestawu'))),
        })),
    })),

    secrets: optional(obj('Sekrety', {
        source: optional(str('Plik spoza repozytorium')),
        required: optional(list('Wymagane nazwy', str('Nazwa zmiennej', {
            pattern: /^[A-Z][A-Z0-9_]*$/, patternHint: 'wielkie litery, cyfry i podkreślenia',
        }), { unique: true })),
    })),

    studio: optional(obj('Ustawienia edytora — nie wpływają na wsad', {}, 'allow')),
});
