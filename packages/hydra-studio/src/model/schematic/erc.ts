/**
 * Kontrola reguł elektrycznych.
 *
 * Sprawdza to, co da się sprawdzić z połączeń i definicji układów — czyli
 * klasę błędów, które inaczej wychodzą dopiero na gotowej płytce, gdy poprawka
 * kosztuje przelutowanie albo nową serię. Nie zastępuje symulacji ani przeglądu
 * przez człowieka; wyłapuje pomyłki, nie projektuje układu.
 *
 * Podział na błąd i ostrzeżenie: błędem jest to, co na pewno nie zadziała albo
 * uszkodzi układ (zwarcie dwóch wyjść, nieistniejące wyprowadzenie).
 * Ostrzeżeniem — to, co bywa poprawne, ale najczęściej jest przeoczeniem
 * (sieć z jednym węzłem, magistrala I²C bez podciągnięcia).
 */

import { error, warning, type Diagnostic } from '../diagnostics';
import { conflictsWhenShorted, drivesNet, isOptional, type ComponentDefinition } from './hcomp';
import { parseNode, type Schematic } from './hsch';

export interface ErcOptions {
    /** Definicje układów po nazwie paczki. */
    definitions: Readonly<Record<string, ComponentDefinition>>;
    /**
     * Magistrale, dla których projekt deklaruje zewnętrzne podciągnięcie —
     * z `hardware.buses[].pullups` w pliku projektu.
     */
    externalPullups?: readonly string[];
}

export function checkSchematic(schematic: Schematic, options: ErcOptions): Diagnostic[] {
    const out: Diagnostic[] = [];

    checkComponentsHaveDefinitions(schematic, options, out);
    checkNodesExist(schematic, options, out);
    checkPinsConnectedOnce(schematic, out);
    checkRequiredPinsConnected(schematic, options, out);
    checkNetDrivers(schematic, options, out);
    checkDanglingNets(schematic, out);
    checkI2cPullups(schematic, options, out);
    checkBusCompleteness(schematic, options, out);

    return out;
}

function checkComponentsHaveDefinitions(schematic: Schematic, options: ErcOptions,
                                        out: Diagnostic[]): void {
    for (const [reference, component] of Object.entries(schematic.components)) {
        if (options.definitions[component.part]) continue;
        out.push(error(`components.${reference}`,
                       `brak definicji układu „${component.part}"`,
                       'dodaj paczkę z plikiem .hcomp albo popraw nazwę w polu „part"'));
    }
}

function checkNodesExist(schematic: Schematic, options: ErcOptions, out: Diagnostic[]): void {
    for (const [netName, net] of Object.entries(schematic.nets)) {
        for (const node of net.nodes) {
            const parsed = parseNode(node);
            if (!parsed) continue;

            const component = schematic.components[parsed.component];
            if (!component) {
                out.push(error(`nets.${netName}`,
                               `sieć odwołuje się do układu „${parsed.component}", którego nie ma na schemacie`,
                               `dostępne: ${Object.keys(schematic.components).join(', ') || 'brak'}`));
                continue;
            }

            const definition = options.definitions[component.part];
            if (!definition) continue;   // zgłoszone osobno

            if (!definition.pins.some((pin) => pin.name === parsed.pin)) {
                out.push(error(`nets.${netName}`,
                               `układ ${parsed.component} (${component.part}) nie ma wyprowadzenia „${parsed.pin}"`,
                               `wyprowadzenia: ${definition.pins.map((p) => p.name).join(', ')}`));
            }
        }
    }
}

function checkPinsConnectedOnce(schematic: Schematic, out: Diagnostic[]): void {
    const seen = new Map<string, string>();
    for (const [netName, net] of Object.entries(schematic.nets)) {
        for (const node of net.nodes) {
            const previous = seen.get(node);
            if (previous !== undefined && previous !== netName) {
                // Jedno wyprowadzenie w dwóch sieciach to zwarcie tych sieci —
                // najczęściej skutek skopiowania wiersza i zapomnienia poprawki.
                out.push(error(`nets.${netName}`,
                               `wyprowadzenie ${node} należy już do sieci „${previous}"`,
                               'jedno wyprowadzenie może należeć tylko do jednej sieci'));
            }
            seen.set(node, netName);
        }
    }
}

function checkRequiredPinsConnected(schematic: Schematic, options: ErcOptions,
                                    out: Diagnostic[]): void {
    const connected = new Set<string>();
    for (const net of Object.values(schematic.nets)) {
        for (const node of net.nodes) connected.add(node);
    }

    for (const [reference, component] of Object.entries(schematic.components)) {
        const definition = options.definitions[component.part];
        if (!definition) continue;

        const missing = definition.pins
            .filter((pin) => !isOptional(pin) && !connected.has(`${reference}.${pin.name}`))
            .map((pin) => pin.name);

        if (missing.length > 0) {
            out.push(error(`components.${reference}`,
                           `niepodłączone wyprowadzenia: ${missing.join(', ')}`,
                           'podłącz je albo oznacz w definicji układu jako opcjonalne'));
        }
    }
}

function checkNetDrivers(schematic: Schematic, options: ErcOptions, out: Diagnostic[]): void {
    for (const [netName, net] of Object.entries(schematic.nets)) {
        const drivers: string[] = [];
        let driven = false;
        let hasInput = false;

        for (const node of net.nodes) {
            const parsed = parseNode(node);
            const component = parsed ? schematic.components[parsed.component] : undefined;
            const definition = component ? options.definitions[component.part] : undefined;
            const pin = definition?.pins.find((p) => p.name === parsed!.pin);
            if (!pin) continue;

            if (conflictsWhenShorted(pin)) drivers.push(node);
            if (drivesNet(pin)) driven = true;
            if (pin.kind === 'input' || pin.kind === 'power_in') hasInput = true;
        }

        if (drivers.length > 1) {
            // Dwa wyjścia zwarte ze sobą — przy przeciwnych stanach płynie prąd
            // ograniczony wyłącznie rezystancją tranzystorów wyjściowych.
            out.push(error(`nets.${netName}`,
                           `dwa wyjścia na jednej sieci: ${drivers.join(', ')}`,
                           'wyjścia typu push-pull nie mogą być zwarte; użyj otwartego drenu ' +
                           'albo rozdziel sieci'));
        }

        if (!driven && hasInput && net.class !== 'power' && net.class !== 'ground') {
            out.push(warning(`nets.${netName}`,
                             'sieć ma wejścia, ale nic jej nie steruje',
                             'wejście bez źródła sygnału pozostanie w stanie nieustalonym'));
        }
    }
}

function checkDanglingNets(schematic: Schematic, out: Diagnostic[]): void {
    for (const [netName, net] of Object.entries(schematic.nets)) {
        if (net.nodes.length >= 2) continue;

        // Sieć z `pin_name` nie łączy dwóch układów — nadaje nazwę wyprowadzeniu,
        // żeby kod mówił `Pin::MotorLeftPwm` zamiast „GPIO 17". Jeden węzeł jest
        // tu stanem docelowym, nie niedokończoną pracą.
        if (net.pin_name !== undefined && net.nodes.length === 1) continue;

        out.push(warning(`nets.${netName}`,
                         net.nodes.length === 0
                             ? 'sieć nie ma żadnego węzła'
                             : 'sieć ma tylko jeden węzeł',
                         'sieć z jednym węzłem niczego nie łączy — dokończ połączenie, ' +
                         'usuń ją albo nadaj jej nazwę przez „pin_name", jeśli ma tylko ' +
                         'nazwać wyprowadzenie'));
    }
}

function checkI2cPullups(schematic: Schematic, options: ErcOptions, out: Diagnostic[]): void {
    const declared = new Set(options.externalPullups ?? []);

    for (const [netName, net] of Object.entries(schematic.nets)) {
        if (net.bus === undefined || !net.bus.startsWith('i2c')) continue;
        if (declared.has(net.bus)) continue;

        // Otwarty dren nie potrafi wystawić stanu wysokiego — bez rezystora
        // podciągającego magistrala nigdy nie ruszy. To najczęstszy błąd
        // na płytkach z I²C i nie widać go inaczej niż oscyloskopem.
        const hasPullup = net.nodes.some((node) => {
            const parsed = parseNode(node);
            const component = parsed ? schematic.components[parsed.component] : undefined;
            return component !== undefined && /^R/.test(parsed!.component);
        });

        if (!hasPullup) {
            out.push(warning(`nets.${netName}`,
                             `magistrala ${net.bus} bez rezystora podciągającego`,
                             'dodaj podciągnięcie do zasilania albo zadeklaruj je w projekcie: ' +
                             `hardware.buses.${net.bus}.pullups: internal`));
        }
    }
}

/**
 * Kompletność magistral: I²C potrzebuje SDA i SCL, SPI — zegara i przynajmniej
 * jednej linii danych. Brakująca linia bywa skutkiem usunięcia sieci bez
 * poprawienia reszty.
 */
const REQUIRED_ROLES: Readonly<Record<string, readonly string[]>> = {
    i2c: ['sda', 'scl'],
    spi: ['sck'],
    uart: ['tx', 'rx'],
    can: ['ch', 'cl'],
};

function checkBusCompleteness(schematic: Schematic, options: ErcOptions, out: Diagnostic[]): void {
    const byBus = new Map<string, Set<string>>();

    for (const net of Object.values(schematic.nets)) {
        if (!net.bus) continue;
        const roles = byBus.get(net.bus) ?? new Set<string>();

        if (net.role) roles.add(net.role);
        else {
            // Rola może wynikać z wyprowadzeń podłączonych do sieci.
            for (const node of net.nodes) {
                const parsed = parseNode(node);
                const component = parsed ? schematic.components[parsed.component] : undefined;
                const definition = component ? options.definitions[component.part] : undefined;
                const pin = definition?.pins.find((p) => p.name === parsed!.pin);
                if (pin?.role) roles.add(pin.role);
            }
        }
        byBus.set(net.bus, roles);
    }

    for (const [bus, roles] of byBus) {
        const kind = bus.replace(/\d+$/, '');
        const required = REQUIRED_ROLES[kind];
        if (!required) continue;

        const missing = required.filter((role) => !roles.has(role));
        if (missing.length > 0) {
            out.push(error(`nets`, `magistrala ${bus} nie ma linii: ${missing.join(', ')}`,
                           `magistrala ${kind} wymaga: ${required.join(', ')}`));
        }
    }
}
