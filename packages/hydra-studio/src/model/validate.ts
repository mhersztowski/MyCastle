/**
 * Sprawdzanie pliku .hydra.
 *
 * Dwa przebiegi. Pierwszy porównuje strukturę ze schematem: typy, zakresy,
 * wzorce, nieznane klucze. Drugi sprawdza zależności między polami — i to on
 * łapie pomyłki, które naprawdę się zdarzają: cel domyślny wskazujący na
 * nieistniejące środowisko, komponent na niezadeklarowanej magistrali, dwa
 * układy pod tym samym adresem, moduł sieciowy na płytce bez radia.
 *
 * Ostrzeżenie a błąd: błędem jest to, co uniemożliwia zbudowanie albo na pewno
 * zadziała inaczej, niż zapisano. Ostrzeżeniem — to, co zadziała, ale wygląda
 * na przeoczenie.
 */

import {
    didYouMean, error, warning, type Diagnostic, type Position,
} from './diagnostics';
import type { HydraDocument, PathSegment } from './document';
import { CAPABILITIES, HYDRA_SCHEMA } from './hydraSchema';
import { profileFor } from './emit/mcu';
import type { SchemaNode } from './schema';

/** Wersje schematu, które to wydanie potrafi wczytać. */
export const SUPPORTED_SCHEMA_VERSIONS = ['0.4'] as const;

/**
 * Sprawdzenie dokumentu względem dowolnego schematu — bez reguł właściwych
 * dla .hydra. Używa tego walidacja manifestów paczek, dzięki czemu oba pliki
 * mają jeden zestaw reguł i jeden format komunikatów.
 */
export function validateAgainst(doc: HydraDocument, schema: SchemaNode): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const syntax of doc.syntaxErrors) {
        diagnostics.push(error('', `plik nie jest poprawnym YAML-em: ${syntax.message}`, undefined, syntax.at));
    }
    if (diagnostics.length > 0) return diagnostics;
    checkNode(doc.toJS(), schema, [], doc, diagnostics);
    return diagnostics;
}

export function validate(doc: HydraDocument): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (const syntax of doc.syntaxErrors) {
        diagnostics.push(error('', `plik nie jest poprawnym YAML-em: ${syntax.message}`, undefined, syntax.at));
    }
    // Przy zepsutej składni dalsze sprawdzanie mówiłoby o polach, których
    // parser i tak nie odczytał — same fałszywe tropy.
    if (diagnostics.length > 0) return diagnostics;

    const root = doc.toJS();
    checkNode(root, HYDRA_SCHEMA, [], doc, diagnostics);
    checkCrossReferences(root, doc, diagnostics);
    return diagnostics;
}

// ---------------------------------------------------------------------------
// Przebieg pierwszy: zgodność ze schematem
// ---------------------------------------------------------------------------

function checkNode(value: unknown, schema: SchemaNode, path: PathSegment[],
                   doc: HydraDocument, out: Diagnostic[]): void {
    const where = pathToString(path);
    const at = doc.positionOf(path);

    switch (schema.kind) {
        case 'any':
            return;

        case 'string':
            if (typeof value !== 'string') return typeMismatch(value, 'tekst', where, at, out);
            if (schema.minLength !== undefined && value.length < schema.minLength) {
                out.push(error(where, `tekst jest za krótki (${value.length} znaków, wymagane ${schema.minLength})`,
                               undefined, at));
            }
            if (schema.pattern && !schema.pattern.test(value)) {
                out.push(error(where, `wartość „${value}" ma niewłaściwą postać`,
                               schema.patternHint ?? `oczekiwany wzorzec: ${schema.pattern.source}`, at));
            }
            return;

        case 'number': {
            if (typeof value !== 'number' || Number.isNaN(value)) {
                return typeMismatch(value, 'liczba', where, at, out);
            }
            const unit = schema.unit ? ` ${schema.unit}` : '';
            if (schema.integer && !Number.isInteger(value)) {
                out.push(error(where, `oczekiwana liczba całkowita, jest ${value}`, undefined, at));
            }
            if (schema.min !== undefined && value < schema.min) {
                out.push(error(where, `wartość ${value}${unit} jest poniżej dolnej granicy ${schema.min}${unit}`,
                               undefined, at));
            }
            if (schema.max !== undefined && value > schema.max) {
                out.push(error(where, `wartość ${value}${unit} przekracza górną granicę ${schema.max}${unit}`,
                               undefined, at));
            }
            return;
        }

        case 'bool':
            if (typeof value !== 'boolean') typeMismatch(value, 'wartość logiczna', where, at, out);
            return;

        case 'enum': {
            if (typeof value !== 'string') return typeMismatch(value, 'tekst', where, at, out);
            if (schema.values.includes(value)) return;
            const suggestion = didYouMean(value, schema.values);
            out.push(error(where, `nieznana wartość „${value}"`,
                           suggestion ? `czy chodziło o „${suggestion}"? dozwolone: ${schema.values.join(', ')}`
                                      : `dozwolone: ${schema.values.join(', ')}`, at));
            return;
        }

        case 'array': {
            if (!Array.isArray(value)) return typeMismatch(value, 'lista', where, at, out);
            if (schema.minItems !== undefined && value.length < schema.minItems) {
                out.push(error(where, `lista ma ${value.length} pozycji, wymagane co najmniej ${schema.minItems}`,
                               undefined, at));
            }
            if (schema.unique) {
                const seen = new Set<string>();
                value.forEach((item, index) => {
                    const key = JSON.stringify(item);
                    if (seen.has(key)) {
                        out.push(warning(pathToString([...path, index]),
                                         `pozycja ${JSON.stringify(item)} powtarza się`,
                                         'powtórzenie nic nie zmienia — usuń jedno z wystąpień',
                                         doc.positionOf([...path, index])));
                    }
                    seen.add(key);
                });
            }
            value.forEach((item, index) => checkNode(item, schema.of, [...path, index], doc, out));
            return;
        }

        case 'object': {
            if (!isPlainObject(value)) return typeMismatch(value, 'zbiór pól', where, at, out);

            for (const [name, field] of Object.entries(schema.fields)) {
                if (!(name in value) || value[name] === undefined || value[name] === null) {
                    if (field.required) {
                        out.push(error(pathToString([...path, name]), `brakuje wymaganego pola „${name}"`,
                                       field.type.doc, at));
                    }
                    continue;
                }
                checkNode(value[name], field.type, [...path, name], doc, out);
            }

            if (schema.additional !== 'allow') {
                const known = Object.keys(schema.fields);
                for (const name of Object.keys(value)) {
                    if (known.includes(name)) continue;
                    const suggestion = didYouMean(name, known);
                    // Nieznany klucz jest po cichu pomijany przy generowaniu,
                    // więc ustawienie nie działa i nic tego nie sygnalizuje.
                    out.push(error(pathToString([...path, name]), `nieznane pole „${name}"`,
                                   suggestion ? `czy chodziło o „${suggestion}"?`
                                              : `dozwolone pola: ${known.join(', ')}`,
                                   doc.positionOf([...path, name])));
                }
            }
            return;
        }

        case 'map': {
            if (!isPlainObject(value)) return typeMismatch(value, 'zbiór pól', where, at, out);
            for (const [key, item] of Object.entries(value)) {
                if (schema.reserved?.includes(key)) continue;
                if (schema.keyPattern && !schema.keyPattern.test(key)) {
                    out.push(error(pathToString([...path, key]), `nazwa „${key}" ma niewłaściwą postać`,
                                   schema.keyHint ?? `oczekiwany wzorzec: ${schema.keyPattern.source}`,
                                   doc.positionOf([...path, key])));
                }
                checkNode(item, schema.of, [...path, key], doc, out);
            }
            return;
        }

        case 'union': {
            // Wariant zgłasza błąd tylko wtedy, gdy nie pasuje żaden — inaczej
            // dostalibyśmy komplet komunikatów o wszystkich odrzuconych.
            for (const option of schema.options) {
                const trial: Diagnostic[] = [];
                checkNode(value, option, path, doc, trial);
                if (trial.length === 0) return;
            }
            out.push(error(where, `wartość nie pasuje do żadnej dozwolonej postaci`, schema.doc, at));
            return;
        }
    }
}

function typeMismatch(value: unknown, expected: string, where: string,
                      at: Position | undefined, out: Diagnostic[]): void {
    out.push(error(where, `oczekiwano: ${expected}, jest: ${describe(value)}`, undefined, at));
}

function describe(value: unknown): string {
    if (value === null) return 'wartość pusta';
    if (Array.isArray(value)) return 'lista';
    switch (typeof value) {
        case 'string': return `tekst „${value}"`;
        case 'number': return `liczba ${value}`;
        case 'boolean': return `wartość logiczna ${value}`;
        case 'object': return 'zbiór pól';
        default: return typeof value;
    }
}

// ---------------------------------------------------------------------------
// Przebieg drugi: zależności między polami
// ---------------------------------------------------------------------------

/** Moduły wymagające określonych możliwości płytki. */
const MODULE_REQUIREMENTS: Record<string, readonly string[]> = {
    net: ['wifi', 'ethernet'],   // wystarczy jedna z nich
};

function checkCrossReferences(root: unknown, doc: HydraDocument, out: Diagnostic[]): void {
    if (!isPlainObject(root)) return;

    checkSchemaVersion(root, doc, out);

    const targets = isPlainObject(root['targets']) ? root['targets'] : undefined;
    if (!targets) return;

    const targetNames = Object.keys(targets).filter((k) => k !== 'default');
    checkDefaultTarget(targets, targetNames, doc, out);

    if (targetNames.length === 0) {
        out.push(error('targets', 'nie zdefiniowano żadnego celu sprzętowego',
                       'dodaj co najmniej jeden cel, np. „esp32s3-main"', doc.positionOf(['targets'])));
    }

    checkModuleCapabilities(root, targets, targetNames, doc, out);
    checkBusReferences(root, doc, out);
    checkI2cAddresses(root, doc, out);
    checkTestTargets(root, targetNames, doc, out);
    checkUiHomeScreen(root, doc, out);
    checkSecretsNotInline(root, doc, out);
}

function checkSchemaVersion(root: Record<string, unknown>, doc: HydraDocument, out: Diagnostic[]): void {
    const version = root['hydra'];
    if (typeof version !== 'string') return;
    if (SUPPORTED_SCHEMA_VERSIONS.includes(version as (typeof SUPPORTED_SCHEMA_VERSIONS)[number])) return;
    out.push(error('hydra', `nieobsługiwana wersja schematu „${version}"`,
                   `to wydanie czyta: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}`, doc.positionOf(['hydra'])));
}

function checkDefaultTarget(targets: Record<string, unknown>, names: readonly string[],
                            doc: HydraDocument, out: Diagnostic[]): void {
    const fallback = targets['default'];
    if (fallback === undefined) {
        if (names.length > 1) {
            out.push(warning('targets.default', 'nie wskazano celu domyślnego',
                             `dopisz „default: ${names[0]}", inaczej wybór zależy od kolejności w pliku`,
                             doc.positionOf(['targets'])));
        }
        return;
    }
    if (typeof fallback !== 'string') {
        out.push(error('targets.default', `oczekiwano nazwy celu, jest ${describe(fallback)}`,
                       undefined, doc.positionOf(['targets', 'default'])));
        return;
    }
    if (!names.includes(fallback)) {
        const suggestion = didYouMean(fallback, names);
        out.push(error('targets.default', `cel domyślny „${fallback}" nie istnieje`,
                       suggestion ? `czy chodziło o „${suggestion}"?` : `zdefiniowane cele: ${names.join(', ')}`,
                       doc.positionOf(['targets', 'default'])));
    }
}

function checkModuleCapabilities(root: Record<string, unknown>, targets: Record<string, unknown>,
                                 names: readonly string[], doc: HydraDocument, out: Diagnostic[]): void {
    const modules = isPlainObject(root['modules']) ? root['modules'] : {};

    for (const name of names) {
        const target = targets[name];
        if (!isPlainObject(target)) continue;

        const declared = Array.isArray(target['capabilities'])
            ? (target['capabilities'] as unknown[]).filter((c): c is string => typeof c === 'string')
            : undefined;

        // Gdy plik nie wymienia możliwości, bierzemy je z profilu układu.
        // Rozróżnienie ma znaczenie dla wagi zgłoszenia: deklaracja opisuje
        // konkretną płytkę i jej brak jest błędem, profil opisuje sam układ —
        // płytka mogła dołożyć układ sieciowy na magistrali, o którym profil
        // nie wie. Stąd ostrzeżenie zamiast błędu.
        const mcu = typeof target['mcu'] === 'string' ? target['mcu'] : undefined;
        const known = declared ?? (mcu ? profileFor(mcu)?.capabilities : undefined);
        if (!known) continue;

        for (const [moduleName, needed] of Object.entries(MODULE_REQUIREMENTS)) {
            if (!moduleEnabledFor(modules, target, moduleName)) continue;
            if (needed.some((capability) => known.includes(capability))) continue;

            const report = declared ? error : warning;
            const source = declared
                ? 'płytka nie deklaruje żadnej z możliwości'
                : `układ ${mcu} nie ma żadnej z możliwości`;
            const hint = declared
                ? `dopisz brakującą możliwość albo wyłącz moduł dla tego celu: ` +
                  `targets.${name}.modules.${moduleName}: off`
                : `jeśli płytka ma taki układ na magistrali, wypisz to wprost w ` +
                  `targets.${name}.capabilities; jeśli nie — wyłącz moduł: ` +
                  `targets.${name}.modules.${moduleName}: off`;

            out.push(report(`targets.${name}.capabilities`,
                            `moduł „${moduleName}" jest włączony, a ${source}: ${needed.join(', ')}`,
                            hint, doc.positionOf(['targets', name])));
        }

        for (const capability of declared ?? []) {
            if (CAPABILITIES.includes(capability as (typeof CAPABILITIES)[number])) continue;
            const suggestion = didYouMean(capability, CAPABILITIES);
            out.push(error(`targets.${name}.capabilities`, `nieznana możliwość „${capability}"`,
                           suggestion ? `czy chodziło o „${suggestion}"?` : `dozwolone: ${CAPABILITIES.join(', ')}`,
                           doc.positionOf(['targets', name, 'capabilities'])));
        }
    }
}

/** Czy moduł jest włączony dla danego celu, po uwzględnieniu nadpisań. */
function moduleEnabledFor(modules: Record<string, unknown>, target: Record<string, unknown>,
                          moduleName: string): boolean {
    const overrides = isPlainObject(target['modules']) ? target['modules'] : undefined;
    const override = overrides?.[moduleName];
    if (override === 'off' || override === false) return false;
    if (override !== undefined) return true;
    return modules[moduleName] !== undefined;
}

function checkBusReferences(root: Record<string, unknown>, doc: HydraDocument, out: Diagnostic[]): void {
    const hardware = isPlainObject(root['hardware']) ? root['hardware'] : undefined;
    if (!hardware) return;

    const buses = isPlainObject(hardware['buses']) ? Object.keys(hardware['buses']) : [];
    const components = isPlainObject(hardware['components']) ? hardware['components'] : undefined;
    if (!components) return;

    for (const [name, component] of Object.entries(components)) {
        if (!isPlainObject(component)) continue;
        const part = component['part'];
        if (typeof part !== 'string') continue;

        // Zapis „BMP280 @ i2c0:0x76" — magistrala po znaku @, adres po dwukropku.
        // Nazwa magistrali miesza litery z cyframi („i2c0"), więc wzorzec musi
        // brać całe słowo; `[a-z]+\d` zatrzymywał się na dwójce i dawał „i2".
        const match = /@\s*([a-z][a-z0-9]*)\s*(?::\s*(0x[0-9a-fA-F]+|\d+))?/.exec(part);
        if (!match) continue;

        const bus = match[1]!;
        if (buses.includes(bus)) continue;
        const suggestion = didYouMean(bus, buses);
        out.push(error(`hardware.components.${name}.part`,
                       `układ jest podpięty do magistrali „${bus}", której nie zadeklarowano`,
                       buses.length === 0
                           ? 'dodaj sekcję hardware.buses z opisem tej magistrali'
                           : (suggestion ? `czy chodziło o „${suggestion}"? zadeklarowane: ${buses.join(', ')}`
                                         : `zadeklarowane magistrale: ${buses.join(', ')}`),
                       doc.positionOf(['hardware', 'components', name, 'part'])));
    }
}

function checkI2cAddresses(root: Record<string, unknown>, doc: HydraDocument, out: Diagnostic[]): void {
    const hardware = isPlainObject(root['hardware']) ? root['hardware'] : undefined;
    const components = hardware && isPlainObject(hardware['components']) ? hardware['components'] : undefined;
    if (!components) return;

    const taken = new Map<string, string>();
    for (const [name, component] of Object.entries(components)) {
        if (!isPlainObject(component)) continue;
        const part = component['part'];
        if (typeof part !== 'string') continue;

        const match = /@\s*([a-z][a-z0-9]*)\s*:\s*(0x[0-9a-fA-F]+|\d+)/.exec(part);
        if (!match) continue;

        const slot = `${match[1]}:${Number(match[2]).toString(16)}`;
        const previous = taken.get(slot);
        if (previous !== undefined) {
            // Dwa układy pod jednym adresem to usterka, której nie widać aż do
            // uruchomienia: magistrala odpowiada, tylko dane są nie tego układu.
            out.push(error(`hardware.components.${name}.part`,
                           `adres ${match[2]} na magistrali ${match[1]} jest już zajęty przez „${previous}"`,
                           'zmień adres zworką na płytce albo przenieś układ na inną magistralę',
                           doc.positionOf(['hardware', 'components', name, 'part'])));
        }
        taken.set(slot, name);
    }
}

function checkTestTargets(root: Record<string, unknown>, names: readonly string[],
                          doc: HydraDocument, out: Diagnostic[]): void {
    const test = isPlainObject(root['test']) ? root['test'] : undefined;
    const onTarget = test && isPlainObject(test['target']) ? test['target'] : undefined;
    const envs = onTarget && Array.isArray(onTarget['envs']) ? onTarget['envs'] : undefined;
    if (!envs) return;

    envs.forEach((env, index) => {
        if (typeof env !== 'string' || names.includes(env)) return;
        const suggestion = didYouMean(env, names);
        out.push(error(`test.target.envs.${index}`, `cel „${env}" nie istnieje`,
                       suggestion ? `czy chodziło o „${suggestion}"?` : `zdefiniowane cele: ${names.join(', ')}`,
                       doc.positionOf(['test', 'target', 'envs', index])));
    });
}

function checkUiHomeScreen(root: Record<string, unknown>, doc: HydraDocument, out: Diagnostic[]): void {
    const modules = isPlainObject(root['modules']) ? root['modules'] : undefined;
    const ui = modules && isPlainObject(modules['ui']) ? modules['ui'] : undefined;
    if (!ui) return;

    const home = ui['home'];
    const screens = Array.isArray(ui['screens'])
        ? (ui['screens'] as unknown[]).filter((s): s is string => typeof s === 'string')
        : [];
    if (typeof home !== 'string' || screens.length === 0 || screens.includes(home)) return;

    const suggestion = didYouMean(home, screens);
    out.push(error('modules.ui.home', `ekran startowy „${home}" nie jest wymieniony w „screens"`,
                   suggestion ? `czy chodziło o „${suggestion}"?` : `zadeklarowane ekrany: ${screens.join(', ')}`,
                   doc.positionOf(['modules', 'ui', 'home'])));
}

/** Wzorce wskazujące, że ktoś wpisał hasło wprost do pliku. */
const SECRET_KEYS = ['password', 'passwd', 'pass', 'psk', 'secret', 'token', 'api_key', 'apikey'];

function checkSecretsNotInline(root: Record<string, unknown>, doc: HydraDocument, out: Diagnostic[]): void {
    walk(root, [], (value, path) => {
        const key = String(path[path.length - 1] ?? '').toLowerCase();
        if (typeof value !== 'string' || value.length === 0) return;
        if (!SECRET_KEYS.includes(key)) return;
        // Odwołanie do sekcji sekretów jest w porządku — chodzi o wartość wprost.
        if (value === 'secrets' || value.startsWith('${') || value.startsWith('$')) return;

        out.push(error(pathToString(path), `wartość pola „${key}" wygląda na wpisany wprost sekret`,
                       'plik projektu trafia do repozytorium — przenieś wartość do pliku wskazanego ' +
                       'w sekcji „secrets" i zostaw tu nazwę zmiennej',
                       doc.positionOf(path)));
    });
}

function walk(value: unknown, path: PathSegment[], visit: (value: unknown, path: PathSegment[]) => void): void {
    visit(value, path);
    if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, [...path, index], visit));
    } else if (isPlainObject(value)) {
        for (const [key, item] of Object.entries(value)) walk(item, [...path, key], visit);
    }
}

// ---------------------------------------------------------------------------

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pathToString(path: readonly PathSegment[]): string {
    return path.join('.');
}
