import * as Blockly from 'blockly';

const HUE = '#aa6600';

const CHANNEL_OPTIONS: [string, string][] = [['0', '0'], ['1', '1']];
const BOOL_OPTIONS: [string, string][] = [['True', 'True'], ['False', 'False']];
const CONFIG_INT_KEYS: [string, string][] = [
  ['Data pin', 'pin_data_out'],
  ['BCK pin', 'pin_bck'],
  ['WS pin', 'pin_ws'],
];
const CONFIG_BOOL_KEYS: [string, string][] = [
  ['stereo', 'stereo'],
  ['buzzer enabled', 'buzzer'],
];
const BUZZER_OPTIONS: [string, string][] = [['Buzzer', 'True'], ['I2S', 'False']];
const FS_OPTIONS: [string, string][] = [['flash', '/flash'], ['sd', '/sd']];

export function registerSpeakerBlocks(): void {
  Blockly.Blocks['upy_spk_is_running'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('Speaker is running');
      this.setOutput(true, null);
      this.setTooltip('Speaker.isRunning()');
    },
  };

  Blockly.Blocks['upy_spk_is_enabled'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('Speaker is enabled');
      this.setOutput(true, null);
      this.setTooltip('Speaker.isEnabled()');
    },
  };

  Blockly.Blocks['upy_spk_is_playing'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('Speaker is playing');
      this.setOutput(true, null);
      this.setTooltip('Speaker.isPlaying()');
    },
  };

  Blockly.Blocks['upy_spk_begin_ret'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('Speaker begin (return True or False)');
      this.setOutput(true, null);
      this.setTooltip('Speaker.begin()');
    },
  };

  Blockly.Blocks['upy_spk_get_volume'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('Speaker get volume (return 0~255)');
      this.setOutput(true, null);
      this.setTooltip('Speaker.getVolume()');
    },
  };

  Blockly.Blocks['upy_spk_get_volume_pct'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('Speaker get volume percentage (return float)');
      this.setOutput(true, null);
      this.setTooltip('Speaker.getVolumePercentage()');
    },
  };

  Blockly.Blocks['upy_spk_get_playing_channels'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('Speaker get playing channels (return int)');
      this.setOutput(true, null);
      this.setTooltip('Speaker.getPlayingChannels()');
    },
  };

  Blockly.Blocks['upy_spk_get_channel_volume'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Speaker get channel')
        .appendField(new Blockly.FieldDropdown(CHANNEL_OPTIONS), 'CH')
        .appendField('volume (return int)');
      this.setOutput(true, null);
      this.setTooltip('Speaker.getChannelVolume(ch)');
    },
  };

  Blockly.Blocks['upy_spk_get_config_int'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Speaker get config')
        .appendField(new Blockly.FieldDropdown(CONFIG_INT_KEYS), 'KEY')
        .appendField('(return int)');
      this.setOutput(true, null);
      this.setTooltip('Speaker.config("key") → int');
    },
  };

  Blockly.Blocks['upy_spk_get_config_bool'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Speaker get config')
        .appendField(new Blockly.FieldDropdown(CONFIG_BOOL_KEYS), 'KEY')
        .appendField('(return True or False)');
      this.setOutput(true, null);
      this.setTooltip('Speaker.config("key") → bool');
    },
  };

  Blockly.Blocks['upy_spk_begin'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('Speaker begin');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Speaker.begin()');
    },
  };

  Blockly.Blocks['upy_spk_end'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('Speaker end');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Speaker.end()');
    },
  };

  Blockly.Blocks['upy_spk_stop'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('Speaker play stop');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Speaker.stop()');
    },
  };

  Blockly.Blocks['upy_spk_tone'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('Speaker play tone freq');
      this.appendValueInput('FREQ');
      this.appendDummyInput().appendField('millisecond');
      this.appendValueInput('MS');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Speaker.tone(freq, ms)');
    },
  };

  Blockly.Blocks['upy_spk_play_wav'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('Speaker play WAV (bytearray / bytes)');
      this.appendValueInput('BUF');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Speaker.playWav(buf)');
    },
  };

  Blockly.Blocks['upy_spk_play_raw'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('Speaker play PCM (bytearray / bytes)');
      this.appendValueInput('BUF');
      this.appendDummyInput().appendField('sample rate (Hz)');
      this.appendValueInput('RATE');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Speaker.playRaw(buf, rate)');
    },
  };

  Blockly.Blocks['upy_spk_play_wav_file'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Speaker play WAV file')
        .appendField(new Blockly.FieldDropdown(FS_OPTIONS), 'FS')
        .appendField(new Blockly.FieldTextInput('test.wav'), 'FILENAME');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Speaker.playWavFile(path)');
    },
  };

  Blockly.Blocks['upy_spk_set_volume'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('Speaker set volume');
      this.appendValueInput('VOL');
      this.appendDummyInput().appendField('(0 ~ 255)');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Speaker.setVolume(vol)');
    },
  };

  Blockly.Blocks['upy_spk_set_volume_pct'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('Speaker set volume');
      this.appendValueInput('PCT');
      this.appendDummyInput().appendField('%');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Speaker.setVolumePercentage(pct/100)');
    },
  };

  Blockly.Blocks['upy_spk_set_all_ch_vol'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('Speaker set all channel volume');
      this.appendValueInput('VOL');
      this.appendDummyInput().appendField('(0 ~ 255)');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Speaker.setAllChannelVolume(vol)');
    },
  };

  Blockly.Blocks['upy_spk_set_ch_vol'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Speaker set channel')
        .appendField(new Blockly.FieldDropdown(CHANNEL_OPTIONS), 'CH')
        .appendField('volume');
      this.appendValueInput('VOL');
      this.appendDummyInput().appendField('(0 ~ 255)');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Speaker.setChannelVolume(ch, vol)');
    },
  };

  Blockly.Blocks['upy_spk_config_init'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Speaker config use')
        .appendField(new Blockly.FieldDropdown(BUZZER_OPTIONS), 'BUZZER')
        .appendField('Data pin');
      this.appendValueInput('PIN');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Speaker.config(buzzer=..., pin_data_out=...)');
    },
  };

  Blockly.Blocks['upy_spk_config_set_int'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Speaker config')
        .appendField(new Blockly.FieldDropdown(CONFIG_INT_KEYS), 'KEY')
        .appendField('to');
      this.appendValueInput('VAL');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Speaker.config(key=val)');
    },
  };

  Blockly.Blocks['upy_spk_config_set_bool'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('Speaker config')
        .appendField(new Blockly.FieldDropdown(CONFIG_BOOL_KEYS), 'KEY')
        .appendField('to')
        .appendField(new Blockly.FieldDropdown(BOOL_OPTIONS), 'VAL');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Speaker.config(key=val)');
    },
  };
}
