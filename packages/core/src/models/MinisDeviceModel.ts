export interface MinisDeviceBuild {
  platform: string;  // e.g. 'arduino', 'cmake', 'platformio'
  fqbn?: string;     // e.g. 'esp32:esp32:esp32s3'
  version?: string;
  at: number;        // unix ms
  success: boolean;
  projectId?: string;
  sketchName?: string;
}

export interface MinisDeviceModel {
  type: 'device';
  id: string;
  name: string;
  deviceDefId: string;
  isAssembled: boolean;
  isIot: boolean;
  sn: string;
  description?: string;
  localizationId?: string;
  lastBuild?: MinisDeviceBuild;
}

export interface MinisDevicesModel {
  type: 'devices';
  devices: MinisDeviceModel[];
}
