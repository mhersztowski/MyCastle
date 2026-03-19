/**
 * Python operator precedence constants for Pygame generator.
 */
export enum Order {
  ATOMIC = 0,
  COLLECTION = 1,
  EXPONENT = 3,
  UNARY = 5,
  MULTIPLY = 6,
  ADDITIVE = 7,
  SHIFT = 8,
  BITWISE_AND = 9,
  BITWISE_XOR = 10,
  BITWISE_OR = 11,
  COMPARISON = 12,
  LOGICAL_NOT = 13,
  LOGICAL_AND = 14,
  LOGICAL_OR = 15,
  CONDITIONAL = 16,
  LAMBDA = 17,
  NONE = 99,
}
