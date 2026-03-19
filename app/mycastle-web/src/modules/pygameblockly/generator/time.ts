import { Order } from './Order';
import type { PygameGenerator } from './PygameGenerator';

export function registerTimeGenerators(gen: PygameGenerator): void {
  gen.forBlock['pg_get_ticks'] = function (): [string, Order] {
    return ['pygame.time.get_ticks()', Order.ATOMIC];
  };

  gen.forBlock['pg_delta_time'] = function (): [string, Order] {
    // _clock.get_time() returns ms since last tick
    return ['_clock.get_time()', Order.ATOMIC];
  };
}
