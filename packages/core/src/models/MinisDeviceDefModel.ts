export interface MinisDeviceDefModel {
  type: 'device_def';
  id: string;
  name: string;
  modules: string[];
}

export interface MinisDeviceDefsModel {
  type: 'device_defs';
  deviceDefs: MinisDeviceDefModel[];
}
