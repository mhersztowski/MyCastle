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
}

export interface MinisDevicesModel {
  type: 'devices';
  devices: MinisDeviceModel[];
}
