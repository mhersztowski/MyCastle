/**
 * Wgranie modułu WebAssembly na urządzenie.
 *
 * Cienka warstwa nad endpointem backendu. Cała robota — fragmentowanie,
 * `begin`/`chunk`/`commit`, sprzątanie po nieudanym transferze — dzieje się po
 * stronie serwera, bo rozmiar bufora wiadomości jest własnością urządzenia,
 * a nie przeglądarki. Panel wysyła moduł raz.
 */

/** Kody odmowy, które urządzenie potrafi zwrócić. Każdy znaczy co innego. */
export type ScriptUploadCode =
    | 'busy'       // trwa okres próbny poprzedniej wersji
    | 'variant'    // silnik urządzenia nie wykona obrazu w tej postaci
    | 'unsigned'   // urządzenie wymaga podpisu, a obraz go nie ma
    | 'checksum'   // obraz uszkodzony w drodze
    | 'signature'  // podpis nie zgadza się z kluczem urządzenia
    | 'too_large'  // obraz nie mieści się w slocie magazynu
    | 'load_failed'// skrypt nie wstał; urządzenie już się wycofało
    | 'failed';

export class ScriptUploadError extends Error {
    constructor(message: string, readonly code: ScriptUploadCode) {
        super(message);
        this.name = 'ScriptUploadError';
    }
}

/** Czytelny opis odmowy — kod sam w sobie nic nie mówi użytkownikowi. */
const EXPLANATION: Record<ScriptUploadCode, string> = {
    busy: 'Urządzenie obserwuje jeszcze poprzednią wersję. Poczekaj na koniec okresu próbnego.',
    variant: 'Silnik na urządzeniu nie wykona modułu w tej postaci.',
    unsigned: 'Urządzenie przyjmuje wyłącznie podpisane moduły.',
    checksum: 'Obraz uszkodził się w drodze. Spróbuj ponownie.',
    signature: 'Podpis nie zgadza się z kluczem urządzenia.',
    too_large: 'Moduł nie mieści się w pamięci przeznaczonej na skrypt.',
    load_failed: 'Moduł nie wstał na urządzeniu — wróciło do poprzedniej wersji.',
    failed: 'Wgrywanie nie powiodło się.',
};

function toBase64(bytes: Uint8Array): string {
    // Porcjami, bo `String.fromCharCode(...bytes)` przy kilkudziesięciu
    // kilobajtach przekracza limit argumentów wywołania.
    let binary = '';
    const step = 0x8000;
    for (let at = 0; at < bytes.length; at += step) {
        binary += String.fromCharCode(...bytes.subarray(at, at + step));
    }
    return btoa(binary);
}

export interface UploadScriptOptions {
    variant?: 'wasm' | 'src';
    /** Nazwa w komunikatach o błędach skryptu, np. `=v7`. */
    name?: string;
    /**
     * Klucz podpisu. Urządzenie z ustawionym kluczem odrzuca obraz bez podpisu
     * **przed** transferem — sam skrót mówi wyłącznie, że nic się nie uszkodziło
     * w drodze, a policzy go równie dobrze napastnik.
     *
     * Podpis liczy serwer, bo obraz i tak przez niego przechodzi; klucz nie
     * zostaje nigdzie zapisany.
     */
    hmacKey?: string;
}

/**
 * Wysyła moduł na urządzenie. Rzuca `ScriptUploadError` z kodem odmowy —
 * panel rozróżnia „poczekaj" od „to nie zadziała".
 */
export async function uploadScriptModule(
    userName: string,
    deviceName: string,
    wasm: Uint8Array,
    options: UploadScriptOptions = {},
): Promise<void> {
    const response = await fetch(
        `/api/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/ext/script/upload`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                data: toBase64(wasm),
                variant: options.variant ?? 'wasm',
                ...(options.name ? { name: options.name } : {}),
                ...(options.hmacKey ? { hmacKey: options.hmacKey } : {}),
            }),
        },
    );

    if (response.ok) return;

    const body = await response.json().catch(() => ({})) as { code?: string; error?: string };
    const code = (body.code ?? 'failed') as ScriptUploadCode;
    throw new ScriptUploadError(
        `${EXPLANATION[code] ?? EXPLANATION.failed}${body.error ? ` (${body.error})` : ''}`,
        code,
    );
}

export interface DeviceScriptStatus {
    engine?: string;
    /** Pojemność jednego slotu — największy obraz, jaki urządzenie przyjmie. */
    capacity?: number;
    /** Trwa obserwacja świeżo wgranej wersji; kolejny transfer dostanie `busy`. */
    trial?: boolean;
    /** Czy jest dokąd wrócić, gdyby nowa wersja nie wstała. */
    canRollback?: boolean;
    sha256?: string;
}

/** Stan urządzenia — po nim panel wie, czy w ogóle jest gdzie wgrywać. */
export async function fetchScriptStatus(
    userName: string,
    deviceName: string,
): Promise<DeviceScriptStatus | null> {
    const response = await fetch(
        `/api/users/${encodeURIComponent(userName)}/devices/${encodeURIComponent(deviceName)}/ext/script/status`,
    );
    if (!response.ok) return null;
    return await response.json() as DeviceScriptStatus;
}
