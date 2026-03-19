import type * as Blockly from 'blockly';
import { Order } from './Order';
import type { PygameGenerator } from './PygameGenerator';

export function registerEventsKeyboardGenerators(gen: PygameGenerator): void {
  gen.forBlock['pg_on_events'] = function (block: Blockly.Block, g: PygameGenerator): string {
    const body = g.statementToCode(block, 'DO');
    g.event_stmts_['_main'] = body;
    return '';
  };

  gen.forBlock['pg_ev_is_keydown'] = function (): [string, Order] {
    return ['_event.type == pygame.KEYDOWN', Order.COMPARISON];
  };

  gen.forBlock['pg_ev_is_keyup'] = function (): [string, Order] {
    return ['_event.type == pygame.KEYUP', Order.COMPARISON];
  };

  gen.forBlock['pg_ev_key_is'] = function (block: Blockly.Block): [string, Order] {
    const key = block.getFieldValue('KEY');
    return [`_event.key == pygame.K_${key}`, Order.COMPARISON];
  };

  gen.forBlock['pg_ev_is_mousedown'] = function (): [string, Order] {
    return ['_event.type == pygame.MOUSEBUTTONDOWN', Order.COMPARISON];
  };

  gen.forBlock['pg_ev_is_mouseup'] = function (): [string, Order] {
    return ['_event.type == pygame.MOUSEBUTTONUP', Order.COMPARISON];
  };

  gen.forBlock['pg_ev_mousebutton_is'] = function (block: Blockly.Block): [string, Order] {
    const btn = block.getFieldValue('BUTTON');
    return [`_event.button == ${btn}`, Order.COMPARISON];
  };

  gen.forBlock['pg_ev_mouse_x'] = function (): [string, Order] {
    return ['_event.pos[0]', Order.ATOMIC];
  };

  gen.forBlock['pg_ev_mouse_y'] = function (): [string, Order] {
    return ['_event.pos[1]', Order.ATOMIC];
  };

  gen.forBlock['pg_ev_is_text_input'] = function (): [string, Order] {
    return ['_event.type == pygame.TEXTINPUT', Order.COMPARISON];
  };

  gen.forBlock['pg_ev_text'] = function (): [string, Order] {
    return ['_event.text', Order.ATOMIC];
  };
}
