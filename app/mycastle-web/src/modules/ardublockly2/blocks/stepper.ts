import * as Blockly from 'blockly';
import type { BoardManager } from '../boards/BoardManager';

/** HSV hue for all Stepper blocks. */
const HUE = 80;

/** Extra state persisted for stepper_config mutation (2-pin vs 4-pin mode). */
interface StepperExtraState {
  numberOfPins: 'TWO' | 'FOUR';
}

export function registerStepperBlocks(boardManager: BoardManager): void {
  Blockly.Blocks['stepper_config'] = {
    init: function (this: Blockly.Block) {
      const dropdown = new Blockly.FieldDropdown(
        [
          ['2', 'TWO'],
          ['4', 'FOUR'],
        ],
        function (this: Blockly.FieldDropdown, option: string) {
          const block = this.getSourceBlock();
          if (block) {
            (block as any).updateShape_(option === 'FOUR');
          }
          return undefined;
        },
      );

      this.setHelpUrl('http://arduino.cc/en/Reference/StepperConstructor');
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('setup stepper')
        .appendField(new Blockly.FieldTextInput('MyStepper'), 'STEPPER_NAME')
        .appendField('motor');
      this.appendDummyInput('PINS_DROPDOWN')
        .setAlign(Blockly.inputs.Align.RIGHT)
        .appendField('number of pins')
        .appendField(dropdown, 'STEPPER_NUMBER_OF_PINS');
      this.appendDummyInput('PINS')
        .setAlign(Blockly.inputs.Align.RIGHT)
        .appendField('pin1')
        .appendField(
          new Blockly.FieldDropdown(() => boardManager.selected.digitalPins),
          'STEPPER_PIN1',
        )
        .appendField('pin2')
        .appendField(
          new Blockly.FieldDropdown(() => boardManager.selected.digitalPins),
          'STEPPER_PIN2',
        );
      this.appendValueInput('STEPPER_STEPS')
        .setCheck('Number')
        .setAlign(Blockly.inputs.Align.RIGHT)
        .appendField('steps per revolution');
      this.appendValueInput('STEPPER_SPEED')
        .setCheck('Number')
        .setAlign(Blockly.inputs.Align.RIGHT)
        .appendField('set speed (rpm) to');
      this.setTooltip(
        'Configure a stepper motor: name, pins, steps per revolution, and speed',
      );
    },

    /**
     * Serialize mutation state using modern JSON serialization.
     */
    saveExtraState: function (this: Blockly.Block): StepperExtraState {
      return {
        numberOfPins:
          (this.getFieldValue('STEPPER_NUMBER_OF_PINS') as
            | 'TWO'
            | 'FOUR') || 'TWO',
      };
    },

    /**
     * Deserialize mutation state and update block shape.
     */
    loadExtraState: function (
      this: Blockly.Block,
      state: StepperExtraState,
    ) {
      const fourPins = state.numberOfPins === 'FOUR';
      (this as any).updateShape_(fourPins);
    },

    /**
     * Add or remove pin3/pin4 fields depending on the 2-pin/4-pin selection.
     */
    updateShape_: function (this: Blockly.Block, fourPins: boolean) {
      const extraPinsExist = this.getField('STEPPER_PIN3');
      if (fourPins) {
        if (!extraPinsExist) {
          this.getInput('PINS')!
            .appendField('pin3', 'PIN3')
            .appendField(
              new Blockly.FieldDropdown(
                () => boardManager.selected.digitalPins,
              ),
              'STEPPER_PIN3',
            )
            .appendField('pin4', 'PIN4')
            .appendField(
              new Blockly.FieldDropdown(
                () => boardManager.selected.digitalPins,
              ),
              'STEPPER_PIN4',
            );
        }
      } else {
        if (extraPinsExist) {
          this.getInput('PINS')!.removeField('STEPPER_PIN4');
          this.getInput('PINS')!.removeField('PIN4');
          this.getInput('PINS')!.removeField('STEPPER_PIN3');
          this.getInput('PINS')!.removeField('PIN3');
        }
      }
    },
  };

  Blockly.Blocks['stepper_step'] = {
    init: function (this: Blockly.Block) {
      this.setHelpUrl('http://arduino.cc/en/Reference/StepperStep');
      this.setColour(HUE);
      this.appendDummyInput()
        .appendField('stepper')
        .appendField(new Blockly.FieldTextInput('MyStepper'), 'STEPPER_NAME');
      this.appendValueInput('STEPPER_STEPS').setCheck('Number');
      this.appendDummyInput().appendField('steps');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setTooltip('Turn the stepper motor a specified number of steps');
    },

    /**
     * Validate that a matching stepper_config block exists in the workspace.
     */
    onchange: function (this: Blockly.Block, event: Blockly.Events.Abstract) {
      if (!this.workspace) return;
      if (
        event.type === Blockly.Events.BLOCK_MOVE ||
        event.type === Blockly.Events.CLICK
      ) {
        return;
      }

      const instanceName = this.getFieldValue('STEPPER_NAME');
      const blocks = this.workspace.getTopBlocks(false);
      let configPresent = false;

      for (const block of blocks) {
        if (
          block.type === 'stepper_config' &&
          block.getFieldValue('STEPPER_NAME') === instanceName
        ) {
          configPresent = true;
          break;
        }
      }

      if (!configPresent) {
        this.setWarningText(
          `A stepper configuration block for "${instanceName}" is required. Add a stepper_config block with a matching name.`,
        );
      } else {
        this.setWarningText(null);
      }
    },
  };
}
