import * as Blockly from 'blockly';
import { Order } from './Order';
import type { UPythonGenerator } from './UPythonGenerator';

export function registerSpeakerGenerators(gen: UPythonGenerator): void {
  gen.forBlock['upy_spk_is_running'] = function (_block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    return ['Speaker.isRunning()', Order.ATOMIC];
  };

  gen.forBlock['upy_spk_is_enabled'] = function (_block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    return ['Speaker.isEnabled()', Order.ATOMIC];
  };

  gen.forBlock['upy_spk_is_playing'] = function (_block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    return ['Speaker.isPlaying()', Order.ATOMIC];
  };

  gen.forBlock['upy_spk_begin_ret'] = function (_block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    return ['Speaker.begin()', Order.ATOMIC];
  };

  gen.forBlock['upy_spk_get_volume'] = function (_block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    return ['Speaker.getVolume()', Order.ATOMIC];
  };

  gen.forBlock['upy_spk_get_volume_pct'] = function (_block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    return ['Speaker.getVolumePercentage()', Order.ATOMIC];
  };

  gen.forBlock['upy_spk_get_playing_channels'] = function (_block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    return ['Speaker.getPlayingChannels()', Order.ATOMIC];
  };

  gen.forBlock['upy_spk_get_channel_volume'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    const ch = block.getFieldValue('CH');
    return [`Speaker.getChannelVolume(${ch})`, Order.ATOMIC];
  };

  gen.forBlock['upy_spk_get_config_int'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    const key = block.getFieldValue('KEY');
    return [`Speaker.config("${key}")`, Order.ATOMIC];
  };

  gen.forBlock['upy_spk_get_config_bool'] = function (block: Blockly.Block, g: UPythonGenerator): [string, Order] {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    const key = block.getFieldValue('KEY');
    return [`Speaker.config("${key}")`, Order.ATOMIC];
  };

  gen.forBlock['upy_spk_begin'] = function (_block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    return 'Speaker.begin()\n';
  };

  gen.forBlock['upy_spk_end'] = function (_block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    return 'Speaker.end()\n';
  };

  gen.forBlock['upy_spk_stop'] = function (_block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    return 'Speaker.stop()\n';
  };

  gen.forBlock['upy_spk_tone'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    const freq = g.valueToCode(block, 'FREQ', Order.NONE) || '1000';
    const ms = g.valueToCode(block, 'MS', Order.NONE) || '50';
    return `Speaker.tone(${freq}, ${ms})\n`;
  };

  gen.forBlock['upy_spk_play_wav'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    const buf = g.valueToCode(block, 'BUF', Order.NONE) || "b''";
    return `Speaker.playWav(${buf})\n`;
  };

  gen.forBlock['upy_spk_play_raw'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    const buf = g.valueToCode(block, 'BUF', Order.NONE) || "b''";
    const rate = g.valueToCode(block, 'RATE', Order.NONE) || '0';
    return `Speaker.playRaw(${buf}, ${rate})\n`;
  };

  gen.forBlock['upy_spk_play_wav_file'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    const fs = block.getFieldValue('FS');
    const fn = block.getFieldValue('FILENAME');
    return `Speaker.playWavFile('${fs}/res/audio/${fn}')\n`;
  };

  gen.forBlock['upy_spk_set_volume'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    const vol = g.valueToCode(block, 'VOL', Order.NONE) || '128';
    return `Speaker.setVolume(${vol})\n`;
  };

  gen.forBlock['upy_spk_set_volume_pct'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    const pct = g.valueToCode(block, 'PCT', Order.NONE) || '50';
    return `Speaker.setVolumePercentage(${pct} / 100)\n`;
  };

  gen.forBlock['upy_spk_set_all_ch_vol'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    const vol = g.valueToCode(block, 'VOL', Order.NONE) || '128';
    return `Speaker.setAllChannelVolume(${vol})\n`;
  };

  gen.forBlock['upy_spk_set_ch_vol'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    const ch = block.getFieldValue('CH');
    const vol = g.valueToCode(block, 'VOL', Order.NONE) || '128';
    return `Speaker.setChannelVolume(${ch}, ${vol})\n`;
  };

  gen.forBlock['upy_spk_config_init'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    const buzzer = block.getFieldValue('BUZZER');
    const pin = g.valueToCode(block, 'PIN', Order.NONE) || '0';
    return `Speaker.config(buzzer=${buzzer}, pin_data_out=${pin})\n`;
  };

  gen.forBlock['upy_spk_config_set_int'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    const key = block.getFieldValue('KEY');
    const val = g.valueToCode(block, 'VAL', Order.NONE) || '0';
    return `Speaker.config(${key}=${val})\n`;
  };

  gen.forBlock['upy_spk_config_set_bool'] = function (block: Blockly.Block, g: UPythonGenerator): string {
    g.addImport('hardware_speaker', 'from hardware import Speaker');
    const key = block.getFieldValue('KEY');
    const val = block.getFieldValue('VAL');
    return `Speaker.config(${key}=${val})\n`;
  };
}
