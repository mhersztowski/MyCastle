import { MOUSE } from 'three';
import type { CameraPresetName, CameraPresetConfig } from '@mhersztowski/ui-core';

export const CAMERA_PRESETS: Record<CameraPresetName, CameraPresetConfig> = {
  standard: {
    label: 'Standard',
    description: 'Left=Rotate, Middle=Dolly, Right=Pan',
    mouseButtons: {
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.DOLLY,
      RIGHT: MOUSE.PAN,
    },
  },
  blender: {
    label: 'Blender',
    description: 'Middle=Rotate, Right=Pan',
    mouseButtons: {
      LEFT: null,
      MIDDLE: MOUSE.ROTATE,
      RIGHT: MOUSE.PAN,
    },
  },
  maya: {
    label: 'Maya',
    description: 'Left=Rotate, Middle=Pan, Right=Dolly',
    mouseButtons: {
      LEFT: MOUSE.ROTATE,
      MIDDLE: MOUSE.PAN,
      RIGHT: MOUSE.DOLLY,
    },
  },
  cad: {
    label: 'CAD',
    description: 'Middle=Pan, Right=Rotate',
    mouseButtons: {
      LEFT: null,
      MIDDLE: MOUSE.PAN,
      RIGHT: MOUSE.ROTATE,
    },
  },
};
