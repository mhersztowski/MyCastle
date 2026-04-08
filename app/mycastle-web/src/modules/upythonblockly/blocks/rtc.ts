import * as Blockly from 'blockly';

const HUE = '#006633';

const TZ_OPTIONS: [string, string][] = [
  ['GMT-12', 'GMT-12'], ['GMT-11', 'GMT-11'], ['GMT-10', 'GMT-10'],
  ['GMT-9', 'GMT-9'], ['GMT-8', 'GMT-8'], ['GMT-7', 'GMT-7'],
  ['GMT-6', 'GMT-6'], ['GMT-5', 'GMT-5'], ['GMT-4', 'GMT-4'],
  ['GMT-3', 'GMT-3'], ['GMT-2', 'GMT-2'], ['GMT-1', 'GMT-1'],
  ['GMT0', 'GMT0'],
  ['GMT+1', 'GMT+1'], ['GMT+2', 'GMT+2'], ['GMT+3', 'GMT+3'],
  ['GMT+4', 'GMT+4'], ['GMT+5', 'GMT+5'], ['GMT+6', 'GMT+6'],
  ['GMT+7', 'GMT+7'], ['GMT+8', 'GMT+8'], ['GMT+9', 'GMT+9'],
  ['GMT+10', 'GMT+10'], ['GMT+11', 'GMT+11'], ['GMT+12', 'GMT+12'],
  ['GMT+13', 'GMT+13'], ['GMT+14', 'GMT+14'],
];

export function registerRtcBlocks(): void {
  /** Init RTC → rtc = RTC() */
  Blockly.Blocks['upy_rtc_init'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Init RTC')
        .appendField(new Blockly.FieldVariable('rtc'), 'VAR');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Initialize RTC: rtc = RTC()');
    },
  };

  /** get UTC time (return tuple) → rtc.datetime() */
  Blockly.Blocks['upy_rtc_get_utc'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('rtc'), 'VAR')
        .appendField('get UTC time (return tuple)');
      this.setOutput(true, null);
      this.setTooltip('rtc.datetime() → (year, month, day, weekday, hour, minute, second, subsecond)');
    },
  };

  /** get local time (return tuple) → rtc.local_datetime() */
  Blockly.Blocks['upy_rtc_get_local'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('rtc'), 'VAR')
        .appendField('get local time (return tuple)');
      this.setOutput(true, null);
      this.setTooltip('rtc.local_datetime() → local time tuple');
    },
  };

  /** get timezone (return string) → rtc.timezone() */
  Blockly.Blocks['upy_rtc_get_tz'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('rtc'), 'VAR')
        .appendField('get timezone (return string)');
      this.setOutput(true, null);
      this.setTooltip('rtc.timezone() → timezone string');
    },
  };

  /** in tuple [INPUT] get # [N] → (expr)[n] */
  Blockly.Blocks['upy_rtc_tuple_get'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('in tuple');
      this.appendValueInput('TUPLE');
      this.appendDummyInput()
        .appendField('get #')
        .appendField(new Blockly.FieldNumber(0, 0, 7), 'IDX');
      this.setOutput(true, null);
      this.setInputsInline(true);
      this.setTooltip('Get element at index from time tuple (0=year, 1=month, 2=day, 3=weekday, 4=hour, 5=minute, 6=second, 7=subsecond)');
    },
  };

  /** Set UTC time with individual fields */
  Blockly.Blocks['upy_rtc_set_utc'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('rtc'), 'VAR')
        .appendField('Set UTC time');
      this.appendDummyInput()
        .appendField('year')
        .appendField(new Blockly.FieldNumber(2024, 2000, 2099), 'YEAR')
        .appendField('month')
        .appendField(new Blockly.FieldNumber(1, 1, 12), 'MONTH')
        .appendField('mday')
        .appendField(new Blockly.FieldNumber(1, 1, 31), 'MDAY');
      this.appendDummyInput()
        .appendField('hour')
        .appendField(new Blockly.FieldNumber(0, 0, 23), 'HOUR')
        .appendField('minute')
        .appendField(new Blockly.FieldNumber(0, 0, 59), 'MINUTE')
        .appendField('second')
        .appendField(new Blockly.FieldNumber(0, 0, 59), 'SECOND')
        .appendField('microsecond')
        .appendField(new Blockly.FieldNumber(0, 0, 999999), 'USECOND');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Set RTC time: rtc.init((year, month, mday, hour, minute, second, microsecond, 0))');
    },
  };

  /** Set timezone (dropdown) → rtc.timezone('GMT0') */
  Blockly.Blocks['upy_rtc_set_tz_drop'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('rtc'), 'VAR')
        .appendField('Set timezone')
        .appendField(new Blockly.FieldDropdown(TZ_OPTIONS), 'TZ');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip("Set timezone: rtc.timezone('GMT+N')");
    },
  };

  /** Set timezone (value input) → rtc.timezone(value) */
  Blockly.Blocks['upy_rtc_set_tz_val'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('rtc'), 'VAR')
        .appendField('Set timezone');
      this.appendValueInput('TZ').setCheck('String');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setInputsInline(true);
      this.setTooltip("Set timezone from string variable: rtc.timezone(tz)");
    },
  };
}
