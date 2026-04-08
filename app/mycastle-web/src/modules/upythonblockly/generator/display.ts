import * as Blockly from 'blockly';
import type { UPythonGenerator } from './UPythonGenerator';

export function registerDisplayGenerators(gen: UPythonGenerator): void {
  gen.forBlock['upy_display_init'] = function (
    block: Blockly.Block,
    g: UPythonGenerator,
  ): string {
    g.addImport('hardware_display', 'from hardware import UserDisplay');
    const varName = (block.getField('VAR') as Blockly.FieldVariable)?.getText() || 'display';
    g.variables_.add(varName);

    const panel = block.getFieldValue('PANEL');
    const w = block.getFieldValue('W');
    const h = block.getFieldValue('H');
    const ox = block.getFieldValue('OX');
    const oy = block.getFieldValue('OY');
    const invert = block.getFieldValue('INVERT');
    const rgb = block.getFieldValue('RGB');
    const spiHost = block.getFieldValue('SPI_HOST');
    const spiFreq = block.getFieldValue('SPI_FREQ');
    const spiMode = block.getFieldValue('SPI_MODE');
    const sclk = block.getFieldValue('PIN_SCLK');
    const mosi = block.getFieldValue('PIN_MOSI');
    const miso = block.getFieldValue('PIN_MISO');
    const dc = block.getFieldValue('PIN_DC');
    const cs = block.getFieldValue('PIN_CS');
    const rst = block.getFieldValue('PIN_RST');
    const busy = block.getFieldValue('PIN_BUSY');
    const bl = block.getFieldValue('PIN_BL');
    const blInvert = block.getFieldValue('BL_INVERT');
    const blFreq = block.getFieldValue('BL_FREQ');
    const blChn = block.getFieldValue('BL_CHN');

    return (
      `${varName} = UserDisplay(panel=UserDisplay.PANEL.${panel}, ` +
      `w=${w}, h=${h}, ox=${ox}, oy=${oy}, invert=${invert}, rgb=${rgb}, ` +
      `spi_host=${spiHost}, spi_freq=${spiFreq}, spi_mode=${spiMode}, ` +
      `sclk=${sclk}, mosi=${mosi}, miso=${miso}, dc=${dc}, cs=${cs}, rst=${rst}, busy=${busy}, ` +
      `bl=${bl}, bl_invert=${blInvert}, bl_pwm_freq=${blFreq}, bl_pwm_chn=${blChn})\n`
    );
  };
}
