import * as Blockly from 'blockly';

const HUE = '#5ba58c';

export function registerTextBlocks(): void {
  /** Count occurrences of a substring in text */
  Blockly.Blocks['upy_text_count'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('SUB').appendField('count');
      this.appendValueInput('TEXT').appendField('in');
      this.setOutput(true, 'Number');
      this.setInputsInline(true);
      this.setTooltip('Count occurrences of substring: text.count(sub)');
    },
  };

  /** Get character at index */
  Blockly.Blocks['upy_text_index'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('TEXT').appendField('in text');
      this.appendValueInput('IDX').appendField('get letter #');
      this.setOutput(true, 'String');
      this.setInputsInline(true);
      this.setTooltip('Get character at index: text[idx]');
    },
  };

  /** Replace all occurrences of a substring */
  Blockly.Blocks['upy_text_replace'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('OLD').appendField('replace');
      this.appendValueInput('NEW').appendField('with');
      this.appendValueInput('TEXT').appendField('in');
      this.setOutput(true, 'String');
      this.setInputsInline(true);
      this.setTooltip('Replace substring: text.replace(old, new)');
    },
  };

  /** Trim whitespace from string */
  Blockly.Blocks['upy_text_trim'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('TEXT')
        .appendField('trim spaces from')
        .appendField(
          new Blockly.FieldDropdown([
            ['both sides', 'BOTH'],
            ['left side', 'LEFT'],
            ['right side', 'RIGHT'],
          ]),
          'SIDE',
        )
        .appendField('of');
      this.setOutput(true, 'String');
      this.setInputsInline(true);
      this.setTooltip('Trim whitespace: .strip() / .lstrip() / .rstrip()');
    },
  };

  /** Prompt user for text input */
  Blockly.Blocks['upy_text_prompt'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('MSG').appendField('prompt for text with message');
      this.setOutput(true, 'String');
      this.setInputsInline(true);
      this.setTooltip('Prompt user for text input using input() / raw_input()');
    },
  };

  /** Convert value to string */
  Blockly.Blocks['upy_text_to_str'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('VALUE').appendField('convert to str');
      this.setOutput(true, 'String');
      this.setInputsInline(true);
      this.setTooltip('Convert value to string: str(value)');
    },
  };

  /** Convert character to Unicode code point */
  Blockly.Blocks['upy_text_ord'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('CHAR').appendField('convert');
      this.appendDummyInput().appendField('to Unicode');
      this.setOutput(true, 'Number');
      this.setInputsInline(true);
      this.setTooltip('Get Unicode code point of character: ord(char)');
    },
  };

  /** Decode bytes to string */
  Blockly.Blocks['upy_text_decode'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('TEXT').appendField('decode');
      this.setOutput(true, 'String');
      this.setInputsInline(true);
      this.setTooltip('Decode bytes to string: bytes.decode()');
    },
  };

  /** Encode string to bytes */
  Blockly.Blocks['upy_text_encode'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('TEXT').appendField('encode');
      this.setOutput(true, null);
      this.setInputsInline(true);
      this.setTooltip('Encode string to bytes: str.encode()');
    },
  };

  /** Format value as float with N decimal places */
  Blockly.Blocks['upy_text_format_float'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('VALUE').appendField('reduce');
      this.appendValueInput('DECIMALS').appendField('to');
      this.appendDummyInput().appendField('decimal places');
      this.setOutput(true, 'String');
      this.setInputsInline(true);
      this.setTooltip('Format number as string with N decimal places: "%.Nf" % value');
    },
  };

  /** Convert number to hex string */
  Blockly.Blocks['upy_text_to_hex'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('NUM').appendField('convert number');
      this.appendValueInput('WIDTH').appendField('to hex string with width');
      this.appendDummyInput()
        .appendField(", leading zero's")
        .appendField(
          new Blockly.FieldDropdown([
            ['True', 'true'],
            ['False', 'false'],
          ]),
          'ZEROS',
        )
        .appendField(', prefix \'0x\'')
        .appendField(
          new Blockly.FieldDropdown([
            ['True', 'true'],
            ['False', 'false'],
          ]),
          'PREFIX',
        );
      this.setOutput(true, 'String');
      this.setInputsInline(true);
      this.setTooltip('Convert number to hexadecimal string');
    },
  };
}
