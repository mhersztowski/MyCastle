/**
 * Panele Studia jako osobne wejście.
 *
 * Wydzielone z wtyczki, żeby samo jej wczytanie nie ciągnęło całego
 * interfejsu razem z Material UI. Sięga się tu tylko wtedy, gdy chce się
 * osadzić panel we własnym układzie zamiast korzystać z zakładek, które
 * wtyczka otwiera sama.
 */

export { HydraStudioIde } from './HydraStudioIde';
export { HydraStudioPanel } from './HydraStudioPanel';
export { BottomPanel } from './BottomPanel';
export { MonitorPanel } from './MonitorPanel';
export { ComponentLibrary } from './ComponentLibrary';
export { SchematicCanvas } from './SchematicCanvas';
export { WasmModulePanel } from './WasmModulePanel';
export type { WasmModulePanelProps } from './WasmModulePanel';
