/**
 * JSON toolbox definition for the ArduBlockly workspace.
 * Mirrors the original XML toolbox from the old ArduBlockly module.
 */
export const TOOLBOX: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'Logic',
      categorystyle: 'logic_category',
      contents: [
        { kind: 'block', type: 'controls_if' },
        { kind: 'block', type: 'logic_compare' },
        { kind: 'block', type: 'logic_operation' },
        { kind: 'block', type: 'logic_negate' },
        { kind: 'block', type: 'logic_boolean' },
        { kind: 'block', type: 'logic_null' },
        { kind: 'block', type: 'logic_ternary' },
      ],
    },
    { kind: 'sep' },
    {
      kind: 'category',
      name: 'Loops',
      categorystyle: 'loop_category',
      contents: [
        {
          kind: 'block',
          type: 'controls_repeat_ext',
          inputs: {
            TIMES: {
              shadow: { type: 'math_number', fields: { NUM: 10 } },
            },
          },
        },
        { kind: 'block', type: 'controls_whileUntil' },
        {
          kind: 'block',
          type: 'controls_for',
          inputs: {
            FROM: {
              shadow: { type: 'math_number', fields: { NUM: 1 } },
            },
            TO: {
              shadow: { type: 'math_number', fields: { NUM: 10 } },
            },
            BY: {
              shadow: { type: 'math_number', fields: { NUM: 1 } },
            },
          },
        },
        { kind: 'block', type: 'controls_flow_statements' },
      ],
    },
    { kind: 'sep' },
    {
      kind: 'category',
      name: 'Math',
      categorystyle: 'math_category',
      contents: [
        { kind: 'block', type: 'math_number' },
        { kind: 'block', type: 'math_arithmetic' },
        { kind: 'block', type: 'math_single' },
        { kind: 'block', type: 'math_trig' },
        { kind: 'block', type: 'math_constant' },
        { kind: 'block', type: 'math_number_property' },
        {
          kind: 'block',
          type: 'math_change',
          inputs: {
            DELTA: {
              shadow: { type: 'math_number', fields: { NUM: 1 } },
            },
          },
        },
        { kind: 'block', type: 'math_round' },
        { kind: 'block', type: 'math_modulo' },
        {
          kind: 'block',
          type: 'math_constrain',
          inputs: {
            LOW: {
              shadow: { type: 'math_number', fields: { NUM: 1 } },
            },
            HIGH: {
              shadow: { type: 'math_number', fields: { NUM: 100 } },
            },
          },
        },
        {
          kind: 'block',
          type: 'math_random_int',
          inputs: {
            FROM: {
              shadow: { type: 'math_number', fields: { NUM: 1 } },
            },
            TO: {
              shadow: { type: 'math_number', fields: { NUM: 100 } },
            },
          },
        },
        { kind: 'block', type: 'math_random_float' },
        { kind: 'block', type: 'base_map' },
      ],
    },
    { kind: 'sep' },
    {
      kind: 'category',
      name: 'Text',
      categorystyle: 'text_category',
      contents: [
        { kind: 'block', type: 'text' },
        { kind: 'block', type: 'text_join' },
        {
          kind: 'block',
          type: 'text_append',
          inputs: {
            TEXT: { shadow: { type: 'text' } },
          },
        },
        { kind: 'block', type: 'text_length' },
        { kind: 'block', type: 'text_isEmpty' },
      ],
    },
    { kind: 'sep' },
    {
      kind: 'category',
      name: 'Variables',
      categorystyle: 'variable_category',
      contents: [
        { kind: 'block', type: 'variables_get' },
        { kind: 'block', type: 'variables_set' },
        {
          kind: 'block',
          type: 'variables_set',
          inputs: {
            VALUE: { block: { type: 'variables_set_type' } },
          },
        },
        { kind: 'block', type: 'variables_set_type' },
      ],
    },
    { kind: 'sep' },
    {
      kind: 'category',
      name: 'Functions',
      categorystyle: 'procedure_category',
      custom: 'PROCEDURE',
    },
    { kind: 'sep' },
    {
      kind: 'category',
      name: 'Input/Output',
      colour: '250',
      contents: [
        {
          kind: 'block',
          type: 'io_digitalwrite',
          inputs: {
            STATE: { shadow: { type: 'io_highlow' } },
          },
        },
        { kind: 'block', type: 'io_digitalread' },
        {
          kind: 'block',
          type: 'io_builtin_led',
          inputs: {
            STATE: { shadow: { type: 'io_highlow' } },
          },
        },
        { kind: 'block', type: 'io_analogwrite' },
        { kind: 'block', type: 'io_analogread' },
        { kind: 'block', type: 'io_highlow' },
        {
          kind: 'block',
          type: 'io_pulsein',
          inputs: {
            PULSETYPE: { shadow: { type: 'io_highlow' } },
          },
        },
        {
          kind: 'block',
          type: 'io_pulsetimeout',
          inputs: {
            PULSETYPE: { shadow: { type: 'io_highlow' } },
            TIMEOUT: {
              shadow: { type: 'math_number', fields: { NUM: 100 } },
            },
          },
        },
      ],
    },
    { kind: 'sep' },
    {
      kind: 'category',
      name: 'Time',
      colour: '140',
      contents: [
        {
          kind: 'block',
          type: 'time_delay',
          inputs: {
            DELAY_TIME_MILI: {
              shadow: { type: 'math_number', fields: { NUM: 1000 } },
            },
          },
        },
        {
          kind: 'block',
          type: 'time_delaymicros',
          inputs: {
            DELAY_TIME_MICRO: {
              shadow: { type: 'math_number', fields: { NUM: 100 } },
            },
          },
        },
        { kind: 'block', type: 'time_millis' },
        { kind: 'block', type: 'time_micros' },
        { kind: 'block', type: 'infinite_loop' },
      ],
    },
    { kind: 'sep' },
    {
      kind: 'category',
      name: 'Audio',
      colour: '250',
      contents: [
        {
          kind: 'block',
          type: 'io_tone',
          fields: { TONEPIN: '0' },
          inputs: {
            FREQUENCY: {
              shadow: { type: 'math_number', fields: { NUM: 220 } },
            },
          },
        },
        { kind: 'block', type: 'io_notone' },
      ],
    },
    { kind: 'sep' },
    {
      kind: 'category',
      name: 'Motors',
      colour: '60',
      contents: [
        {
          kind: 'block',
          type: 'servo_write',
          inputs: {
            SERVO_ANGLE: {
              shadow: { type: 'math_number', fields: { NUM: 90 } },
            },
          },
        },
        { kind: 'block', type: 'servo_read' },
        {
          kind: 'block',
          type: 'stepper_config',
          fields: {
            STEPPER_NUMBER_OF_PINS: '2',
            STEPPER_PIN1: '1',
            STEPPER_PIN2: '2',
          },
          inputs: {
            STEPPER_STEPS: {
              shadow: { type: 'math_number', fields: { NUM: 100 } },
            },
            STEPPER_SPEED: {
              shadow: { type: 'math_number', fields: { NUM: 10 } },
            },
          },
        },
        {
          kind: 'block',
          type: 'stepper_step',
          inputs: {
            STEPPER_STEPS: {
              shadow: { type: 'math_number', fields: { NUM: 10 } },
            },
          },
        },
      ],
    },
    { kind: 'sep' },
    {
      kind: 'category',
      name: 'Comms',
      colour: '160',
      contents: [
        { kind: 'block', type: 'serial_setup' },
        { kind: 'block', type: 'serial_print' },
        {
          kind: 'block',
          type: 'text_prompt_ext',
          inputs: {
            TEXT: { shadow: { type: 'text' } },
          },
        },
        { kind: 'block', type: 'spi_setup' },
        { kind: 'block', type: 'spi_transfer' },
        { kind: 'block', type: 'spi_transfer_return' },
      ],
    },
  ],
};

// Import needed for type only — actual Blockly import is done by the consumer
import type * as Blockly from 'blockly';
