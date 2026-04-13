export interface PicoBoard {
  name: string;
  picoBoard: string;   // -DPICO_BOARD=
  picoPlatform: string; // -DPICO_PLATFORM=
}

export const PICO_BOARDS: Record<string, PicoBoard> = {
  pico: {
    name: 'Raspberry Pi Pico (RP2040)',
    picoBoard: 'pico',
    picoPlatform: 'rp2040',
  },
  pico_w: {
    name: 'Raspberry Pi Pico W (RP2040)',
    picoBoard: 'pico_w',
    picoPlatform: 'rp2040',
  },
  pico2: {
    name: 'Raspberry Pi Pico 2 (RP2350)',
    picoBoard: 'pico2',
    picoPlatform: 'rp2350-arm-s',
  },
  pico2_w: {
    name: 'Raspberry Pi Pico 2 W (RP2350+WiFi)',
    picoBoard: 'pico2_w',
    picoPlatform: 'rp2350-arm-s',
  },
};

export const DEFAULT_PICO_BOARD = 'pico2';
