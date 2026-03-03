/**
 * Python operator precedence constants for use by block generators.
 * Lower numbers bind tighter (higher precedence).
 * Reference: https://docs.python.org/3/reference/expressions.html#operator-precedence
 */
export enum Order {
  ATOMIC = 0,        // Literals, identifiers, parenthesized expressions
  COLLECTION = 1,    // {}, [], ()
  EXPONENT = 3,      // **
  UNARY = 5,         // +x, -x, ~x, not x
  MULTIPLY = 6,      // *, @, /, //, %
  ADDITIVE = 7,      // +, -
  SHIFT = 8,         // <<, >>
  BITWISE_AND = 9,   // &
  BITWISE_XOR = 10,  // ^
  BITWISE_OR = 11,   // |
  COMPARISON = 12,   // in, not in, is, is not, <, <=, >, >=, !=, ==
  LOGICAL_NOT = 13,  // not
  LOGICAL_AND = 14,  // and
  LOGICAL_OR = 15,   // or
  CONDITIONAL = 16,  // x if c else y
  LAMBDA = 17,       // lambda
  NONE = 99,         // Lowest precedence (commas, function args)
}
