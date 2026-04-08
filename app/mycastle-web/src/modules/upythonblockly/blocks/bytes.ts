import * as Blockly from 'blockly';

const HUE = '#7952b3';

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

const POSITION_OPTIONS: Array<[string, string]> = [
  ['#', 'FROM_START'],
  ['# from end', 'FROM_END'],
  ['first', 'FIRST'],
  ['last', 'LAST'],
  ['random', 'RANDOM'],
];

export function registerBytesBlocks(): void {
  /**
   * Create bytes from N items — dedicated mutator (gear icon) to add/remove items.
   * Generates: bytes([v1, v2, ...])
   */
  Blockly.Blocks['upy_bytes_create'] = {
    itemCount_: 3,

    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.setOutput(true, null);
      this.setMutator(
        new Blockly.icons.MutatorIcon(['upy_bytes_create_item'], this as Blockly.BlockSvg),
      );
      this.setTooltip('Create a bytes object from a list of byte values: bytes([v1, v2, ...])');
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
      const container = workspace.newBlock('upy_bytes_create_container');
      (container as any).initSvg();
      let conn = container.getInput('STACK')!.connection!;
      for (let i = 0; i < (this as any).itemCount_; i++) {
        const item = workspace.newBlock('upy_bytes_create_item');
        (item as any).initSvg();
        conn.connect(item.previousConnection!);
        conn = item.nextConnection!;
      }
      return container;
    },

    compose(this: Blockly.Block, container: Blockly.Block): void {
      let item = container.getInputTargetBlock('STACK');
      const connections: Array<Blockly.Connection | null> = [];
      while (item && item.type === 'upy_bytes_create_item') {
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
      while (item && item.type === 'upy_bytes_create_item') {
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
        this.appendValueInput(`ADD${j}`).appendField(j === 0 ? 'create bytes with' : '');
      }
    },
  };

  /** Mutator popup container for upy_bytes_create */
  Blockly.Blocks['upy_bytes_create_container'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('bytes');
      this.appendStatementInput('STACK');
      this.setColour(HUE);
      this.setTooltip('Add or remove byte values');
      this.contextMenu = false;
    },
  };

  /** Mutator popup item representing one byte value */
  Blockly.Blocks['upy_bytes_create_item'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('byte');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(HUE);
      this.setTooltip('A byte value (0–255)');
      this.contextMenu = false;
    },
  };

  /**
   * Get byte at 1-based position.
   */
  Blockly.Blocks['upy_bytes_get'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('in bytes')
        .appendField(new Blockly.FieldVariable('bytes'), 'BYTES')
        .appendField('get')
        .appendField(makeModeDropdown(POSITION_OPTIONS), 'MODE');
      this.appendValueInput('IDX');
      this.setOutput(true, 'Number');
      this.setInputsInline(true);
      this.setTooltip('Get byte at position (1-based): bytes[idx - 1]');
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

  /**
   * Remove byte at 1-based position (statement).
   */
  Blockly.Blocks['upy_bytes_remove'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('in bytes')
        .appendField(new Blockly.FieldVariable('bytes'), 'BYTES')
        .appendField('remove')
        .appendField(makeModeDropdown(POSITION_OPTIONS), 'MODE');
      this.appendValueInput('IDX');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(true);
      this.setTooltip('Remove byte at position: bytes.pop(idx - 1)');
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

  /** Get sub-bytes (slice) with 1-based positions. */
  Blockly.Blocks['upy_bytes_sublist'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('in bytes')
        .appendField(new Blockly.FieldVariable('bytes'), 'BYTES')
        .appendField('get sub-list from')
        .appendField(
          new Blockly.FieldDropdown([
            ['#', 'FROM_START'],
            ['# from end', 'FROM_END'],
            ['first', 'FIRST'],
            ['last', 'LAST'],
          ]),
          'FROM_MODE',
        );
      this.appendValueInput('FROM_IDX');
      this.appendValueInput('TO_IDX')
        .appendField('to')
        .appendField(
          new Blockly.FieldDropdown([
            ['#', 'FROM_START'],
            ['# from end', 'FROM_END'],
            ['first', 'FIRST'],
            ['last', 'LAST'],
          ]),
          'TO_MODE',
        );
      this.setOutput(true, null);
      this.setInputsInline(true);
      this.setTooltip('Get a sub-bytes slice (1-based)');
    },
  };

  /** Decode bytes to string */
  Blockly.Blocks['upy_bytes_decode'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('bytes')
        .appendField(new Blockly.FieldVariable('bytes'), 'BYTES')
        .appendField('decode')
        .appendField(
          new Blockly.FieldDropdown([
            ['utf-8', 'utf-8'],
            ['ascii', 'ascii'],
            ['latin-1', 'latin-1'],
          ]),
          'ENCODING',
        );
      this.setOutput(true, 'String');
      this.setInputsInline(true);
      this.setTooltip('Decode bytes to string: bytes.decode(encoding)');
    },
  };
}
