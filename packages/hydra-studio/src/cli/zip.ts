/**
 * Minimalny zapis archiwum ZIP.
 *
 * Potrzebny dokładnie w jednym miejscu: artefakt celu natywnego dla Windows
 * to plik wykonywalny **razem z** SDL2.dll, a przeglądarka pobiera jeden plik.
 * Bez archiwum użytkownik dostaje .exe, które nie startuje i mówi o brakującej
 * bibliotece — czyli najgorszy możliwy wynik udanej budowy.
 *
 * Piszemy to sami zamiast dokładać zależność, bo pakiet Studia ma jedną
 * (`yaml`) i ta jedna jest tu regułą, nie przypadkiem: model musi dawać się
 * wczytać w przeglądarce, a każda kolejna paczka to kolejna rzecz, która za
 * pięć lat może nie mieć wersji na aktualnego Node. Format ZIP w wariancie
 * bez podpisów i bez ZIP64 to sto linii i nie zmienił się od lat
 * dziewięćdziesiątych.
 *
 * Ograniczenia świadome: brak ZIP64 (pliki do 4 GB), brak szyfrowania,
 * brak katalogów jako osobnych wpisów. Artefakt to kilka plików po kilka MB.
 */

import { deflateRawSync } from 'node:zlib';

export interface ZipEntry {
    /** Nazwa wewnątrz archiwum; separator zawsze „/", także na Windows. */
    name: string;
    data: Buffer;
    /** Czas modyfikacji; brak = epoka MS-DOS, czyli wynik powtarzalny. */
    mtime?: Date;
}

/** Tablica CRC-32 (wielomian 0xEDB88320) — ta sama, której używa ZIP i gzip. */
const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; ++i) {
        let value = i;
        for (let bit = 0; bit < 8; ++bit) {
            value = (value & 1) !== 0 ? (value >>> 1) ^ 0xEDB88320 : value >>> 1;
        }
        table[i] = value >>> 0;
    }
    return table;
})();

function crc32(data: Buffer): number {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < data.length; ++i) {
        crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ data[i]!) & 0xFF]!;
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

/** Data i godzina w formacie MS-DOS: dwa 16-bitowe pola, sekundy co dwie. */
function dosTime(date: Date): { time: number; date: number } {
    const year = date.getFullYear();
    // Format MS-DOS liczy lata od 1980 i nie ma jak zapisać wcześniejszych.
    if (year < 1980) return { time: 0, date: (1 << 5) | 1 };
    return {
        time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
        date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    };
}

const SIG_LOCAL   = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD    = 0x06054b50;

const METHOD_STORE   = 0;
const METHOD_DEFLATE = 8;

export function createZip(entries: readonly ZipEntry[]): Buffer {
    const local: Buffer[] = [];
    const central: Buffer[] = [];
    let offset = 0;

    for (const entry of entries) {
        const name = Buffer.from(entry.name.replace(/\\/g, '/'), 'utf8');
        const crc = crc32(entry.data);

        const deflated = deflateRawSync(entry.data, { level: 9 });
        // Kompresja bywa większa od źródła (plik już spakowany, np. .png
        // albo binarka z sekcją zasobów). Wtedy zapisujemy bez kompresji —
        // tak nakazuje format i tak robią wszystkie implementacje.
        const compressed = deflated.length < entry.data.length;
        const payload = compressed ? deflated : entry.data;
        const method  = compressed ? METHOD_DEFLATE : METHOD_STORE;

        const { time, date } = dosTime(entry.mtime ?? new Date(1980, 0, 1));

        const header = Buffer.alloc(30);
        header.writeUInt32LE(SIG_LOCAL, 0);
        header.writeUInt16LE(20, 4);              // wymagana wersja: 2.0
        header.writeUInt16LE(0x0800, 6);          // nazwy w UTF-8
        header.writeUInt16LE(method, 8);
        header.writeUInt16LE(time, 10);
        header.writeUInt16LE(date, 12);
        header.writeUInt32LE(crc, 14);
        header.writeUInt32LE(payload.length, 18);
        header.writeUInt32LE(entry.data.length, 22);
        header.writeUInt16LE(name.length, 26);
        header.writeUInt16LE(0, 28);              // brak pola dodatkowego

        local.push(header, name, payload);

        const directory = Buffer.alloc(46);
        directory.writeUInt32LE(SIG_CENTRAL, 0);
        directory.writeUInt16LE(20, 4);           // wersja twórcy
        directory.writeUInt16LE(20, 6);           // wersja wymagana
        directory.writeUInt16LE(0x0800, 8);
        directory.writeUInt16LE(method, 10);
        directory.writeUInt16LE(time, 12);
        directory.writeUInt16LE(date, 14);
        directory.writeUInt32LE(crc, 16);
        directory.writeUInt32LE(payload.length, 20);
        directory.writeUInt32LE(entry.data.length, 24);
        directory.writeUInt16LE(name.length, 28);
        directory.writeUInt16LE(0, 30);           // pole dodatkowe
        directory.writeUInt16LE(0, 32);           // komentarz
        directory.writeUInt16LE(0, 34);           // numer dysku
        directory.writeUInt16LE(0, 36);           // atrybuty wewnętrzne
        // Atrybuty zewnętrzne: bit wykonywalności uniksowej (0o755) w górnych
        // 16 bitach. Bez tego rozpakowany na macOS plik nie ma prawa `x`
        // i uruchomienie kończy się „permission denied".
        directory.writeUInt32LE((0o100755 << 16) >>> 0, 38);
        directory.writeUInt32LE(offset, 42);

        central.push(directory, name);
        offset += header.length + name.length + payload.length;
    }

    const centralBuffer = Buffer.concat(central);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(SIG_EOCD, 0);
    end.writeUInt16LE(0, 4);                      // numer dysku
    end.writeUInt16LE(0, 6);                      // dysk z katalogiem
    end.writeUInt16LE(entries.length, 8);
    end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(centralBuffer.length, 12);
    end.writeUInt32LE(offset, 16);
    end.writeUInt16LE(0, 20);                     // komentarz archiwum

    return Buffer.concat([...local, centralBuffer, end]);
}
