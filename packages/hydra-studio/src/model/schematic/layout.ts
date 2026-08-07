/**
 * Układ schematu na płótnie.
 *
 * Wydzielone z widoku, bo to logika, a nie rysowanie: rozmieszczenie symboli,
 * przypisanie wyprowadzeń do stron i zamiana sieci na krawędzie dają się
 * sprawdzić testem, a komponent Reacta już nie.
 *
 * Sieci rysujemy przez węzeł pośredni, a nie jako połączenie każdego z każdym.
 * Sieć zasilania z ośmioma odbiornikami dałaby 28 krawędzi zamiast ośmiu,
 * a schemat stałby się nieczytelny dokładnie tam, gdzie najbardziej trzeba
 * go rozumieć.
 */

import type { ComponentDefinition } from './hcomp';
import { parseNode, type Schematic } from './hsch';

export interface LayoutNode {
    id: string;
    kind: 'component' | 'net';
    label: string;
    /** Podpis pod nazwą — oznaczenie układu albo liczba połączeń. */
    sublabel?: string;
    x: number;
    y: number;
    /** Wyprowadzenia po lewej i prawej stronie symbolu. */
    ports?: { id: string; name: string; side: 'left' | 'right' }[];
    /** Klasa sieci — po niej widok dobiera kolor. */
    netClass?: string;
}

export interface LayoutEdge {
    id: string;
    from: string;
    to: string;
    /** Nazwa wyprowadzenia — podpis przy krawędzi. */
    label: string;
}

export interface Layout {
    nodes: LayoutNode[];
    edges: LayoutEdge[];
}

export interface LayoutOptions {
    definitions: Readonly<Record<string, ComponentDefinition>>;
    /** Odstęp siatki; położenia z pliku są w milimetrach. */
    scale?: number;
}

export function layoutSchematic(schematic: Schematic, options: LayoutOptions): Layout {
    const scale = options.scale ?? 4;
    const nodes: LayoutNode[] = [];
    const edges: LayoutEdge[] = [];

    // Układy zachowują położenie z pliku; te bez niego układamy w kolumnie,
    // żeby nie nachodziły na siebie w jednym punkcie.
    let fallbackRow = 0;
    for (const [reference, component] of Object.entries(schematic.components)) {
        const definition = options.definitions[component.part];
        const at = component.at;

        nodes.push({
            id: reference,
            kind: 'component',
            label: definition?.name ?? component.part,
            sublabel: component.value ? `${reference} · ${component.value}` : reference,
            x: at?.[0] !== undefined ? at[0] * scale : 40,
            y: at?.[1] !== undefined ? at[1] * scale : 60 + fallbackRow++ * 140,
            ports: portsOf(definition),
        });
    }

    for (const [netName, net] of Object.entries(schematic.nets)) {
        const netId = `net:${netName}`;
        nodes.push({
            id: netId,
            kind: 'net',
            label: netName,
            sublabel: `${net.nodes.length} ${polishConnections(net.nodes.length)}`,
            x: 0, y: 0,   // położenie wylicza widok — sieć nie ma miejsca w pliku
            ...(net.class !== undefined ? { netClass: net.class } : {}),
        });

        for (const node of net.nodes) {
            const parsed = parseNode(node);
            if (!parsed) continue;
            edges.push({
                id: `${netName}:${node}`,
                from: parsed.component,
                to: netId,
                label: parsed.pin,
            });
        }
    }

    positionNets(nodes, edges);
    return { nodes, edges };
}

/**
 * Wyprowadzenia rozkładamy na dwie strony: zasilanie i masa po lewej,
 * sygnały po prawej. To nie kosmetyka — tak rysuje się schematy od zawsze
 * i dzięki temu da się je czytać bez śledzenia każdej linii.
 */
function portsOf(definition: ComponentDefinition | undefined):
        { id: string; name: string; side: 'left' | 'right' }[] {
    if (!definition) return [];
    return definition.pins.map((pin) => ({
        id: pin.name,
        name: pin.name,
        side: pin.kind === 'power_in' || pin.kind === 'power_out' || pin.kind === 'ground'
            ? 'left' as const
            : 'right' as const,
    }));
}

/**
 * Węzeł sieci ląduje w środku ciężkości układów, które łączy.
 *
 * Prosty sposób, ale daje wynik czytelny bez iteracyjnego rozmieszczania,
 * które przy każdym otwarciu układałoby schemat inaczej — a schemat ma
 * wyglądać tak samo za każdym razem.
 */
function positionNets(nodes: LayoutNode[], edges: readonly LayoutEdge[]): void {
    const byId = new Map(nodes.map((node) => [node.id, node]));

    for (const node of nodes) {
        if (node.kind !== 'net') continue;

        const connected = edges
            .filter((edge) => edge.to === node.id)
            .map((edge) => byId.get(edge.from))
            .filter((component): component is LayoutNode => component !== undefined);

        if (connected.length === 0) continue;
        node.x = Math.round(connected.reduce((sum, c) => sum + c.x, 0) / connected.length) + 120;
        node.y = Math.round(connected.reduce((sum, c) => sum + c.y, 0) / connected.length);
    }
}

function polishConnections(count: number): string {
    if (count === 1) return 'połączenie';
    const rest = count % 10;
    const teens = count % 100;
    return rest >= 2 && rest <= 4 && (teens < 12 || teens > 14) ? 'połączenia' : 'połączeń';
}
