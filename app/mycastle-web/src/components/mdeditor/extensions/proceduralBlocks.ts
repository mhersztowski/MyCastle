/**
 * Extra Blockly categories for the Automate Script editor: List / Map / Tuple,
 * in a *procedural* form — every operation is a function-style block that takes
 * the collection as its first input and generates plain JS (e.g. push to / get
 * / set / map set / map get …). Complements Blockly's default "Lists" category.
 */
import * as Blockly from 'blockly';
import { javascriptGenerator, Order } from 'blockly/javascript';

type ArgSpec = { name: string; check?: string | string[] };

interface ProcBlock {
  type: string;
  /** Leading label shown before the inputs. */
  label: string;
  /** Value inputs (in order). */
  args: ArgSpec[];
  /** true → statement block (stack); false → value block (output). */
  statement?: boolean;
  tooltip?: string;
  /** Code generator: receives the arg expressions. Value blocks return the
   *  expression; statement blocks return a full statement string. */
  gen: (a: string[]) => string;
  /** Operator precedence of the produced expression (value blocks only). */
  order?: number;
}

interface ProcCategory { name: string; hue: number; blocks: ProcBlock[] }

const LIST_HUE = 210;
const MAP_HUE = 285;
const TUPLE_HUE = 160;

const CATEGORIES: ProcCategory[] = [
  {
    name: 'List',
    hue: LIST_HUE,
    blocks: [
      { type: 'proc_list_new', label: 'new list', args: [], gen: () => '[]', order: Order.ATOMIC, tooltip: 'Pusta lista []' },
      { type: 'proc_list_of', label: 'list of', args: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], gen: (a) => `[${a.filter((x) => x !== 'null').join(', ')}]`, order: Order.ATOMIC, tooltip: 'Lista z elementów' },
      { type: 'proc_list_push', label: 'push to', args: [{ name: 'list' }, { name: 'value' }], statement: true, gen: ([l, v]) => `${l}.push(${v});\n`, tooltip: 'Dodaj element na koniec' },
      { type: 'proc_list_pop', label: 'pop from', args: [{ name: 'list' }], gen: ([l]) => `${l}.pop()`, order: Order.FUNCTION_CALL, tooltip: 'Usuń i zwróć ostatni element' },
      { type: 'proc_list_get', label: 'get', args: [{ name: 'list' }, { name: 'at index' }], gen: ([l, i]) => `${l}[${i}]`, order: Order.MEMBER, tooltip: 'Element pod indeksem' },
      { type: 'proc_list_set', label: 'set', args: [{ name: 'list' }, { name: 'at index' }, { name: 'to' }], statement: true, gen: ([l, i, v]) => `${l}[${i}] = ${v};\n`, tooltip: 'Ustaw element pod indeksem' },
      { type: 'proc_list_length', label: 'length of', args: [{ name: 'list' }], gen: ([l]) => `${l}.length`, order: Order.MEMBER, tooltip: 'Liczba elementów' },
      { type: 'proc_list_contains', label: 'contains', args: [{ name: 'list' }, { name: 'value' }], gen: ([l, v]) => `${l}.includes(${v})`, order: Order.FUNCTION_CALL, tooltip: 'Czy lista zawiera wartość' },
      { type: 'proc_list_indexof', label: 'index of', args: [{ name: 'list' }, { name: 'value' }], gen: ([l, v]) => `${l}.indexOf(${v})`, order: Order.FUNCTION_CALL, tooltip: 'Indeks wartości (lub -1)' },
      { type: 'proc_list_removeat', label: 'remove at', args: [{ name: 'list' }, { name: 'index' }], statement: true, gen: ([l, i]) => `${l}.splice(${i}, 1);\n`, tooltip: 'Usuń element pod indeksem' },
      { type: 'proc_list_join', label: 'join', args: [{ name: 'list' }, { name: 'with' }], gen: ([l, s]) => `${l}.join(${s})`, order: Order.FUNCTION_CALL, tooltip: 'Połącz w string' },
    ],
  },
  {
    name: 'Map',
    hue: MAP_HUE,
    blocks: [
      { type: 'proc_map_new', label: 'new map', args: [], gen: () => 'new Map()', order: Order.ATOMIC, tooltip: 'Pusta mapa' },
      { type: 'proc_map_set', label: 'map set', args: [{ name: 'map' }, { name: 'key' }, { name: 'value' }], statement: true, gen: ([m, k, v]) => `${m}.set(${k}, ${v});\n`, tooltip: 'Ustaw wartość pod kluczem' },
      { type: 'proc_map_get', label: 'map get', args: [{ name: 'map' }, { name: 'key' }], gen: ([m, k]) => `${m}.get(${k})`, order: Order.FUNCTION_CALL, tooltip: 'Wartość pod kluczem' },
      { type: 'proc_map_has', label: 'map has', args: [{ name: 'map' }, { name: 'key' }], gen: ([m, k]) => `${m}.has(${k})`, order: Order.FUNCTION_CALL, tooltip: 'Czy mapa ma klucz' },
      { type: 'proc_map_delete', label: 'map delete', args: [{ name: 'map' }, { name: 'key' }], statement: true, gen: ([m, k]) => `${m}.delete(${k});\n`, tooltip: 'Usuń klucz' },
      { type: 'proc_map_size', label: 'map size', args: [{ name: 'map' }], gen: ([m]) => `${m}.size`, order: Order.MEMBER, tooltip: 'Liczba wpisów' },
      { type: 'proc_map_keys', label: 'map keys', args: [{ name: 'map' }], gen: ([m]) => `Array.from(${m}.keys())`, order: Order.FUNCTION_CALL, tooltip: 'Lista kluczy' },
      { type: 'proc_map_values', label: 'map values', args: [{ name: 'map' }], gen: ([m]) => `Array.from(${m}.values())`, order: Order.FUNCTION_CALL, tooltip: 'Lista wartości' },
    ],
  },
  {
    name: 'Tuple',
    hue: TUPLE_HUE,
    blocks: [
      { type: 'proc_tuple2', label: 'tuple', args: [{ name: 'a' }, { name: 'b' }], gen: ([a, b]) => `[${a}, ${b}]`, order: Order.ATOMIC, tooltip: 'Krotka 2-elementowa' },
      { type: 'proc_tuple3', label: 'tuple', args: [{ name: 'a' }, { name: 'b' }, { name: 'c' }], gen: ([a, b, c]) => `[${a}, ${b}, ${c}]`, order: Order.ATOMIC, tooltip: 'Krotka 3-elementowa' },
      { type: 'proc_tuple_get', label: 'tuple get', args: [{ name: 'tuple' }, { name: 'index' }], gen: ([t, i]) => `${t}[${i}]`, order: Order.MEMBER, tooltip: 'Element krotki pod indeksem' },
      { type: 'proc_tuple_first', label: 'tuple #0', args: [{ name: 'tuple' }], gen: ([t]) => `${t}[0]`, order: Order.MEMBER, tooltip: 'Pierwszy element' },
      { type: 'proc_tuple_second', label: 'tuple #1', args: [{ name: 'tuple' }], gen: ([t]) => `${t}[1]`, order: Order.MEMBER, tooltip: 'Drugi element' },
    ],
  },
];

export interface ProcToolboxCategory {
  kind: 'category';
  name: string;
  colour: string;
  contents: Array<{ kind: 'block'; type: string }>;
}

/** Registers the procedural List/Map/Tuple blocks (idempotent) and returns the
 *  matching toolbox categories. */
export function defineProceduralBlocks(): ProcToolboxCategory[] {
  return CATEGORIES.map((cat) => {
    for (const b of cat.blocks) {
      Blockly.Blocks[b.type] = {
        init(this: Blockly.Block) {
          this.appendDummyInput().appendField(b.label);
          b.args.forEach((arg, i) => {
            const input = this.appendValueInput('ARG' + i).appendField(arg.name);
            if (arg.check) input.setCheck(arg.check);
          });
          this.setInputsInline(b.args.length <= 3);
          if (b.statement) {
            this.setPreviousStatement(true, null);
            this.setNextStatement(true, null);
          } else {
            this.setOutput(true, null);
          }
          this.setColour(cat.hue);
          if (b.tooltip) this.setTooltip(b.tooltip);
        },
      };
      const spec = b;
      javascriptGenerator.forBlock[b.type] = (block: Blockly.Block) => {
        const args = spec.args.map((_, i) => javascriptGenerator.valueToCode(block, 'ARG' + i, Order.NONE) || 'null');
        const out = spec.gen(args);
        return spec.statement ? out : ([out, spec.order ?? Order.ATOMIC] as [string, number]);
      };
    }
    return {
      kind: 'category' as const,
      name: cat.name,
      colour: String(cat.hue),
      contents: cat.blocks.map((b) => ({ kind: 'block' as const, type: b.type })),
    };
  });
}
