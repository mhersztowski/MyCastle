/**
 * Wstawianie komponentu z biblioteki do pliku projektu.
 *
 * Przeciągnięcie czujnika z panelu bocznego musi dopisać dwie rzeczy: paczkę
 * do `dependencies` i sam układ do `hardware.components`. Robimy to
 * przedziałami tekstu, tak jak każdą inną zmianę — plik zostaje nietknięty
 * poza dopisanymi wierszami, a cofnięcie jednym krokiem usuwa cały wpis.
 *
 * Wszystko, co da się rozstrzygnąć bez pytania użytkownika, rozstrzygamy tutaj:
 * wolny adres na magistrali, nazwa niekolidująca z istniejącymi, magistrala
 * pasująca do wymagań paczki. Formularz z czterema polami do wypełnienia przy
 * każdym czujniku byłby wolniejszy od wpisania tego ręcznie.
 */

import type { HydraDocument, PathSegment } from './document';
import type { PackManifest } from './pack';

export interface InsertRequest {
    manifest: PackManifest;
    /** Nazwa układu w projekcie; brak — wyprowadzimy z nazwy paczki. */
    name?: string;
    /** Magistrala; brak — wybierzemy pierwszą pasującą do wymagań. */
    bus?: string;
    /** Adres na magistrali; brak — pierwszy wolny z listy paczki. */
    address?: string;
}

export interface InsertPlan {
    /** Nazwa, pod którą układ trafi do pliku. */
    name: string;
    bus: string | undefined;
    address: string | undefined;
    /** Wartość pola `part`, np. „BMP280 @ i2c0:0x76". */
    part: string;
    /** Czego brakuje, żeby wstawienie miało sens. */
    problems: string[];
}

/**
 * Rozstrzyga szczegóły wstawienia, nie zmieniając jeszcze pliku.
 *
 * Studio pokazuje wynik przed zatwierdzeniem — użytkownik widzi, gdzie
 * komponent wyląduje i pod jakim adresem, zanim cokolwiek się zapisze.
 */
export function planInsert(model: unknown, request: InsertRequest): InsertPlan {
    const root = asRecord(model) ?? {};
    const hardware = asRecord(root['hardware']) ?? {};
    const buses = Object.keys(asRecord(hardware['buses']) ?? {});
    const components = asRecord(hardware['components']) ?? {};

    const problems: string[] = [];

    const name = request.name ?? uniqueName(baseName(request.manifest), components);
    const bus = request.bus ?? pickBus(request.manifest, buses);

    if (bus === undefined && needsBus(request.manifest)) {
        problems.push(buses.length === 0
            ? 'projekt nie ma zadeklarowanej żadnej magistrali — dodaj ją w sekcji hardware.buses'
            : `żadna z magistral (${buses.join(', ')}) nie odpowiada wymaganiom paczki`);
    }

    const address = request.address ?? (bus ? freeAddress(request.manifest, bus, components) : undefined);
    if (bus && needsAddress(request.manifest) && address === undefined) {
        problems.push(`wszystkie adresy tego układu na ${bus} są zajęte — zmień adres zworką na płytce`);
    }

    const partName = partNameOf(request.manifest);
    const part = bus === undefined
        ? partName
        : address === undefined ? `${partName} @ ${bus}` : `${partName} @ ${bus}:${address}`;

    return { name, bus, address, part, problems };
}

/**
 * Nanosi wstawienie na dokument. Zwraca `false`, gdy plan miał zastrzeżenia
 * albo gdy w pliku brakuje sekcji, do której trzeba dopisać.
 */
export function applyInsert(doc: HydraDocument, model: unknown,
                            manifest: PackManifest, plan: InsertPlan): boolean {
    if (plan.problems.length > 0) return false;

    const root = asRecord(model) ?? {};

    // Paczka do zależności — bez tego generator nie doda jej biblioteki do
    // platformio.ini i kod adaptera nie skompiluje się. Projekt bez ani jednej
    // paczki nie ma tej sekcji, więc pierwszy komponent ją tworzy.
    const ok = asRecord(root['dependencies']) !== undefined
        ? doc.insertKey(['dependencies'], manifest.pack, `^${manifest.version}`)
        : doc.appendSection('dependencies', [[manifest.pack, `^${manifest.version}`]],
                            'Paczki Hydry używane przez projekt');
    if (!ok) return false;

    // Bez sekcji komponentów nie ma dokąd wstawić układu. Tworzenie jej razem
    // z magistralami wymagałoby zgadywania wyprowadzeń, więc odmawiamy —
    // plan i tak zgłosił już brak magistrali.
    const components = asRecord(asRecord(root['hardware'])?.['components']);
    if (components === undefined) return false;

    // Wpis układu. Zapis jednowierszowy: struktura zagnieżdżona wymagałaby
    // wstawiania wielu wierszy z wcięciami, a pojedynczy wiersz da się potem
    // rozwinąć ręcznie albo formularzem.
    return doc.insertMapping(['hardware', 'components'], plan.name, [['part', plan.part]]);
}

/** Domyślne ustawienia paczki — Studio wpisuje je po utworzeniu wpisu. */
export function defaultsFor(manifest: PackManifest, componentName: string):
        { path: PathSegment[]; value: string }[] {
    return Object.entries(manifest.defaults ?? {}).map(([key, value]) => ({
        path: ['hardware', 'components', componentName, key],
        value: String(value),
    }));
}

// --- rozstrzygnięcia -------------------------------------------------------

/** Nazwa układu z nazwy paczki: `bmp280` → `bmp280`, `vl53l0x-tof` → `vl53l0x_tof`. */
function baseName(manifest: PackManifest): string {
    return manifest.pack.replace(/-/g, '_').replace(/[^a-z0-9_]/g, '');
}

function uniqueName(base: string, components: Record<string, unknown>): string {
    if (!(base in components)) return base;
    // Drugi taki sam czujnik to nie pomyłka — bywają dwa dalmierze albo cztery
    // enkodery. Numerujemy zamiast odmawiać.
    for (let i = 2; i < 100; i++) {
        const candidate = `${base}_${i}`;
        if (!(candidate in components)) return candidate;
    }
    return `${base}_x`;
}

function needsBus(manifest: PackManifest): boolean {
    return pickBus(manifest, ['i2c0', 'spi0', 'uart0', 'can0']) !== undefined;
}

function pickBus(manifest: PackManifest, buses: readonly string[]): string | undefined {
    const wanted = (manifest.requires ?? []).filter((capability) =>
        ['i2c', 'spi', 'uart', 'can'].includes(capability));
    if (wanted.length === 0) return undefined;
    return buses.find((bus) => wanted.some((kind) => bus.startsWith(kind)));
}

/**
 * Adresy, pod którymi układ może siedzieć.
 *
 * Bierzemy je z pola `address` w domyślnych ustawieniach paczki; wiele układów
 * ma dwa możliwe adresy wybierane zworką, więc dopuszczamy listę rozdzieloną
 * przecinkami.
 */
function candidateAddresses(manifest: PackManifest): string[] {
    const raw = manifest.defaults?.['address'];
    if (typeof raw !== 'string') return [];
    return raw.split(',').map((part) => part.trim()).filter(Boolean);
}

function needsAddress(manifest: PackManifest): boolean {
    return candidateAddresses(manifest).length > 0;
}

function freeAddress(manifest: PackManifest, bus: string,
                     components: Record<string, unknown>): string | undefined {
    const taken = new Set<string>();
    for (const component of Object.values(components)) {
        const part = asRecord(component)?.['part'];
        if (typeof part !== 'string') continue;
        const match = /@\s*([a-z][a-z0-9]*)\s*:\s*(0x[0-9a-fA-F]+|\d+)/.exec(part);
        if (match && match[1] === bus) taken.add(normalizeAddress(match[2]!));
    }
    return candidateAddresses(manifest).find((address) => !taken.has(normalizeAddress(address)));
}

function normalizeAddress(address: string): string {
    return Number(address).toString(16);
}

/** Oznaczenie układu do pola `part` — z opisu paczki albo z jej nazwy. */
function partNameOf(manifest: PackManifest): string {
    return manifest.pack.toUpperCase().replace(/-/g, '_');
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : undefined;
}
