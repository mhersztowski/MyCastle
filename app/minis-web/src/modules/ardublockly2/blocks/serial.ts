import * as Blockly from 'blockly';
import type { BoardManager } from '../boards/BoardManager';

/** HSV hue for all Serial blocks. */
const HUE = 160;

/** Custom block type that exposes the serial setup instance name. */
interface SerialSetupBlock extends Blockly.Block {
  getSerialSetupInstance?: () => string;
}

export function registerSerialBlocks(boardManager: BoardManager): void {
  Blockly.Blocks['serial_setup'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('http://arduino.cc/en/Serial/Begin');
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('setup')
        .appendField(
          new Blockly.FieldDropdown(() => boardManager.selected.serial),
          'SERIAL_ID',
        )
        .appendField('speed to')
        .appendField(
          new Blockly.FieldDropdown(() => boardManager.selected.serialSpeed),
          'SPEED',
        )
        .appendField('bps');
      this.setInputsInline(true);
      this.setTooltip('Set up the serial connection speed (baud rate)');
    },

    /**
     * Returns the serial instance name selected in this setup block.
     */
    getSerialSetupInstance: function (this: Blockly.Block): string {
      return this.getFieldValue('SERIAL_ID');
    },
  };

  Blockly.Blocks['serial_print'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('http://www.arduino.cc/en/Serial/Print');
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(
          new Blockly.FieldDropdown(() => boardManager.selected.serial),
          'SERIAL_ID',
        )
        .appendField('print');
      this.appendValueInput('CONTENT');
      this.appendDummyInput()
        .appendField(new Blockly.FieldCheckbox('TRUE'), 'NEW_LINE')
        .appendField('add new line');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Print a message to the specified serial port');
    },

    onchange: function (this: Blockly.Block, event: Blockly.Events.Abstract) {
      if (!this.workspace) return;
      if (
        event.type === Blockly.Events.BLOCK_MOVE ||
        event.type === Blockly.Events.CLICK
      ) {
        return;
      }

      const thisInstanceName = this.getFieldValue('SERIAL_ID');
      const blocks = this.workspace.getTopBlocks(false);
      let setupInstancePresent = false;

      for (const block of blocks) {
        const setupBlock = block as SerialSetupBlock;
        if (setupBlock.getSerialSetupInstance) {
          if (setupBlock.getSerialSetupInstance() === thisInstanceName) {
            setupInstancePresent = true;
            break;
          }
        }
      }

      if (!setupInstancePresent) {
        this.setWarningText(
          `The serial setup block for "${thisInstanceName}" is missing. Add a serial_setup block to configure the serial port.`,
          'serial_setup',
        );
      } else {
        this.setWarningText(null, 'serial_setup');
      }
    },
  };
}
