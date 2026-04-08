import * as Blockly from 'blockly';

const HUE = '#c4527a';

export function registerMapBlocks(): void {
  /**
   * Create map (dict) with N key-value pairs.
   * Uses a mutator (gear icon) to add/remove pairs.
   */
  Blockly.Blocks['upy_map_create'] = {
    pairCount_: 1,

    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('KEY0').appendField('create map').appendField('key');
      this.appendValueInput('VAL0').appendField('value');
      this.setOutput(true, null);
      this.setMutator(
        new Blockly.icons.MutatorIcon(['upy_map_create_item'], this as Blockly.BlockSvg),
      );
      this.setTooltip("Create a dictionary: {'key': value, ...}");
    },

    mutationToDom(this: Blockly.Block): Element {
      const container = Blockly.utils.xml.createElement('mutation');
      container.setAttribute('items', String((this as any).pairCount_));
      return container;
    },

    domToMutation(this: Blockly.Block, xmlElement: Element): void {
      (this as any).pairCount_ = parseInt(xmlElement.getAttribute('items') ?? '1', 10);
      (this as any).updateShape_();
    },

    decompose(this: Blockly.Block, workspace: Blockly.WorkspaceSvg): Blockly.Block {
      const container = workspace.newBlock('upy_map_create_container');
      (container as any).initSvg();
      let conn = container.getInput('STACK')!.connection!;
      for (let i = 0; i < (this as any).pairCount_; i++) {
        const item = workspace.newBlock('upy_map_create_item');
        (item as any).initSvg();
        conn.connect(item.previousConnection!);
        conn = item.nextConnection!;
      }
      return container;
    },

    compose(this: Blockly.Block, container: Blockly.Block): void {
      let item = container.getInputTargetBlock('STACK');
      const keyConns: Array<Blockly.Connection | null> = [];
      const valConns: Array<Blockly.Connection | null> = [];
      while (item && item.type === 'upy_map_create_item') {
        keyConns.push((item as any).keyConnection_ ?? null);
        valConns.push((item as any).valConnection_ ?? null);
        item = item.getNextBlock();
      }
      (this as any).pairCount_ = keyConns.length;
      (this as any).updateShape_();
      for (let i = 0; i < keyConns.length; i++) {
        if (keyConns[i]) this.getInput(`KEY${i}`)?.connection?.connect(keyConns[i]!);
        if (valConns[i]) this.getInput(`VAL${i}`)?.connection?.connect(valConns[i]!);
      }
    },

    saveConnections(this: Blockly.Block, container: Blockly.Block): void {
      let item = container.getInputTargetBlock('STACK');
      let i = 0;
      while (item && item.type === 'upy_map_create_item') {
        (item as any).keyConnection_ =
          this.getInput(`KEY${i}`)?.connection?.targetConnection ?? null;
        (item as any).valConnection_ =
          this.getInput(`VAL${i}`)?.connection?.targetConnection ?? null;
        i++;
        item = item.getNextBlock();
      }
    },

    updateShape_(this: Blockly.Block): void {
      let i = 0;
      while (this.getInput(`KEY${i}`)) {
        this.removeInput(`KEY${i}`);
        this.removeInput(`VAL${i}`);
        i++;
      }
      for (let j = 0; j < (this as any).pairCount_; j++) {
        this.appendValueInput(`KEY${j}`)
          .appendField(j === 0 ? 'create map' : '')
          .appendField('key');
        this.appendValueInput(`VAL${j}`).appendField('value');
      }
    },
  };

  /** Mutator popup container for upy_map_create */
  Blockly.Blocks['upy_map_create_container'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('map');
      this.appendStatementInput('STACK');
      this.setColour(HUE);
      this.setTooltip('Add or remove key-value pairs');
      this.contextMenu = false;
    },
  };

  /** Mutator popup item representing one key-value pair */
  Blockly.Blocks['upy_map_create_item'] = {
    init(this: Blockly.Block) {
      this.appendDummyInput().appendField('key-value pair');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(HUE);
      this.setTooltip('One key-value pair in the map');
      this.contextMenu = false;
    },
  };

  /** Clear all entries from map */
  Blockly.Blocks['upy_map_clear'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('map')
        .appendField(new Blockly.FieldVariable('map'), 'MAP')
        .appendField('clear');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(true);
      this.setTooltip('Remove all entries from map: map.clear()');
    },
  };

  /** Check if map contains a key */
  Blockly.Blocks['upy_map_contains_key'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('map')
        .appendField(new Blockly.FieldVariable('map'), 'MAP')
        .appendField('contain key');
      this.appendValueInput('KEY');
      this.setOutput(true, 'Boolean');
      this.setInputsInline(true);
      this.setTooltip('Check if key exists in map: key in map.keys()');
    },
  };

  /** Get value by key */
  Blockly.Blocks['upy_map_get'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('in map')
        .appendField(new Blockly.FieldVariable('map'), 'MAP')
        .appendField('get key');
      this.appendValueInput('KEY');
      this.setOutput(true, null);
      this.setInputsInline(true);
      this.setTooltip('Get value by key: map[key]');
    },
  };

  /** Add a new key-value entry (statement) */
  Blockly.Blocks['upy_map_add_key'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('in map')
        .appendField(new Blockly.FieldVariable('map'), 'MAP')
        .appendField('add key');
      this.appendValueInput('KEY');
      this.appendValueInput('VALUE').appendField('value');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(true);
      this.setTooltip('Add entry to map: map[key] = value');
    },
  };

  /** Update an existing key's value (statement) */
  Blockly.Blocks['upy_map_set_key'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('in map')
        .appendField(new Blockly.FieldVariable('map'), 'MAP')
        .appendField('set key');
      this.appendValueInput('KEY');
      this.appendValueInput('VALUE').appendField('value');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(true);
      this.setTooltip('Update entry in map: map[key] = value');
    },
  };

  /** Delete a key from map (statement) */
  Blockly.Blocks['upy_map_delete_key'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('in map')
        .appendField(new Blockly.FieldVariable('map'), 'MAP')
        .appendField('delete key');
      this.appendValueInput('KEY');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(true);
      this.setTooltip('Delete entry from map: map.pop(key)');
    },
  };
}
