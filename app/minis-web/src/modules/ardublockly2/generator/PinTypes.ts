/**
 * Pin usage types used to track what each pin is assigned to.
 * When the same physical pin is reserved for two different types,
 * the generator emits a warning on the offending block.
 */
export enum PinType {
  INPUT = 'INPUT',
  OUTPUT = 'OUTPUT',
  PWM = 'PWM',
  SERVO = 'SERVO',
  STEPPER = 'STEPPER',
  SERIAL = 'SERIAL',
  I2C = 'I2C/TWI',
  SPI = 'SPI',
}
