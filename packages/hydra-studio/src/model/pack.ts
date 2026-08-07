/**
 * Format paczki Hydry (hydra-pack.yaml).
 *
 * Paczka nie jest menedżerem pakietów i nie zamierza nim być. Pobieraniem,
 * wersjami i pamięcią podręczną zajmuje się PlatformIO albo git — tutaj jest
 * wyłącznie cienki manifest, który spina cztery rzeczy, których dziś nie spina
 * żaden istniejący format:
 *
 *   1. adapter — kod łączący bibliotekę producenta z interfejsem Hydry,
 *   2. komponent — symbol i wyprowadzenia dla edytora schematów,
 *   3. schemat konfiguracji — z niego Studio buduje formularz w inspektorze,
 *   4. model symulacji — skąd czujnik bierze dane, gdy nie ma sprzętu.
 *
 * `library.json` Arduino zna tylko pierwszą pozycję, komponent ESP-IDF też.
 * Reszta jest luką i to ona jest jedynym powodem, dla którego ten format
 * w ogóle istnieje.
 *
 * Zależność od prawdziwej biblioteki wyraża `upstream.lib_deps` i trafia
 * wprost do platformio.ini — nie ma tu żadnego rozwiązywania wersji.
 */

import { didYouMean, error, warning, type Diagnostic } from './diagnostics';
import { HydraDocument } from './document';
import { validateAgainst } from './validate';
import { CAPABILITIES } from './hydraSchema';
import {
    anyOf, bool, list, map, obj, oneOf, optional, required, str,
    type ObjectNode,
} from './schema';

/** Czym paczka może być dla frameworka. */
export const PACK_PROVIDES = [
    'sense.driver', 'ui.widget', 'ui.display', 'motion.motor', 'motion.encoder',
    'net.transport', 'core.extension', 'board',
] as const;

export const PACK_SCHEMA: ObjectNode = obj('Manifest paczki Hydry', {
    pack: required(str('Nazwa paczki', {
        pattern: /^[a-z0-9][a-z0-9-]*$/, patternHint: 'małe litery, cyfry i myślniki',
    })),
    version: required(str('Wersja paczki', {
        pattern: /^\d+\.\d+\.\d+(?:[-+].+)?$/, patternHint: 'wersja semantyczna, np. 1.2.0',
    })),
    description: optional(str('Krótki opis — pokazywany w bibliotece komponentów')),
    provides: required(list('Czym paczka jest dla frameworka', oneOf('Rodzaj', PACK_PROVIDES),
                            { minItems: 1, unique: true })),

    /**
     * Czego paczka potrzebuje od płytki. Oś podziału to możliwości, nie rodzina
     * układu: czujnik I²C działa wszędzie, gdzie jest I²C, a nie „na ESP32".
     */
    requires: optional(list('Wymagane możliwości płytki', oneOf('Możliwość', CAPABILITIES), { unique: true })),

    upstream: optional(obj('Prawdziwa zależność — przekazywana w dół do PlatformIO', {
        lib_deps: optional(anyOf('Wpis albo lista wpisów lib_deps', [
            str('Pojedynczy wpis, np. "adafruit/Adafruit BMP280 Library@^2.6"'),
            list('Kilka wpisów', str('Wpis lib_deps')),
        ])),
        build_flags: optional(list('Dodatkowe flagi kompilacji', str('Flaga'))),
    })),

    adapter: optional(str('Plik adaptera nad interfejsem Hydry')),
    component: optional(str('Symbol i wyprowadzenia dla edytora schematów', {
        pattern: /\.hcomp$/, patternHint: 'plik komponentu ma rozszerzenie .hcomp',
    })),
    config_schema: optional(str('Schemat konfiguracji — z niego powstaje formularz w inspektorze', {
        pattern: /\.schema\.json$/, patternHint: 'nazwa kończy się na .schema.json',
    })),
    sim: optional(str('Model symulacji')),

    /** Domyślne ustawienia wstawiane do .hydra przy dodaniu komponentu. */
    defaults: optional(map('Wartości domyślne konfiguracji', anyOf('Wartość', [
        str('Tekst'), bool('Wartość logiczna'),
    ]))),
}, 'forbid');

export interface PackManifest {
    pack: string;
    version: string;
    description?: string;
    provides: string[];
    requires?: string[];
    upstream?: { lib_deps?: string | string[]; build_flags?: string[] };
    adapter?: string;
    component?: string;
    config_schema?: string;
    sim?: string;
    defaults?: Record<string, unknown>;
}

export interface LoadedPack {
    manifest: PackManifest;
    /** Katalog manifestu — względem niego rozwiązywane są ścieżki plików. */
    root: string;
    diagnostics: Diagnostic[];
}

/** Wczytuje manifest z tekstu; `root` służy tylko do rozwiązywania ścieżek. */
export function loadPack(source: string, root = '.'): LoadedPack {
    const doc = HydraDocument.parse(source);
    const diagnostics: Diagnostic[] = [];

    for (const syntax of doc.syntaxErrors) {
        diagnostics.push(error('', `manifest nie jest poprawnym YAML-em: ${syntax.message}`, undefined, syntax.at));
    }
    if (diagnostics.length > 0) {
        return { manifest: emptyManifest(), root, diagnostics };
    }

    const value = doc.toJS();
    // Ten sam kod sprawdzający co dla .hydra — jeden zestaw reguł i jeden
    // format komunikatów dla obu plików.
    diagnostics.push(...validateAgainst(doc, PACK_SCHEMA));

    const manifest = (isRecord(value) ? value : {}) as unknown as PackManifest;
    checkPackConsistency(manifest, doc, diagnostics);
    return { manifest, root, diagnostics };
}

function checkPackConsistency(manifest: PackManifest, doc: HydraDocument, out: Diagnostic[]): void {
    // Paczka, która nic nie wnosi, jest niemal na pewno pomyłką — najczęściej
    // literówką w nazwie pola albo niedokończoną edycją.
    const carries = manifest.adapter ?? manifest.component ?? manifest.config_schema ?? manifest.sim;
    if (carries === undefined) {
        out.push(warning('', 'manifest nie wskazuje żadnego pliku',
                         'paczka bez adaptera, komponentu, schematu konfiguracji i modelu symulacji ' +
                         'nie zmienia niczego — sprawdź, czy nazwy pól są poprawne',
                         doc.positionOf(['pack'])));
    }

    // Sterownik bez schematu konfiguracji da się użyć, ale inspektor nie będzie
    // miał czego pokazać — użytkownik zobaczy pusty panel. Dotyczy wszystkiego,
    // co ma ustawienia: czujnik ma adres i okres, sterownik silnika
    // częstotliwość PWM, wyświetlacz rozdzielczość. Elementy bierne i złącza
    // (`core.extension`) słusznie ich nie mają.
    const CONFIGURABLE = ['sense.driver', 'ui.display', 'ui.widget',
                          'motion.motor', 'motion.encoder', 'net.transport'];
    const configurable = manifest.provides?.filter((kind) => CONFIGURABLE.includes(kind)) ?? [];

    if (configurable.length > 0 && manifest.config_schema === undefined) {
        out.push(warning('config_schema',
                         `paczka dostarcza ${configurable.join(', ')}, ale nie ma schematu konfiguracji`,
                         'bez tego pliku inspektor w Studiu pokaże pusty panel dla tego komponentu',
                         doc.positionOf(['provides'])));
    }
}

/**
 * Czy paczka pasuje do celu o podanych możliwościach.
 *
 * Zwraca listę brakujących możliwości — pusta oznacza zgodność. Studio używa
 * tego, żeby wyszarzyć komponent w bibliotece **i podać powód**; sam brak
 * pozycji na liście zostawiałby użytkownika z pytaniem, czemu jej nie widzi.
 */
export function missingCapabilities(manifest: PackManifest,
                                    targetCapabilities: readonly string[] | undefined): string[] {
    const needed = manifest.requires ?? [];
    if (needed.length === 0) return [];
    // Cel bez zadeklarowanych możliwości oznacza „nie wiadomo", nie „nie ma".
    if (targetCapabilities === undefined) return [];
    return needed.filter((capability) => !targetCapabilities.includes(capability));
}

/** Zależności do przekazania PlatformIO — z całego zestawu paczek, bez powtórzeń. */
export function collectLibDeps(packs: readonly PackManifest[]): string[] {
    const seen = new Set<string>();
    for (const pack of packs) {
        const deps = pack.upstream?.lib_deps;
        if (deps === undefined) continue;
        for (const dep of Array.isArray(deps) ? deps : [deps]) seen.add(dep);
    }
    return [...seen];
}

export function collectBuildFlags(packs: readonly PackManifest[]): string[] {
    const seen = new Set<string>();
    for (const pack of packs) {
        for (const flag of pack.upstream?.build_flags ?? []) seen.add(flag);
    }
    return [...seen];
}

/** Podpowiedź przy nieznanej nazwie paczki w sekcji `dependencies`. */
export function suggestPack(name: string, available: readonly string[]): string | undefined {
    return didYouMean(name, available);
}

function emptyManifest(): PackManifest {
    return { pack: '', version: '', provides: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

