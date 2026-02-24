import * as Blockly from 'blockly';
import type { BoardManager } from '../boards/BoardManager';

/** HSV hue for all SPI blocks. */
const HUE = 170;

/** Custom block type that exposes the SPI setup instance name. */
interface SpiSetupBlock extends Blockly.Block {
  getSpiSetupInstance?: () => string;
}

/**
 * Shared onchange validator for spi_transfer and spi_transfer_return.
 * Checks that a matching spi_setup block exists in the workspace.
 */
function spiTransferOnChange(
  this: Blockly.Block,
  event: Blockly.Events.Abstract,
): void {
  if (!this.workspace) return;
  if (
    event.type === Blockly.Events.BLOCK_MOVE ||
    event.type === Blockly.Events.CLICK
  ) {
    return;
  }

  const thisInstanceName = this.getFieldValue('SPI_ID');
  const blocks = this.workspace.getTopBlocks(false);
  let setupInstancePresent = false;

  for (const block of blocks) {
    const setupBlock = block as SpiSetupBlock;
    if (setupBlock.getSpiSetupInstance) {
      if (setupBlock.getSpiSetupInstance() === thisInstanceName) {
        setupInstancePresent = true;
        break;
      }
    }
  }

  if (!setupInstancePresent) {
    this.setWarningText(
      `The SPI setup block for "${thisInstanceName}" is missing. Add an spi_setup block to configure the SPI port.`,
      'spi_setup',
    );
  } else {
    this.setWarningText(null, 'spi_setup');
  }
}

export function registerSpiBlocks(boardManager: BoardManager): void {
  Blockly.Blocks['spi_setup'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('http://arduino.cc/en/Reference/SPI');
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('setup')
        .appendField(
          new Blockly.FieldDropdown(() => boardManager.selected.spi),
          'SPI_ID',
        )
        .appendField('configuration:');
      this.appendDummyInput()
        .appendField('shift data')
        .appendField(
          new Blockly.FieldDropdown([
            ['MSB first', 'MSBFIRST'],
            ['LSB first', 'LSBFIRST'],
          ]),
          'SPI_SHIFT_ORDER',
        );
      this.appendDummyInput()
        .appendField('clock divide')
        .appendField(
          new Blockly.FieldDropdown(
            () => boardManager.selected.spiClockDivide,
          ),
          'SPI_CLOCK_DIVIDE',
        );
      this.appendDummyInput()
        .appendField('SPI mode')
        .appendField(
          new Blockly.FieldDropdown([
            ['Mode 0 (CPOL=0 CPHA=0)', 'SPI_MODE0'],
            ['Mode 1 (CPOL=0 CPHA=1)', 'SPI_MODE1'],
            ['Mode 2 (CPOL=1 CPHA=0)', 'SPI_MODE2'],
            ['Mode 3 (CPOL=1 CPHA=1)', 'SPI_MODE3'],
          ]),
          'SPI_MODE',
        );
      this.setTooltip('Configure the SPI bus: shift order, clock speed, and SPI mode');
    },

    /**
     * Returns the SPI instance name selected in this setup block.
     */
    getSpiSetupInstance: function (this: Blockly.Block): string {
      return this.getFieldValue('SPI_ID');
    },
  };

  Blockly.Blocks['spi_transfer'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('http://arduino.cc/en/Reference/SPITransfer');
      this.setColour(HUE);
      this.appendDummyInput().appendField(
        new Blockly.FieldDropdown(() => boardManager.selected.spi),
        'SPI_ID',
      );
      this.appendValueInput('SPI_DATA')
        .setCheck('Number')
        .appendField('transfer value');
      this.appendDummyInput()
        .appendField('slave pin')
        .appendField(
          new Blockly.FieldDropdown(
            () =>
              [['none', 'none'] as [string, string]].concat(
                boardManager.selected.digitalPins,
              ),
          ),
          'SPI_SS',
        );
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip(
        'Send a SPI message to a device. Optionally select a slave pin.',
      );
    },

    onchange: spiTransferOnChange,
  };

  Blockly.Blocks['spi_transfer_return'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('http://arduino.cc/en/Reference/SPITransfer');
      this.setColour(HUE);
      this.appendDummyInput().appendField(
        new Blockly.FieldDropdown(() => boardManager.selected.spi),
        'SPI_ID',
      );
      this.appendValueInput('SPI_DATA').appendField('transfer value');
      this.appendDummyInput()
        .appendField('slave pin')
        .appendField(
          new Blockly.FieldDropdown(
            () =>
              [['none', 'none'] as [string, string]].concat(
                boardManager.selected.digitalPins,
              ),
          ),
          'SPI_SS',
        );
      this.setInputsInline(true);
      this.setOutput(true, 'Number');
      this.setTooltip(
        'Send a SPI message and get the returned data from the device',
      );
    },

    onchange: spiTransferOnChange,
  };
}
