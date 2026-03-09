import * as Blockly from 'blockly';
import type { UPythonBoardManager } from '../boards/BoardManager';

const HUE = 160;

const BAUD_RATES: [string, string][] = [
  ['9600', '9600'], ['19200', '19200'], ['38400', '38400'],
  ['57600', '57600'], ['115200', '115200'], ['230400', '230400'],
];

const BITS_OPTIONS: Blockly.MenuGenerator = [['7', '7'], ['8', '8']];
const STOP_OPTIONS: Blockly.MenuGenerator = [['1', '1'], ['2', '2']];
const PARITY_OPTIONS: Blockly.MenuGenerator = [
  ['None', 'None'],
  ['Even (0)', '0'],
  ['Odd (1)', '1'],
];

export function registerUartBlocks(boardManager: UPythonBoardManager): void {
  const ids = () => boardManager.selected.uartIds;
  const pins = () => boardManager.selected.digitalPins;

  // ── Advanced blocks (UIFlow2-style) ──────────────────────────────────────

  /** Initialize UART with full config: baudrate, bits, parity, stop, TX pin, RX pin */
  Blockly.Blocks['upy_uart_init_full'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Init UART')
        .appendField(new Blockly.FieldDropdown(ids), 'ID')
        .appendField('baudrate')
        .appendField(new Blockly.FieldDropdown(BAUD_RATES), 'BAUD');
      this.appendDummyInput()
        .appendField('bits')
        .appendField(new Blockly.FieldDropdown(BITS_OPTIONS), 'BITS')
        .appendField('parity')
        .appendField(new Blockly.FieldDropdown(PARITY_OPTIONS), 'PARITY')
        .appendField('stop')
        .appendField(new Blockly.FieldDropdown(STOP_OPTIONS), 'STOP');
      this.appendDummyInput()
        .appendField('TX')
        .appendField(new Blockly.FieldDropdown(pins), 'TX')
        .appendField('RX')
        .appendField(new Blockly.FieldDropdown(pins), 'RX');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip(
        'Initialize UART with full config. ' +
        'Creates _uartX = UART(X, baudrate=..., bits=..., parity=..., stop=..., tx=..., rx=...).',
      );
    },
  };

  /** Reconfigure an existing UART: uart.init(...) */
  Blockly.Blocks['upy_uart_setup'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('UART')
        .appendField(new Blockly.FieldDropdown(ids), 'ID')
        .appendField('setup baudrate')
        .appendField(new Blockly.FieldDropdown(BAUD_RATES), 'BAUD');
      this.appendDummyInput()
        .appendField('bits')
        .appendField(new Blockly.FieldDropdown(BITS_OPTIONS), 'BITS')
        .appendField('parity')
        .appendField(new Blockly.FieldDropdown(PARITY_OPTIONS), 'PARITY')
        .appendField('stop')
        .appendField(new Blockly.FieldDropdown(STOP_OPTIONS), 'STOP');
      this.appendDummyInput()
        .appendField('TX')
        .appendField(new Blockly.FieldDropdown(pins), 'TX')
        .appendField('RX')
        .appendField(new Blockly.FieldDropdown(pins), 'RX');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip(
        'Reconfigure an existing UART: uart.init(baudrate=..., bits=..., parity=..., stop=..., tx=..., rx=...)',
      );
    },
  };

  /** Stop / close UART: uart.deinit() */
  Blockly.Blocks['upy_uart_deinit'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('UART')
        .appendField(new Blockly.FieldDropdown(ids), 'ID')
        .appendField('deinit');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Stop UART: uart.deinit()');
    },
  };

  /** Number of bytes available to read: uart.any() */
  Blockly.Blocks['upy_uart_any'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('UART')
        .appendField(new Blockly.FieldDropdown(ids), 'ID')
        .appendField('count of available');
      this.setOutput(true, 'Number');
      this.setTooltip('Returns number of bytes available to read: uart.any()');
    },
  };

  /** Read all available bytes: uart.read() → bytes or None */
  Blockly.Blocks['upy_uart_read_all'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('UART')
        .appendField(new Blockly.FieldDropdown(ids), 'ID')
        .appendField('read all bytes');
      this.setOutput(true, null);
      this.setTooltip('Read all available bytes: uart.read() — returns bytes or None');
    },
  };

  /** Read exactly N bytes: uart.read(N) → bytes or None */
  Blockly.Blocks['upy_uart_read_bytes'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('NBYTES')
        .appendField('UART')
        .appendField(new Blockly.FieldDropdown(ids), 'ID')
        .appendField('read')
        .setCheck('Number');
      this.appendDummyInput().appendField('bytes');
      this.setInputsInline(true);
      this.setOutput(true, null);
      this.setTooltip('Read up to N bytes: uart.read(N) — returns bytes or None');
    },
  };

  /** Read a single raw byte as integer 0–255: uart.read(1)[0] */
  Blockly.Blocks['upy_uart_read_raw'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('UART')
        .appendField(new Blockly.FieldDropdown(ids), 'ID')
        .appendField('read raw byte (0~255)');
      this.setOutput(true, 'Number');
      this.setTooltip('Read a single raw byte as integer (0–255): uart.read(1)[0]');
    },
  };

  /** Check if TX buffer is drained: uart.txdone() → bool */
  Blockly.Blocks['upy_uart_txdone'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('UART')
        .appendField(new Blockly.FieldDropdown(ids), 'ID')
        .appendField('is TX done');
      this.setOutput(true, 'Boolean');
      this.setTooltip('Returns True when transmit buffer is fully sent: uart.txdone()');
    },
  };

  /** Read into an existing buffer: uart.readinto(buf) */
  Blockly.Blocks['upy_uart_readinto'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('BUF')
        .appendField('UART')
        .appendField(new Blockly.FieldDropdown(ids), 'ID')
        .appendField('read into buf');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Read into an existing buffer variable: uart.readinto(buf)');
    },
  };

  /** Write a text string: uart.write(text) */
  Blockly.Blocks['upy_uart_write_str'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('TEXT')
        .appendField('UART')
        .appendField(new Blockly.FieldDropdown(ids), 'ID')
        .appendField('write');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip("Write a text string: uart.write(text)");
    },
  };

  /** Write string followed by CRLF: uart.write(text + '\\r\\n') */
  Blockly.Blocks['upy_uart_write_line'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('TEXT')
        .appendField('UART')
        .appendField(new Blockly.FieldDropdown(ids), 'ID')
        .appendField('write line');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip("Write text followed by CRLF line ending: uart.write(text + '\\r\\n')");
    },
  };

  /** Write a variable directly: uart.write(val) */
  Blockly.Blocks['upy_uart_write_var'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('VAL')
        .appendField('UART')
        .appendField(new Blockly.FieldDropdown(ids), 'ID')
        .appendField('write var');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Write a variable (bytes/bytearray) directly: uart.write(val)');
    },
  };

  /** Convert list/tuple to bytes and write: uart.write(bytes(val)) */
  Blockly.Blocks['upy_uart_write_bytes_var'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('VAL')
        .appendField('UART')
        .appendField(new Blockly.FieldDropdown(ids), 'ID')
        .appendField('write list or tuple');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Write a list or tuple as raw bytes: uart.write(bytes(val))');
    },
  };

  /** Write a single raw byte value: uart.write(bytes([N])) */
  Blockly.Blocks['upy_uart_write_raw'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('VAL')
        .appendField('UART')
        .appendField(new Blockly.FieldDropdown(ids), 'ID')
        .appendField('write raw data')
        .setCheck('Number');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Write a single raw byte (0–255): uart.write(bytes([N]))');
    },
  };

  /** Send a break condition on TX: uart.sendbreak() */
  Blockly.Blocks['upy_uart_sendbreak'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('UART')
        .appendField(new Blockly.FieldDropdown(ids), 'ID')
        .appendField('send break');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Send a break condition on the TX line: uart.sendbreak()');
    },
  };

  /** Wait until TX buffer is flushed: uart.flush() */
  Blockly.Blocks['upy_uart_flush'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('UART')
        .appendField(new Blockly.FieldDropdown(ids), 'ID')
        .appendField('flush');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Wait until TX buffer is fully sent: uart.flush()');
    },
  };

  // ── Legacy blocks (kept for backward compatibility) ───────────────────────

  /** Initialize a UART interface (simple: ID + baud) */
  Blockly.Blocks['upy_uart_init'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('init UART')
        .appendField(new Blockly.FieldDropdown(ids), 'ID')
        .appendField('baud')
        .appendField(new Blockly.FieldDropdown(BAUD_RATES), 'BAUD');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Initialize a UART (serial) interface at the given baud rate');
    },
  };

  /** Write data to UART, converting to string first */
  Blockly.Blocks['upy_uart_write'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('DATA')
        .appendField('UART')
        .appendField(new Blockly.FieldDropdown(ids), 'ID')
        .appendField('write');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Write data to a UART interface (converts to string with str())');
    },
  };

  /** Read a line from UART (returns bytes or None) */
  Blockly.Blocks['upy_uart_readline'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('UART')
        .appendField(new Blockly.FieldDropdown(ids), 'ID')
        .appendField('readline');
      this.setOutput(true, null);
      this.setTooltip('Read a line from a UART interface (returns bytes or None)');
    },
  };

  /** Print to default UART (equivalent to Python print()) */
  Blockly.Blocks['upy_print'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('TEXT').appendField('print');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Print a value to the default output (REPL / serial)');
    },
  };
}
