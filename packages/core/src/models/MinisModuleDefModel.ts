export interface MinisModuleDefModel {
  type: 'module_def';
  id: string;
  name: string;
  soc: string;
  isProgrammable: boolean;
}

export interface MinisModuleDefsModel {
  type: 'module_defs';
  moduleDefs: MinisModuleDefModel[];
}
