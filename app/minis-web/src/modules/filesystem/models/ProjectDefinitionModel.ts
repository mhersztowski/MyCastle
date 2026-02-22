export interface ProjectInfoModel {
  name: string;
  version: string;
  tags: string[];
  hardwareArchitecture: string[];
  softwareArchitecture: {
    platform: string;
  };
}

export interface PDCTaskModel {
  id: string;
  title: string;
  description: string;
  order: number;
}

export interface PDCSourceFileModel {
  id: string;
  name: string;
  path: string;
  language: string;
}

export interface PDCBinaryHexModel {
  id: string;
  name: string;
  path: string;
}

export type ProjectDefinitionComponentModel =
  | { id: string; name: string; type: 'tasks'; tasks: PDCTaskModel[] }
  | { id: string; name: string; type: 'source_files'; sourceFiles: PDCSourceFileModel[] }
  | { id: string; name: string; type: 'binary_hex'; binaryHex: PDCBinaryHexModel };

export interface ProjectDefinitionModel {
  id: string;
  info: ProjectInfoModel;
  description: string;
  components: ProjectDefinitionComponentModel[];
  created: string;
  modified: string;
}

export interface ProjectDefinitionsModel {
  definitions: ProjectDefinitionModel[];
}
