import type * as Blockly from 'blockly';

export const TOOLBOX: Blockly.utils.toolbox.ToolboxDefinition = {
  kind: 'categoryToolbox',
  contents: [
    // ── Game structure ─────────────────────────────────────────────────
    {
      kind: 'category',
      name: '🎮 Game',
      colour: '#E05C6B',
      contents: [
        { kind: 'block', type: 'pg_setup' },
        { kind: 'block', type: 'pg_loop' },
        { kind: 'block', type: 'pg_on_events' },
      ],
    },
    { kind: 'sep' },

    // ── Window / Screen ────────────────────────────────────────────────
    {
      kind: 'category',
      name: '🪟 Window',
      colour: '#4A8FD4',
      contents: [
        {
          kind: 'block',
          type: 'pg_set_window',
          inputs: {
            WIDTH:  { shadow: { type: 'math_number', fields: { NUM: 800 } } },
            HEIGHT: { shadow: { type: 'math_number', fields: { NUM: 600 } } },
            TITLE:  { shadow: { type: 'text', fields: { TEXT: 'My Pygame Game' } } },
            FPS:    { shadow: { type: 'math_number', fields: { NUM: 60 } } },
          },
        },
        { kind: 'block', type: 'pg_screen_width' },
        { kind: 'block', type: 'pg_screen_height' },
        {
          kind: 'block', type: 'pg_set_caption',
          inputs: { TITLE: { shadow: { type: 'text', fields: { TEXT: 'My Game' } } } },
        },
        {
          kind: 'block', type: 'pg_wait',
          inputs: { MS: { shadow: { type: 'math_number', fields: { NUM: 1000 } } } },
        },
      ],
    },
    { kind: 'sep' },

    // ── Drawing ────────────────────────────────────────────────────────
    {
      kind: 'category',
      name: '🖌️ Drawing',
      colour: '#5BA58C',
      contents: [
        {
          kind: 'block', type: 'pg_fill_bg',
          inputs: { COLOR: { shadow: { type: 'pg_color_named', fields: { COLOR: 'black' } } } },
        },
        {
          kind: 'block', type: 'pg_draw_rect',
          inputs: {
            COLOR:  { shadow: { type: 'pg_color_named', fields: { COLOR: 'white' } } },
            X:      { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            Y:      { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            W:      { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            H:      { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            RADIUS: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          },
        },
        {
          kind: 'block', type: 'pg_draw_rect_outline',
          inputs: {
            COLOR:  { shadow: { type: 'pg_color_named', fields: { COLOR: 'white' } } },
            X:      { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            Y:      { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            W:      { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            H:      { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            BORDER: { shadow: { type: 'math_number', fields: { NUM: 2 } } },
          },
        },
        {
          kind: 'block', type: 'pg_draw_circle',
          inputs: {
            COLOR: { shadow: { type: 'pg_color_named', fields: { COLOR: 'red' } } },
            X:     { shadow: { type: 'math_number', fields: { NUM: 400 } } },
            Y:     { shadow: { type: 'math_number', fields: { NUM: 300 } } },
            R:     { shadow: { type: 'math_number', fields: { NUM: 50 } } },
          },
        },
        {
          kind: 'block', type: 'pg_draw_circle_outline',
          inputs: {
            COLOR: { shadow: { type: 'pg_color_named', fields: { COLOR: 'white' } } },
            X:     { shadow: { type: 'math_number', fields: { NUM: 400 } } },
            Y:     { shadow: { type: 'math_number', fields: { NUM: 300 } } },
            R:     { shadow: { type: 'math_number', fields: { NUM: 50 } } },
            WIDTH: { shadow: { type: 'math_number', fields: { NUM: 2 } } },
          },
        },
        {
          kind: 'block', type: 'pg_draw_ellipse',
          inputs: {
            COLOR: { shadow: { type: 'pg_color_named', fields: { COLOR: 'green' } } },
            X:     { shadow: { type: 'math_number', fields: { NUM: 300 } } },
            Y:     { shadow: { type: 'math_number', fields: { NUM: 200 } } },
            W:     { shadow: { type: 'math_number', fields: { NUM: 200 } } },
            H:     { shadow: { type: 'math_number', fields: { NUM: 100 } } },
          },
        },
        {
          kind: 'block', type: 'pg_draw_line',
          inputs: {
            COLOR: { shadow: { type: 'pg_color_named', fields: { COLOR: 'white' } } },
            X1:    { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            Y1:    { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            X2:    { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            Y2:    { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            WIDTH: { shadow: { type: 'math_number', fields: { NUM: 2 } } },
          },
        },
        {
          kind: 'block', type: 'pg_draw_polygon',
          inputs: { COLOR: { shadow: { type: 'pg_color_named', fields: { COLOR: 'yellow' } } } },
        },
        {
          kind: 'block', type: 'pg_make_point_list',
          inputs: {
            X1: { shadow: { type: 'math_number', fields: { NUM: 400 } } },
            Y1: { shadow: { type: 'math_number', fields: { NUM: 200 } } },
            X2: { shadow: { type: 'math_number', fields: { NUM: 300 } } },
            Y2: { shadow: { type: 'math_number', fields: { NUM: 400 } } },
            X3: { shadow: { type: 'math_number', fields: { NUM: 500 } } },
            Y3: { shadow: { type: 'math_number', fields: { NUM: 400 } } },
          },
        },
        {
          kind: 'block', type: 'pg_draw_text',
          inputs: {
            TEXT:  { shadow: { type: 'text', fields: { TEXT: 'Hello!' } } },
            SIZE:  { shadow: { type: 'math_number', fields: { NUM: 36 } } },
            COLOR: { shadow: { type: 'pg_color_named', fields: { COLOR: 'white' } } },
            X:     { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            Y:     { shadow: { type: 'math_number', fields: { NUM: 100 } } },
          },
        },
        {
          kind: 'block', type: 'pg_draw_rect_obj',
          inputs: { COLOR: { shadow: { type: 'pg_color_named', fields: { COLOR: 'blue' } } } },
        },
      ],
    },
    { kind: 'sep' },

    // ── Colors ─────────────────────────────────────────────────────────
    {
      kind: 'category',
      name: '🎨 Colors',
      colour: '#B05A7A',
      contents: [
        { kind: 'block', type: 'pg_color_named' },
        {
          kind: 'block', type: 'pg_color_rgb',
          inputs: {
            R: { shadow: { type: 'math_number', fields: { NUM: 255 } } },
            G: { shadow: { type: 'math_number', fields: { NUM: 255 } } },
            B: { shadow: { type: 'math_number', fields: { NUM: 255 } } },
          },
        },
      ],
    },
    { kind: 'sep' },

    // ── Input / Events ─────────────────────────────────────────────────
    {
      kind: 'category',
      name: '🕹️ Input',
      colour: '#D4A020',
      contents: [
        { kind: 'block', type: 'pg_key_pressed' },
        { kind: 'block', type: 'pg_mouse_pos' },
        { kind: 'block', type: 'pg_mouse_button' },
        { kind: 'sep' },
        { kind: 'block', type: 'pg_ev_is_keydown' },
        { kind: 'block', type: 'pg_ev_is_keyup' },
        { kind: 'block', type: 'pg_ev_key_is' },
        { kind: 'block', type: 'pg_ev_is_mousedown' },
        { kind: 'block', type: 'pg_ev_is_mouseup' },
        { kind: 'block', type: 'pg_ev_mousebutton_is' },
        { kind: 'block', type: 'pg_ev_mouse_x' },
        { kind: 'block', type: 'pg_ev_mouse_y' },
        { kind: 'block', type: 'pg_ev_is_text_input' },
        { kind: 'block', type: 'pg_ev_text' },
      ],
    },
    { kind: 'sep' },

    // ── Rect ───────────────────────────────────────────────────────────
    {
      kind: 'category',
      name: '📦 Rect',
      colour: '#7B68EE',
      contents: [
        {
          kind: 'block', type: 'pg_make_rect',
          inputs: {
            X: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            Y: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            W: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
            H: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
          },
        },
        {
          kind: 'block', type: 'pg_rect_move_ip',
          inputs: {
            DX: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            DY: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          },
        },
        { kind: 'block', type: 'pg_rect_clamp_ip' },
        { kind: 'block', type: 'pg_rect_attr' },
        {
          kind: 'block', type: 'pg_rect_set_attr',
          inputs: { VALUE: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
        },
        { kind: 'block', type: 'pg_rects_collide' },
        {
          kind: 'block', type: 'pg_point_in_rect',
          inputs: {
            X: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            Y: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          },
        },
      ],
    },
    { kind: 'sep' },

    // ── Images ─────────────────────────────────────────────────────────
    {
      kind: 'category',
      name: '🖼️ Images',
      colour: '#8E6BBF',
      contents: [
        {
          kind: 'block', type: 'pg_load_image',
          inputs: { PATH: { shadow: { type: 'text', fields: { TEXT: 'player.png' } } } },
        },
        {
          kind: 'block', type: 'pg_blit',
          inputs: {
            X: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            Y: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          },
        },
        { kind: 'block', type: 'pg_blit_rect' },
        {
          kind: 'block', type: 'pg_scale_image',
          inputs: {
            W: { shadow: { type: 'math_number', fields: { NUM: 64 } } },
            H: { shadow: { type: 'math_number', fields: { NUM: 64 } } },
          },
        },
        {
          kind: 'block', type: 'pg_rotate_image',
          inputs: { ANGLE: { shadow: { type: 'math_number', fields: { NUM: 45 } } } },
        },
        { kind: 'block', type: 'pg_flip_image' },
        {
          kind: 'block', type: 'pg_image_rect',
          inputs: {
            X: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            Y: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          },
        },
      ],
    },
    { kind: 'sep' },

    // ── Sound ──────────────────────────────────────────────────────────
    {
      kind: 'category',
      name: '🔊 Sound',
      colour: '#E07B39',
      contents: [
        {
          kind: 'block', type: 'pg_load_sound',
          inputs: { PATH: { shadow: { type: 'text', fields: { TEXT: 'jump.wav' } } } },
        },
        {
          kind: 'block', type: 'pg_play_sound',
          inputs: { LOOPS: { shadow: { type: 'math_number', fields: { NUM: 0 } } } },
        },
        { kind: 'block', type: 'pg_stop_sound' },
        {
          kind: 'block', type: 'pg_sound_volume',
          inputs: { VOL: { shadow: { type: 'math_number', fields: { NUM: 0.8 } } } },
        },
        { kind: 'sep' },
        {
          kind: 'block', type: 'pg_load_music',
          inputs: { PATH: { shadow: { type: 'text', fields: { TEXT: 'music.ogg' } } } },
        },
        { kind: 'block', type: 'pg_play_music' },
        { kind: 'block', type: 'pg_stop_music' },
        {
          kind: 'block', type: 'pg_music_volume',
          inputs: { VOL: { shadow: { type: 'math_number', fields: { NUM: 0.7 } } } },
        },
      ],
    },
    { kind: 'sep' },

    // ── Time ───────────────────────────────────────────────────────────
    {
      kind: 'category',
      name: '⏱️ Time',
      colour: '#D4A020',
      contents: [
        { kind: 'block', type: 'pg_get_ticks' },
        { kind: 'block', type: 'pg_delta_time' },
      ],
    },
    { kind: 'sep' },

    // ── Game Math ──────────────────────────────────────────────────────
    {
      kind: 'category',
      name: '📐 Game Math',
      colour: '#3D7EBF',
      contents: [
        {
          kind: 'block', type: 'pg_lerp',
          inputs: {
            A: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            B: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            T: { shadow: { type: 'math_number', fields: { NUM: 0.1 } } },
          },
        },
        {
          kind: 'block', type: 'pg_distance',
          inputs: {
            X1: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            Y1: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            X2: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            Y2: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
          },
        },
        {
          kind: 'block', type: 'pg_angle_to',
          inputs: {
            X1: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            Y1: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            X2: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
            Y2: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
          },
        },
        {
          kind: 'block', type: 'pg_clamp',
          inputs: {
            VAL: { shadow: { type: 'math_number', fields: { NUM: 50 } } },
            MIN: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            MAX: { shadow: { type: 'math_number', fields: { NUM: 100 } } },
          },
        },
        { kind: 'block', type: 'pg_sign' },
      ],
    },
    { kind: 'sep' },

    // ── Standard Blockly ───────────────────────────────────────────────
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
          kind: 'block', type: 'controls_repeat_ext',
          inputs: { TIMES: { shadow: { type: 'math_number', fields: { NUM: 10 } } } },
        },
        { kind: 'block', type: 'controls_whileUntil' },
        {
          kind: 'block', type: 'controls_for',
          inputs: {
            FROM: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            TO:   { shadow: { type: 'math_number', fields: { NUM: 9 } } },
            BY:   { shadow: { type: 'math_number', fields: { NUM: 1 } } },
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
          kind: 'block', type: 'math_random_int',
          inputs: {
            FROM: { shadow: { type: 'math_number', fields: { NUM: 0 } } },
            TO:   { shadow: { type: 'math_number', fields: { NUM: 100 } } },
          },
        },
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
