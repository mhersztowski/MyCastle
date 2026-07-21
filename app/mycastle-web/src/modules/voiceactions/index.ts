/**
 * Voice Actions Module - akcje głosowe (voice actions) i ich warianty Blockly.
 */

export { VoiceActionService, voiceActionService } from './VoiceActionService';
export { default as AuraBlocklyEditor } from './AuraBlocklyEditor';
export type { AuraBlocklyEditorProps } from './AuraBlocklyEditor';
export { codeFromXml, setGlobalFunctionNames, extractGlobalFunctionNames } from './blocks';
export {
  setVfsFilePicker, setVfsJsonPicker,
  listVfsFiles, getVfsTree, readVfsFile, readVfsJson, runVfsJsonQuery,
} from './vfsPicker';
export type { VfsJsonQueryConfig, VfsJsonFilter, VfsFilterOp } from './vfsPicker';
export { default as VfsFileDialog } from './VfsFileDialog';
export { default as VfsJsonQueryDialog } from './VfsJsonQueryDialog';
export { ShowComponentDialog } from './ShowComponentDialog';
export { ComponentHost } from './ComponentHost';
export { BuiltinComponentView, BUILTIN_COMPONENTS, isBuiltinComponent } from './builtinComponents';
export {
  setShowComponentPicker, getShowComponentPicker, listComponents, summarizeShowComponent,
} from './showComponentPicker';
export type { ShowComponentConfig, ComponentListItem } from './showComponentPicker';
export type {
  VoiceAction,
  VoiceActionVariant,
  VoiceActionCollection,
  WakeWord,
} from '@mhersztowski/core';
