import * as Blockly from 'blockly';

const HUE = '#9b5ba5';

const POSITION_OPTIONS: Array<[string, string]> = [
  ['#', 'FROM_START'],
  ['# from end', 'FROM_END'],
  ['first', 'FIRST'],
  ['last', 'LAST'],
  ['random', 'RANDOM'],
];

/** Returns true when a position mode requires an explicit index input. */
function modeNeedsIdx(mode: string): boolean {
  return mode === 'FROM_START' || mode === 'FROM_END';
}

/** FieldDropdown validator that shows/hides the IDX input when mode changes. */
function makeModeDropdown(options: Array<[string, string]>): Blockly.FieldDropdown {
  return new Blockly.FieldDropdown(options, function (
    this: Blockly.FieldDropdown,
    newMode: string,
  ) {
    const block = this.getSourceBlock();
    if (block) {
      block.getInput('IDX')?.setVisible(modeNeedsIdx(newMode));
    }
    return newMode;
  });
}

export function registerTupleBlocks(): void {
  /**
   * Create tuple with N items — dedicated mutator (gear icon) to add/remove items.
   * Generates: (a, b, c, ...)
   */
  Blockly.Blocks['upy_tuple_create_with'] = {
    itemCount_: 3,

    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.setOutput(true, null);
      this.setMutator(
        new Blockly.icons.MutatorIcon(['upy_tuple_create_item'], this as Blockly.BlockSvg),
      );
      this.setTooltip('Create a tuple with any number of items: (a, b, c)');
      (this as any).updateShape_();
    },

    mutationToDom(this: Blockly.Block): Element {
      const container = Blockly.utils.xml.createElement('mutation');
      container.setAttribute('items', String((this as any).itemCount_));
      return container;
    },

    domToMutation(this: Blockly.Block, xmlElement: Element): void {
      (this as any).itemCount_ = parseInt(xmlElement.getAttribute('items') ?? '3', 10);
      (this as any).updateShape_();
    },

    decompose(this: Blockly.Block, workspace: Blockly.WorkspaceSvg): Blockly.Block {
      const container = workspace.newBlock('upy_tuple_create_container');
      (container as any).initSvg();
      let conn = container.getInput('STACK')!.connection!;
      for (let i = 0; i < (this as any).itemCount_; i++) {
        const item = workspace.newBlock('upy_tuple_create_item');
        (item as any).initSvg();
        conn.connect(item.previousConnection!);
        conn = item.nextConnection!;
      }
      return container;
    },

    compose(this: Blockly.Block, container: Blockly.Block): void {
      let item = container.getInputTargetBlock('STACK');
      const connections: Array<Blockly.Connection | null> = [];
      while (item && item.type === 'upy_tuple_create_item') {
        connections.push((item as any).valueConnection_ ?? null);
        item = item.getNextBlock();
      }
      (this as any).itemCount_ = connections.length;
      (this as any).updateShape_();
      for (let i = 0; i < connections.length; i++) {
        if (connections[i]) this.getInput(`ADD${i}`)?.connection?.connect(connections[i]!);
      }
    },

    saveConnections(this: Blockly.Block, container: Blockly.Block): void {
      let item = container.getInputTargetBlock('STACK');
      let i = 0;
      while (item && item.type === 'upy_tuple_create_item') {
        (item as any).valueConnection_ =
          this.getInput(`ADD${i}`)?.connection?.targetConnection ?? null;
        i++;
        item = item.getNextBlock();
      }
    },

    updateShape_(this: Blockly.Block): void {
      let i = 0;
      while (this.getInput(`ADD${i}`)) {
        this.removeInput(`ADD${i}`);
        i++;
      }
      for (let j = 0; j < (this as any).itemCount_; j++) {
        this.appendValueInput(`ADD${j}`).appendField(j === 0 ? 'create tuple with' : '');
      }
    },
  };

  /** Mutator popup container for upy_tuple_create_with */
  Blockly.Blocks['upy_tuple_create_container'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('tuple');
      this.appendStatementInput('STACK');
      this.setColour(HUE);
      this.setTooltip('Add or remove items from the tuple');
      this.contextMenu = false;
    },
  };

  /** Mutator popup item representing one element */
  Blockly.Blocks['upy_tuple_create_item'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('item');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(HUE);
      this.setTooltip('An item in the tuple');
      this.contextMenu = false;
    },
  };

  /** Length of tuple */
  Blockly.Blocks['upy_tuple_length'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('length of')
        .appendField(new Blockly.FieldVariable('tuple'), 'TUPLE');
      this.setOutput(true, 'Number');
      this.setInputsInline(true);
      this.setTooltip('Get length of tuple: len(tuple)');
    },
  };

  /** Get item at position (tuples use 1-based indexing) */
  Blockly.Blocks['upy_tuple_get'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('in tuple')
        .appendField(new Blockly.FieldVariable('tuple'), 'TUPLE')
        .appendField('get')
        .appendField(makeModeDropdown(POSITION_OPTIONS), 'MODE');
      this.appendValueInput('IDX');
      this.setOutput(true, null);
      this.setInputsInline(true);
      this.setTooltip(
        'Get item at position in tuple. # and # from end use 1-based indexing.',
      );
    },

    mutationToDom(this: Blockly.Block): Element {
      const el = Blockly.utils.xml.createElement('mutation');
      el.setAttribute('mode', this.getFieldValue('MODE') ?? 'FROM_START');
      return el;
    },

    domToMutation(this: Blockly.Block, xml: Element): void {
      const mode = xml.getAttribute('mode') ?? 'FROM_START';
      this.getInput('IDX')?.setVisible(modeNeedsIdx(mode));
    },
  };

  /** Check if item exists in tuple — returns True or False */
  Blockly.Blocks['upy_tuple_find'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('in tuple')
        .appendField(new Blockly.FieldVariable('tuple'), 'TUPLE')
        .appendField('find item');
      this.appendValueInput('ITEM');
      this.appendDummyInput().appendField('(return True or False)');
      this.setOutput(true, 'Boolean');
      this.setInputsInline(true);
      this.setTooltip('Check if item exists in tuple: item in tuple');
    },
  };
}
