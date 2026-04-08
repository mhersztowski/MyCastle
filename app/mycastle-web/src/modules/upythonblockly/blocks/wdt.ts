import * as Blockly from 'blockly';

const HUE = '#cc3300';

export function registerWdtBlocks(): void {
  /** Init WDT timeout [MS] milliseconds → wdt = WDT(timeout=ms) */
  Blockly.Blocks['upy_wdt_init'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Init WDT timeout');
      this.appendValueInput('TIMEOUT').setCheck('Number');
      this.appendDummyInput().appendField('milliseconds');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setTooltip('Initialize Watchdog Timer: wdt = WDT(timeout=ms)');
    },
  };

  /** WDT feed → wdt.feed() */
  Blockly.Blocks['upy_wdt_feed'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('WDT feed');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Feed (reset) the watchdog timer: wdt.feed()');
    },
  };
}
