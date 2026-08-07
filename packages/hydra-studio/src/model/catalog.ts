/**
 * Biblioteka komponentów — to, co widać w bocznym panelu Studia.
 *
 * Katalog powstaje z manifestów paczek i jest zestawiany z wybranym celem.
 * Komponent, który do celu nie pasuje, zostaje na liście, ale jest wyszarzony
 * **i podaje powód**. Ukrycie go byłoby gorsze: użytkownik szukałby czujnika,
 * którego nie widzi, i nie miałby jak się dowiedzieć, że brakuje magistrali
 * albo radia.
 */

import { missingCapabilities, type PackManifest } from './pack';
import type { TargetPlan } from './emit/plan';

/** Grupy w bibliotece — kolejność jest kolejnością wyświetlania. */
export const CATEGORIES = [
    { id: 'board', title: 'Mikrokontrolery', provides: ['board'] },
    { id: 'sense', title: 'Czujniki', provides: ['sense.driver'] },
    { id: 'display', title: 'Wyświetlacze', provides: ['ui.display'] },
    { id: 'motion', title: 'Napęd', provides: ['motion.motor', 'motion.encoder'] },
    { id: 'net', title: 'Łączność', provides: ['net.transport'] },
    { id: 'other', title: 'Pozostałe', provides: [] },
] as const;

export interface CatalogEntry {
    manifest: PackManifest;
    /** Czy da się użyć na wybranym celu. */
    compatible: boolean;
    /** Czego brakuje — puste, gdy pasuje. */
    missing: string[];
    /** Gotowe zdanie do dymka; `undefined`, gdy pasuje. */
    reason?: string;
    /** Czy paczka jest już wymieniona w pliku projektu. */
    used: boolean;
    /** Magistrala wywnioskowana z wymagań — do znacznika na kafelku. */
    bus?: string;
}

export interface CatalogGroup {
    id: string;
    title: string;
    entries: CatalogEntry[];
}

export interface CatalogOptions {
    /** Cel, względem którego oceniamy zgodność; brak = bez oceny. */
    target?: TargetPlan | undefined;
    /** Nazwy paczek już użytych w projekcie. */
    used?: readonly string[];
}

export function buildCatalog(packs: readonly PackManifest[], options: CatalogOptions = {}): CatalogGroup[] {
    const used = new Set(options.used ?? []);
    const entries = packs.map((manifest) => entryFor(manifest, options.target, used));

    return CATEGORIES.map((category) => ({
        id: category.id,
        title: category.title,
        entries: entries.filter((entry) => categoryOf(entry.manifest) === category.id)
                        .sort((a, b) => a.manifest.pack.localeCompare(b.manifest.pack)),
    })).filter((group) => group.entries.length > 0);
}

function entryFor(manifest: PackManifest, target: TargetPlan | undefined,
                  used: Set<string>): CatalogEntry {
    const missing = target ? missingCapabilities(manifest, target.capabilities) : [];
    const compatible = missing.length === 0;
    const bus = busOf(manifest);

    return {
        manifest,
        compatible,
        missing,
        ...(compatible ? {} : { reason: reasonFor(missing, target) }),
        used: used.has(manifest.pack),
        ...(bus !== undefined ? { bus } : {}),
    };
}

function reasonFor(missing: readonly string[], target: TargetPlan | undefined): string {
    const what = missing.join(', ');
    if (!target) return `wymaga: ${what}`;
    // Rozróżnienie ma znaczenie: przy możliwościach wziętych z profilu układu
    // płytka mogła mieć układ, o którym profil nie wie — użytkownik może to
    // dopisać zamiast szukać innego komponentu.
    return target.capabilitiesDeclared
        ? `płytka „${target.name}" nie ma: ${what}`
        : `układ ${target.mcu} nie ma: ${what} — jeśli płytka to ma, wypisz w capabilities`;
}

/** Magistrala, na której komponent siedzi — do znacznika na kafelku. */
function busOf(manifest: PackManifest): string | undefined {
    const buses = ['i2c', 'spi', 'uart', 'can'];
    return manifest.requires?.find((capability) => buses.includes(capability));
}

function categoryOf(manifest: PackManifest): string {
    for (const category of CATEGORIES) {
        if (category.provides.some((kind) => manifest.provides.includes(kind))) return category.id;
    }
    return 'other';
}

/**
 * Wyszukiwanie po nazwie i opisie.
 *
 * Bez rozróżniania wielkości liter i bez znaków diakrytycznych — „cisnienie"
 * ma znaleźć „ciśnienie", bo nikt nie przełącza układu klawiatury, szukając
 * czujnika.
 */
export function filterCatalog(groups: readonly CatalogGroup[], query: string): CatalogGroup[] {
    const needle = normalize(query);
    if (needle === '') return [...groups];

    return groups
        .map((group) => ({
            ...group,
            entries: group.entries.filter((entry) =>
                normalize(entry.manifest.pack).includes(needle)
                || normalize(entry.manifest.description ?? '').includes(needle)),
        }))
        .filter((group) => group.entries.length > 0);
}

function normalize(text: string): string {
    return text.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
        .replace(/ł/g, 'l');
}

/**
 * Odnajduje paczkę opisującą dany układ w projekcie.
 *
 * Wiązanie idzie po oznaczeniu w polu `part` — `"BMP280 @ i2c0:0x76"` odsyła
 * do paczki `bmp280`. To umowa, nie odgadywanie: generator zapisuje `part`
 * z nazwy paczki, więc droga powrotna jest jednoznaczna. Ręcznie wpisany układ
 * bez odpowiadającej paczki po prostu nie ma schematu konfiguracji i inspektor
 * pokaże surowe pola.
 */
export function packForComponent(component: unknown,
                                 packs: readonly PackManifest[]): PackManifest | undefined {
    const part = typeof component === 'object' && component !== null
        ? (component as Record<string, unknown>)['part']
        : undefined;
    if (typeof part !== 'string') return undefined;

    const chip = part.split('@')[0]!.trim().toLowerCase().replace(/_/g, '-');
    return packs.find((manifest) => manifest.pack.toLowerCase() === chip);
}
