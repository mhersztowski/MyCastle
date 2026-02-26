export interface MinisDeviceModel {
  type: 'device';
  id: string;
  deviceDefId: string;
  isAssembled: boolean;
  isIot: boolean;
  sn: string;
}

export interface MinisDevicesModel {
  type: 'devices';
  devices: MinisDeviceModel[];
}
