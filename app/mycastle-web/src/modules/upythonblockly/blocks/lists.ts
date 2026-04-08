import * as Blockly from 'blockly';

const HUE = '#5ba5a5';

const POSITION_OPTIONS: Array<[string, string]> = [
  ['#', 'FROM_START'],
  ['# from end', 'FROM_END'],
  ['first', 'FIRST'],
  ['last', 'LAST'],
  ['random', 'RANDOM'],
];

const SUBLIST_POSITION_OPTIONS: Array<[string, string]> = [
  ['#', 'FROM_START'],
  ['# from end', 'FROM_END'],
  ['first', 'FIRST'],
  ['last', 'LAST'],
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

export function registerListBlocks(): void {
  /** Create empty list */
  Blockly.Blocks['upy_list_create_empty'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('create empty list');
      this.setOutput(true, 'Array');
      this.setTooltip('Create an empty list: []');
    },
  };

  /** Create list with item repeated N times */
  Blockly.Blocks['upy_list_repeat'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('ITEM').appendField('create list with item');
      this.appendValueInput('TIMES').appendField('repeated');
      this.appendDummyInput().appendField('times');
      this.setOutput(true, 'Array');
      this.setInputsInline(true);
      this.setTooltip('Create a list by repeating an item N times: [item] * n');
    },
  };

  /** Length of list */
  Blockly.Blocks['upy_list_length'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('length of')
        .appendField(new Blockly.FieldVariable('list'), 'LIST');
      this.setOutput(true, 'Number');
      this.setInputsInline(true);
      this.setTooltip('Get length of list: len(list)');
    },
  };

  /** Is list empty */
  Blockly.Blocks['upy_list_is_empty'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('list'), 'LIST')
        .appendField('is empty');
      this.setOutput(true, 'Boolean');
      this.setInputsInline(true);
      this.setTooltip('Check if list is empty: not len(list)');
    },
  };

  /** Find first/last occurrence of item in list */
  Blockly.Blocks['upy_list_find'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('in list')
        .appendField(new Blockly.FieldVariable('list'), 'LIST')
        .appendField('find')
        .appendField(
          new Blockly.FieldDropdown([
            ['first', 'FIRST'],
            ['last', 'LAST'],
          ]),
          'FIND_TYPE',
        )
        .appendField('occurrence of item');
      this.appendValueInput('ITEM');
      this.setOutput(true, 'Number');
      this.setInputsInline(true);
      this.setTooltip('Find index of first or last occurrence of item (0-based, -1 if not found)');
    },
  };

  /** Get item at position */
  Blockly.Blocks['upy_list_get'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('in list')
        .appendField(new Blockly.FieldVariable('list'), 'LIST')
        .appendField('get')
        .appendField(makeModeDropdown(POSITION_OPTIONS), 'MODE');
      this.appendValueInput('IDX');
      this.setOutput(true, null);
      this.setInputsInline(true);
      this.setTooltip('Get item at position in list');
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

  /** Get and remove item at position */
  Blockly.Blocks['upy_list_get_remove'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('in list')
        .appendField(new Blockly.FieldVariable('list'), 'LIST')
        .appendField('get and remove')
        .appendField(makeModeDropdown(POSITION_OPTIONS), 'MODE');
      this.appendValueInput('IDX');
      this.setOutput(true, null);
      this.setInputsInline(true);
      this.setTooltip('Get and remove item at position: list.pop(idx)');
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

  /** Remove item at position (statement) */
  Blockly.Blocks['upy_list_remove'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('in list')
        .appendField(new Blockly.FieldVariable('list'), 'LIST')
        .appendField('remove')
        .appendField(makeModeDropdown(POSITION_OPTIONS), 'MODE');
      this.appendValueInput('IDX');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(true);
      this.setTooltip('Remove item at position from list: list.pop(idx)');
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

  /** Set item at position (statement) */
  Blockly.Blocks['upy_list_set'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('in list')
        .appendField(new Blockly.FieldVariable('list'), 'LIST')
        .appendField('set')
        .appendField(makeModeDropdown(POSITION_OPTIONS), 'MODE');
      this.appendValueInput('IDX');
      this.appendValueInput('VALUE').appendField('as');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(true);
      this.setTooltip('Set item at position in list to a value');
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

  /** Get sub-list (slice) */
  Blockly.Blocks['upy_list_sublist'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('in list')
        .appendField(new Blockly.FieldVariable('list'), 'LIST')
        .appendField('get sub-list from')
        .appendField(new Blockly.FieldDropdown(SUBLIST_POSITION_OPTIONS), 'FROM_MODE');
      this.appendValueInput('FROM_IDX');
      this.appendValueInput('TO_IDX')
        .appendField('to')
        .appendField(new Blockly.FieldDropdown(SUBLIST_POSITION_OPTIONS), 'TO_MODE');
      this.setOutput(true, 'Array');
      this.setInputsInline(true);
      this.setTooltip('Get a sub-list (slice) from list');
    },
  };

  /** Make list from text by splitting */
  Blockly.Blocks['upy_list_from_text'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('TEXT').appendField('make list from text');
      this.appendValueInput('DELIM').appendField('with delimiter');
      this.setOutput(true, 'Array');
      this.setInputsInline(true);
      this.setTooltip('Split text into list by delimiter: text.split(delim)');
    },
  };

  /** Make text from list by joining */
  Blockly.Blocks['upy_list_to_text'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('make text from list')
        .appendField(new Blockly.FieldVariable('list'), 'LIST')
        .appendField('with delimiter');
      this.appendValueInput('DELIM');
      this.setOutput(true, 'String');
      this.setInputsInline(true);
      this.setTooltip('Join list items into text with delimiter: delim.join(list)');
    },
  };
}
