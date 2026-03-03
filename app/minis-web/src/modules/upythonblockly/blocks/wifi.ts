import * as Blockly from 'blockly';

const HUE = 120;

export function registerWifiBlocks(): void {
  /** Connect to WiFi network */
  Blockly.Blocks['upy_wifi_connect'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('SSID').appendField('WiFi connect SSID').setCheck('String');
      this.appendValueInput('PASSWORD').appendField('password').setCheck('String');
      this.setInputsInline(false);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Connect to a WiFi network (blocks until connected or timeout)');
    },
  };

  /** Check if WiFi is connected */
  Blockly.Blocks['upy_wifi_is_connected'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('WiFi is connected');
      this.setOutput(true, 'Boolean');
      this.setTooltip('Returns True if the device is connected to a WiFi network');
    },
  };

  /** Get WiFi IP info */
  Blockly.Blocks['upy_wifi_ifconfig'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('WiFi IP address');
      this.setOutput(true, 'String');
      this.setTooltip('Returns the IP address of the WiFi interface');
    },
  };

  /** Disconnect from WiFi */
  Blockly.Blocks['upy_wifi_disconnect'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('WiFi disconnect');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Disconnect from the current WiFi network');
    },
  };
}
