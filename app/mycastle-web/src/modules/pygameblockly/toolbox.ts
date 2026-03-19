import type * as Blockly from 'blockly';

export const TOOLBOX: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: 'Game',
      colour: '#E05C6B',
      contents: [
        { kind: 'block', type: 'pg_setup' },
        { kind: 'block', type: 'pg_loop' },
      ],
    },
    { kind: 'sep' },
    {
      kind: 'category',
      name: 'Window',
      colour: '#4A8FD4',
      contents: [
        {
          kind: 'block',
          type: 'pg_set_window',
          inputs: {
            WIDTH: { shadow: { type: 'math_number', fields: { NUM: 800 } } },
            HEIGHT: { shadow: { type: 'math_number', fields: { NUM: 600 } } },
            TITLE: { shadow: { type: 'text', fields: { TEXT: 'My Pygame Game' } } },
            FPS: { shadow: { type: 'math_number', fields: { NUM: 60 } } },
          },
        },
      ],
    },
    { kind: 'sep' },
    {
      kind: 'category',
      name: 'Drawing',
      colour: '#5BA58C',
      contents: [
        {
          kind: 'block',
          type: 'pg_fill_bg',
          inputs: {
            COLOR: { shadow: { type: 'pg_color_named', fields: { COLOR: 'black' } } },
          },
        },
        {
          kind: 'block',
          type: 'pg_draw_rect',
          inputs: {
            COLOR: { shadow: { type: 'pg_color_named', fields: { COLOR: 'white' } } },
            X: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            Y: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            W: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            H: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            RADIUS: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          },
        },
        {
          kind: 'block',
          type: 'pg_draw_circle',
          inputs: {
            COLOR: { shadow: { type: 'pg_color_named', fields: { COLOR: 'red' } } },
            X: { shadow: { type: 'math_number', fields: { NUM: 400 } } },
            Y: { shadow: { type: 'math_number', fields: { NUM: 300 } } },
            R: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
          },
        },
        {
          kind: 'block',
          type: 'pg_draw_line',
          inputs: {
            COLOR: { shadow: { type: 'pg_color_named', fields: { COLOR: 'white' } } },
            X1: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            Y1: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            X2: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            Y2: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            WIDTH: { shadow: { type: 'math_number', fields: { NUM: 2 } } },
          },
        },
        {
          kind: 'block',
          type: 'pg_draw_text',
          inputs: {
            TEXT: { shadow: { type: 'text', fields: { TEXT: 'Hello Pygame!' } } },
            SIZE: { shadow: { type: 'math_number', fields: { NUM: 36 } } },
            COLOR: { shadow: { type: 'pg_color_named', fields: { COLOR: 'white' } } },
            X: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            Y: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
          },
        },
      ],
    },
    { kind: 'sep' },
    {
      kind: 'category',
      name: 'Colors',
      colour: '#B05A7A',
      contents: [
        { kind: 'block', type: 'pg_color_named' },
        {
          kind: 'block',
          type: 'pg_color_rgb',
          inputs: {
            R: { shadow: { type: 'math_number', fields: { NUM: 255 } } },
            G: { shadow: { type: 'math_number', fields: { NUM: 255 } } },
            B: { shadow: { type: 'math_number', fields: { NUM: 255 } } },
          },
        },
      ],
    },
    { kind: 'sep' },
    {
      kind: 'category',
      name: 'Input',
      colour: '#D4A020',
      contents: [
        { kind: 'block', type: 'pg_key_pressed' },
        { kind: 'block', type: 'pg_mouse_pos' },
        { kind: 'block', type: 'pg_mouse_button' },
      ],
    },
    {
      kind: 'category',
      name: 'Time',
      colour: '#D4A020',
      contents: [
        { kind: 'block', type: 'pg_get_ticks' },
        { kind: 'block', type: 'pg_delta_time' },
      ],
    },
    { kind: 'sep' },
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
          inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: 10 } } } },
        },
        { kind: 'block', type: 'controls_whileUntil' },
        {
          kind: 'block',
          type: 'controls_for',
          inputs: {
            FROM: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            TO: { shadow: { type: 'math_number', fields: { NUM: 9 } } },
            BY: { shadow: { type: 'math_number', fields: { NUM: 1 } } },
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
        { kind: 'block', type: 'math_round' },
        {
          kind: 'block',
          type: 'math_random_int',
          inputs: {
            FROM: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            TO: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
          },
        },
        { kind: 'block', type: 'math_constrain' },
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
        { kind: 'block', type: 'text_length' },
        { kind: 'block', type: 'text_changeCase' },
        { kind: 'block', type: 'text_print' },
      ],
    },
    { kind: 'sep' },
    {
      kind: 'category',
      name: 'Variables',
      categorystyle: 'variable_category',
      custom: 'VARIABLE',
    },
    {
      kind: 'category',
      name: 'Functions',
      categorystyle: 'procedure_category',
      custom: 'PROCEDURE',
    },
  ],
};
