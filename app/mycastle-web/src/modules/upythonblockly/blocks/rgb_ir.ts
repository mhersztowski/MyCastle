import * as Blockly from 'blockly';

const HUE_RGB = '#cc3388';
const HUE_IR = '#884400';

/** Common LED colors as (label, hex-string) pairs. */
export const COLOUR_OPTIONS: Array<[string, string]> = [
  ['red', '0xff0000'],
  ['green', '0x00ff00'],
  ['blue', '0x0000ff'],
  ['yellow', '0xffff00'],
  ['cyan', '0x00ffff'],
  ['magenta', '0xff00ff'],
  ['white', '0xffffff'],
  ['orange', '0xff8000'],
  ['purple', '0x6600cc'],
  ['pink', '0xff0080'],
  ['off', '0x000000'],
];

const MODE_OPTIONS: Array<[string, string]> = [
  ['Palette', 'PALETTE'],
  ['RGB', 'RGB'],
  ['HSV', 'HSV'],
  ['Hex', 'HEX'],
];

// ---------------------------------------------------------------------------
// Color preview helpers
// ---------------------------------------------------------------------------

function rgbToCss(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('');
}

function hsvToCss(h: number, s: number, v: number): string {
  s /= 100; v /= 100;
  if (s === 0) { const c = Math.round(v * 255); return rgbToCss(c, c, c); }
  h /= 60;
  const i = Math.floor(h) % 6;
  const f = h - Math.floor(h);
  const p = v * (1 - s), q = v * (1 - s * f), t = v * (1 - s * (1 - f));
  const [r, g, b] = [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i];
  return rgbToCss(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
}

function computeColourCss(block: Blockly.Block): string {
  const mode = block.getFieldValue('MODE') ?? 'PALETTE';
  switch (mode) {
    case 'RGB':
      return rgbToCss(
        parseInt(block.getFieldValue('R') || '0'),
        parseInt(block.getFieldValue('G') || '0'),
        parseInt(block.getFieldValue('B') || '0'),
      );
    case 'HSV':
      return hsvToCss(
        parseFloat(block.getFieldValue('H') || '0'),
        parseFloat(block.getFieldValue('S') || '100'),
        parseFloat(block.getFieldValue('V') || '100'),
      );
    case 'HEX': {
      const hex = (block.getFieldValue('HEX') || 'FF0000').replace(/^#/, '').padStart(6, '0');
      return '#' + hex;
    }
    default: { // PALETTE: value is like '0xff0000'
      const n = Number(block.getFieldValue('COLOR') ?? '0xff0000');
      return '#' + n.toString(16).padStart(6, '0');
    }
  }
}

function colourToSvgSrc(css: string): string {
  const fill = css.replace('#', '%23');
  return `data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='18' height='14'><rect x='1' y='1' width='16' height='12' rx='2' fill='${fill}' stroke='%23fff' stroke-width='1'/></svg>`;
}

function updateUiColorPreview(block: Blockly.Block): void {
  const field = block.getField('PREVIEW');
  if (field) field.setValue(colourToSvgSrc(computeColourCss(block)));
}

/** Rebuild the dynamic part of a upy_ui_color block after the MODE field changes. */
function updateUiColorShape(block: Blockly.Block, mode: string): void {
  if (block.getInput('DYNAMIC')) block.removeInput('DYNAMIC');
  const inp = block.appendDummyInput('DYNAMIC');
  switch (mode) {
    case 'RGB':
      inp
        .appendField('R').appendField(new Blockly.FieldNumber(255, 0, 255), 'R')
        .appendField('G').appendField(new Blockly.FieldNumber(0, 0, 255), 'G')
        .appendField('B').appendField(new Blockly.FieldNumber(0, 0, 255), 'B');
      break;
    case 'HSV':
      inp
        .appendField('H').appendField(new Blockly.FieldNumber(0, 0, 360), 'H')
        .appendField('S%').appendField(new Blockly.FieldNumber(100, 0, 100), 'S')
        .appendField('V%').appendField(new Blockly.FieldNumber(100, 0, 100), 'V');
      break;
    case 'HEX':
      inp.appendField('#').appendField(new Blockly.FieldTextInput('FF0000'), 'HEX');
      break;
    default: // PALETTE
      inp.appendField(new Blockly.FieldDropdown(COLOUR_OPTIONS), 'COLOR');
  }
}

export function registerRgbIrBlocks(): void {
  /** Color selector value block — Palette / RGB / HSV / Hex */
  Blockly.Blocks['upy_ui_color'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_RGB);
      this.appendDummyInput('MODE_ROW')
        .appendField('Color')
        .appendField(new Blockly.FieldDropdown(MODE_OPTIONS), 'MODE')
        .appendField(new Blockly.FieldImage(colourToSvgSrc('#ff0000'), 18, 14, ''), 'PREVIEW');
      this.setOutput(true, 'Number');
      this.setInputsInline(true);
      this.setTooltip('Color value (0xRRGGBB) — select mode: Palette, RGB, HSV or Hex');
      updateUiColorShape(this, 'PALETTE');
      this.setOnChange((e: Blockly.Events.Abstract) => {
        const ce = e as unknown as { blockId?: string; element?: string; name?: string; newValue?: string };
        if (ce.blockId !== this.id || ce.element !== 'field') return;
        if (ce.name === 'MODE') updateUiColorShape(this, ce.newValue ?? 'PALETTE');
        updateUiColorPreview(this);
      });
    },
  };

  /** Initialize RGB LED object */
  Blockly.Blocks['upy_rgb_init'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_RGB);
      this.appendDummyInput()
        .appendField('init RGB')
        .appendField(new Blockly.FieldVariable('rgb'), 'VAR');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Initialize RGB LED: rgb = RGB()');
    },
  };

  /** Set single LED by index */
  Blockly.Blocks['upy_rgb_set_color'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_RGB);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('rgb'), 'VAR')
        .appendField('set index');
      this.appendValueInput('IDX');
      this.appendDummyInput().appendField('color');
      this.appendValueInput('COLOR');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(true);
      this.setTooltip('Set LED at index to color: rgb.set_color(idx, color)');
    },
  };

  /** Fill all LEDs with one color */
  Blockly.Blocks['upy_rgb_fill_color'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_RGB);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('rgb'), 'VAR')
        .appendField('fill color');
      this.appendValueInput('COLOR');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(true);
      this.setTooltip('Set all LEDs to color: rgb.fill_color(color)');
    },
  };

  /** Set brightness 0-100 */
  Blockly.Blocks['upy_rgb_set_brightness'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_RGB);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('rgb'), 'VAR')
        .appendField('set brightness');
      this.appendValueInput('BRIGHTNESS');
      this.appendDummyInput().appendField('% (0~100)');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(true);
      this.setTooltip('Set RGB brightness (0-100%): rgb.set_brightness(n)');
    },
  };

  /** Initialize IR transmitter */
  Blockly.Blocks['upy_ir_init'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_IR);
      this.appendDummyInput()
        .appendField('init IR')
        .appendField(new Blockly.FieldVariable('ir'), 'VAR');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Initialize IR transmitter: ir = IR()');
    },
  };

  /** Send NEC IR frame */
  Blockly.Blocks['upy_ir_send'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE_IR);
      this.appendDummyInput()
        .appendField(new Blockly.FieldVariable('ir'), 'VAR')
        .appendField('send addr');
      this.appendValueInput('ADDR');
      this.appendDummyInput().appendField('(0~255) data');
      this.appendValueInput('DATA');
      this.appendDummyInput().appendField('(0~255)');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setInputsInline(true);
      this.setTooltip('Send NEC IR frame: ir.tx(addr, data)');
    },
  };
}
