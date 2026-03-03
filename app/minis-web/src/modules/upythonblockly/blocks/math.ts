import * as Blockly from 'blockly';

/**
 * Nadpisuje standardowy blok math_arithmetic, dodając operację modulo (%).
 * Blockly v12 domyślnie ma tylko 5 operacji: +, -, *, /, ^.
 */
export function registerMathBlocks(): void {
  Blockly.Blocks['math_arithmetic'] = {
    init(this: Blockly.Block) {
      (this as any).jsonInit({
        message0: '%1 %2 %3',
        args0: [
          { type: 'input_value', name: 'A', check: 'Number' },
          {
            type: 'field_dropdown',
            name: 'OP',
            options: [
              ['%{BKY_MATH_ADDITION_SYMBOL}', 'ADD'],
              ['%{BKY_MATH_SUBTRACTION_SYMBOL}', 'MINUS'],
              ['%{BKY_MATH_MULTIPLICATION_SYMBOL}', 'MULTIPLY'],
              ['%{BKY_MATH_DIVISION_SYMBOL}', 'DIVIDE'],
              ['%{BKY_MATH_POWER_SYMBOL}', 'POWER'],
              ['%', 'MODULO'],
            ],
          },
          { type: 'input_value', name: 'B', check: 'Number' },
        ],
        inputsInline: true,
        output: 'Number',
        style: 'math_blocks',
        helpUrl: '%{BKY_MATH_ARITHMETIC_HELPURL}',
        extensions: ['math_op_tooltip'],
      });
    },
  };
}
