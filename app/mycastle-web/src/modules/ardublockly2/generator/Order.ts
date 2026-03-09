/**
 * C++ operator precedence for Arduino code generation.
 * Mirrors the ORDER_ constants from the original Ardublockly arduino.js generator.
 * Lower values bind tighter (higher precedence).
 */
export enum Order {
  /** Literal, identifier, or parenthesised expression. */
  ATOMIC = 0,
  /** expr++  expr--  ()  []  . */
  UNARY_POSTFIX = 1,
  /** -expr  !expr  ~expr  ++expr  --expr */
  UNARY_PREFIX = 2,
  /** *  /  %  ~/ */
  MULTIPLICATIVE = 3,
  /** +  - */
  ADDITIVE = 4,
  /** <<  >> */
  SHIFT = 5,
  /** >=  >  <=  < */
  RELATIONAL = 6,
  /** ==  !=  ===  !== */
  EQUALITY = 7,
  /** & */
  BITWISE_AND = 8,
  /** ^ */
  BITWISE_XOR = 9,
  /** | */
  BITWISE_OR = 10,
  /** && */
  LOGICAL_AND = 11,
  /** || */
  LOGICAL_OR = 12,
  /** expr ? expr : expr */
  CONDITIONAL = 13,
  /** =  *=  /=  ~/=  %=  +=  -=  <<=  >>=  &=  ^=  |= */
  ASSIGNMENT = 14,
  /** Weakest binding (forces parentheses around the expression). */
  NONE = 99,
}
