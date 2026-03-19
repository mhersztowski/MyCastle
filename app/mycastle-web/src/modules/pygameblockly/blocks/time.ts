import * as Blockly from 'blockly';

const HUE = '#D4A020';

export function registerTimeBlocks(): void {
  Blockly.Blocks['pg_get_ticks'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('time (ms)');
      this.setOutput(true, 'Number');
      this.setTooltip('Milliseconds since pygame.init()');
    },
  };

  Blockly.Blocks['pg_delta_time'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('delta time (ms)');
      this.setOutput(true, 'Number');
      this.setTooltip('Time in ms since last frame');
    },
  };
}
