import * as Blockly from 'blockly';

const HUE = '#884400';

const CAN_IDS: [string, string][] = [['0', '0'], ['1', '1']];

const MODE_OPTIONS: [string, string][] = [
  ['normal', 'NORMAL'],
  ['loopback', 'LOOPBACK'],
  ['silent', 'SILENT'],
  ['silent_loopback', 'SILENT_LOOPBACK'],
];

const BAUD_OPTIONS: [string, string][] = [
  ['25K', '25000'],
  ['50K', '50000'],
  ['100K', '100000'],
  ['125K', '125000'],
  ['250K', '250000'],
  ['500K', '500000'],
  ['800K', '800000'],
  ['1M', '1000000'],
];

const BOOL_OPTIONS: [string, string][] = [['True', 'True'], ['False', 'False']];

export function registerCanBlocks(): void {
  /** Init CAN (simple) — ID, mode, TX, RX, baudrate */
  Blockly.Blocks['upy_can_init'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Init')
        .appendField(new Blockly.FieldVariable('can'), 'VAR')
        .appendField('with');
      this.appendDummyInput()
        .appendField('ID')
        .appendField(new Blockly.FieldDropdown(CAN_IDS), 'ID')
        .appendField('mode')
        .appendField(new Blockly.FieldDropdown(MODE_OPTIONS), 'MODE');
      this.appendDummyInput()
        .appendField('TX')
        .appendField(new Blockly.FieldNumber(0, 0, 48), 'TX')
        .appendField('RX')
        .appendField(new Blockly.FieldNumber(0, 0, 48), 'RX');
      this.appendDummyInput()
        .appendField('baudrate')
        .appendField(new Blockly.FieldDropdown(BAUD_OPTIONS), 'BAUD');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('can = CAN(id=n, mode=CAN.NORMAL, port=(tx, rx), baudrate=25000)');
    },
  };

  /** Init CAN (advanced timing) — prescaler/sjw/bs1/bs2/triple_sampling */
  Blockly.Blocks['upy_can_init_adv'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Init')
        .appendField(new Blockly.FieldVariable('can'), 'VAR')
        .appendField('with');
      this.appendDummyInput()
        .appendField('ID')
        .appendField(new Blockly.FieldDropdown(CAN_IDS), 'ID')
        .appendField('mode')
        .appendField(new Blockly.FieldDropdown(MODE_OPTIONS), 'MODE');
      this.appendDummyInput()
        .appendField('TX')
        .appendField(new Blockly.FieldNumber(0, 0, 48), 'TX')
        .appendField('RX')
        .appendField(new Blockly.FieldNumber(0, 0, 48), 'RX');
      this.appendDummyInput()
        .appendField('prescaler')
        .appendField(new Blockly.FieldNumber(128, 1), 'PRESCALER')
        .appendField('sjw')
        .appendField(new Blockly.FieldNumber(3, 1, 4), 'SJW');
      this.appendDummyInput()
        .appendField('bs1')
        .appendField(new Blockly.FieldNumber(16, 1, 16), 'BS1')
        .appendField('bs2')
        .appendField(new Blockly.FieldNumber(8, 1, 8), 'BS2')
        .appendField('triple sampling')
        .appendField(new Blockly.FieldDropdown(BOOL_OPTIONS), 'TRIPLE');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('can = CAN(id=n, mode=CAN.NORMAL, port=(tx, rx), prescaler=128, sjw=3, bs1=16, bs2=8, triple_sampling=False)');
    },
  };

  /** [VAR] deinit */
  Blockly.Blocks['upy_can_deinit'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('can'), 'VAR')
        .appendField('deinit');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('can.deinit()');
    },
  };

  /** CAN get state (return int) */
  Blockly.Blocks['upy_can_state'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('can'), 'VAR')
        .appendField('get state (return int)');
      this.setOutput(true, 'Number');
      this.setTooltip('can.state()');
    },
  };

  /** CAN get error status information */
  Blockly.Blocks['upy_can_info'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('can'), 'VAR')
        .appendField('get error status information');
      this.setOutput(true, null);
      this.setTooltip('can.info() → list');
    },
  };

  /** CAN count of available (return True or False) */
  Blockly.Blocks['upy_can_any'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('can'), 'VAR')
        .appendField('count of available (return True or False)');
      this.setOutput(true, 'Boolean');
      this.setTooltip('can.any(0) → bool');
    },
  };

  /** CAN read message timeout [N] (return tuple) */
  Blockly.Blocks['upy_can_recv_val'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('can'), 'VAR')
        .appendField('read message timeout');
      this.appendValueInput('TIMEOUT').setCheck('Number');
      this.appendDummyInput().appendField('(return tuple)');
      this.setOutput(true, null);
      this.setInputsInline(true);
      this.setTooltip('can.recv(0, timeout=ms) → (id, rtr, fdf, data)');
    },
  };

  /** CAN read message into [BUF] timeout [N] */
  Blockly.Blocks['upy_can_recv'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('can'), 'VAR')
        .appendField('read message into');
      this.appendValueInput('BUF');
      this.appendDummyInput().appendField('timeout');
      this.appendValueInput('TIMEOUT').setCheck('Number');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setTooltip('can.recv(0, buf, timeout=ms)');
    },
  };

  /** CAN send [DATA] id [ID] timeout [T] rtr [F] extframe [F] */
  Blockly.Blocks['upy_can_send'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('can'), 'VAR')
        .appendField('send');
      this.appendValueInput('DATA');
      this.appendDummyInput().appendField('id');
      this.appendValueInput('ID').setCheck('Number');
      this.appendDummyInput()
        .appendField('timeout');
      this.appendValueInput('TIMEOUT').setCheck('Number');
      this.appendDummyInput()
        .appendField('rtr')
        .appendField(new Blockly.FieldDropdown(BOOL_OPTIONS), 'RTR')
        .appendField('extframe')
        .appendField(new Blockly.FieldDropdown(BOOL_OPTIONS), 'EXTFRAME');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setTooltip('can.send(data, id, timeout=0, rtr=False, extframe=False)');
    },
  };

  /** CAN restart */
  Blockly.Blocks['upy_can_restart'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('can'), 'VAR')
        .appendField('restart');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('can.restart()');
    },
  };
}
