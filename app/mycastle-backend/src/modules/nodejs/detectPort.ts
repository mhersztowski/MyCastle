/**
 * detectPort.ts — wyłuskanie adresu serwera z wyjścia procesu.
 *
 * Skrypt `dev` prawie zawsze nasłuchuje, a jedynym śladem jest linia w logu.
 * Wyłapanie jej zamyka pętlę „uruchom → zobacz": zamiast przepisywać port do
 * paska adresu, użytkownik dostaje odsyłacz.
 *
 * Rozpoznanie jest **ostrożne**. Fałszywy adres jest gorszy niż jego brak:
 * odsyłacz prowadzący donikąd każe sprawdzać, czy serwer w ogóle wstał.
 * Dlatego „done in 1234 ms" nie jest portem 1234, a wersja „webpack 5.90.0"
 * nie jest niczym.
 */

/** Zdejmuje kolory ANSI — bez tego adres z Vite nie daje się dopasować. */
function stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
}

const VALID_PORT = (port: number): boolean => port > 0 && port <= 65535;

/** Adres nasłuchu nie jest adresem, pod który da się wejść. */
const browsable = (host: string): string =>
    (host === '0.0.0.0' || host === '[::]' || host === '::') ? 'localhost' : host;

export function detectServerUrl(line: string): string | null {
    const text = stripAnsi(String(line ?? ''));

    // 1. Pełny adres — najpewniejszy przypadek.
    const url = /https?:\/\/([A-Za-z0-9_.:[\]-]+?):(\d{1,5})(\/\S*)?/.exec(text);
    if (url) {
        const port = Number(url[2]);
        if (VALID_PORT(port)) {
            const path = url[3] ?? '';
            return `http://${browsable(url[1])}:${port}${path}`;
        }
    }

    // 2. „listening on port 4000" — słowo `port` jest tu wymagane, bo bez niego
    //    każda liczba w logu udawałaby adres.
    const named = /\bport\s*:?\s*(\d{2,5})\b/i.exec(text);
    if (named) {
        const port = Number(named[1]);
        if (VALID_PORT(port)) return `http://localhost:${port}`;
    }

    // 3. `host:port` — tylko dla adresów wyglądających na adres nasłuchu,
    //    żeby „webpack 5.90.0" nie zostało uznane za port.
    const hostPort = /\b(localhost|127\.0\.0\.1|0\.0\.0\.0)\s*:\s*(\d{2,5})\b/.exec(text);
    if (hostPort) {
        const port = Number(hostPort[2]);
        if (VALID_PORT(port)) return `http://${browsable(hostPort[1])}:${port}`;
    }

    return null;
}
