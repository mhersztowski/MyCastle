import * as Blockly from 'blockly';

const HUE = '#E07B39';

export function registerSoundBlocks(): void {
  /** Value: load a sound file → Sound object */
  Blockly.Blocks['pg_load_sound'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('PATH').setCheck('String').appendField('load sound');
      this.setInputsInline(true);
      this.setOutput(true);
      this.setTooltip('Load a WAV/OGG sound file. Store in a variable inside pg_setup.');
    },
  };

  /** Statement: play a Sound object */
  Blockly.Blocks['pg_play_sound'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('SOUND').appendField('play sound');
      this.appendValueInput('LOOPS').setCheck('Number').appendField('loops');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Play a sound. loops=0 plays once, loops=-1 plays forever.');
    },
  };

  /** Statement: stop a Sound object */
  Blockly.Blocks['pg_stop_sound'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('SOUND').appendField('stop sound');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Stop a currently playing sound');
    },
  };

  /** Statement: set sound volume */
  Blockly.Blocks['pg_sound_volume'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('SOUND').appendField('set volume of');
      this.appendValueInput('VOL').setCheck('Number').appendField('to (0.0–1.0)');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Set sound volume between 0.0 (silent) and 1.0 (full)');
    },
  };

  /** Statement: load background music */
  Blockly.Blocks['pg_load_music'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('PATH').setCheck('String').appendField('load music');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Load a music file (MP3/OGG) for background playback');
    },
  };

  /** Statement: play background music */
  Blockly.Blocks['pg_play_music'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('play music  loops')
        .appendField(new Blockly.FieldNumber(-1, -1, 99, 1), 'LOOPS');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Play the loaded music. loops=-1 loops forever, loops=0 plays once.');
    },
  };

  /** Statement: stop background music */
  Blockly.Blocks['pg_stop_music'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendDummyInput().appendField('stop music');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Stop the currently playing background music');
    },
  };

  /** Statement: set music volume */
  Blockly.Blocks['pg_music_volume'] = {
    init(this: Blockly.Block) {
      this.setColour(HUE);
      this.appendValueInput('VOL').setCheck('Number').appendField('music volume (0.0–1.0)');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setTooltip('Set the music volume between 0.0 and 1.0');
    },
  };
}
