/**
 * sci-blocks — bloki dokumentu bazy wiedzy.
 *
 * Pakiet mieszka poza `mycastle-web` od pierwszego dnia (raport, 4.2): zna
 * `sci-core` i React, nie zna edytora. Wpięcie do MdEditora sprowadza się do
 * rejestracji widoków bloków w jego rejestrze — patrz `registerSciBlocks`.
 */
export { SimBlock } from './SimBlock';
export { FieldBlock } from './FieldBlock';
export { HeatmapCanvas } from './HeatmapCanvas';
export { StrokeCanvas } from './StrokeCanvas';
export { MathField } from './MathField';
export { LinAlgStage } from './LinAlgStage';
export { LinAlgStage3D } from './LinAlgStage3D';
export { LinAlgBlock } from './LinAlgBlock';
export { ProcedureBlock } from './ProcedureBlock';
export type { SimBlockProps } from './SimBlock';
export { ExerciseBlock } from './ExerciseBlock';
export { ScriptBlock } from './ScriptBlock';
export type { ScriptBlockProps } from './ScriptBlock';
export { Math, symbolToLatex } from './Math';
export type { MathProps } from './Math';
export { BlockShell } from './BlockShell';
export type { BlockShellProps } from './BlockShell';
export { useModelRunner } from './useModelRunner';
export type { WorkerFactory, ModelRunnerState } from './useModelRunner';
export { ModelViews } from './ModelViews';
export { KnowledgeCatalog } from './KnowledgeCatalog';
export type { KnowledgeCatalogProps } from './KnowledgeCatalog';
export { KnowledgeGraph } from './KnowledgeGraph';
export type { KnowledgeGraphProps } from './KnowledgeGraph';
export { ReaderView, splitDocument } from './ReaderView';
export type { ReaderViewProps } from './ReaderView';
export type { ModelViewsProps } from './ModelViews';
export type { ExerciseBlockProps } from './ExerciseBlock';
export { FormulaBlockView } from './FormulaBlockView';
export type { FormulaBlockViewProps } from './FormulaBlockView';
export { Path3DCanvas } from './Path3DCanvas';
export type { Path3DCanvasProps } from './Path3DCanvas';
export { decimate, minOf, maxOf } from './sampling';
export { PlotCanvas } from './PlotCanvas';
export type { PlotCanvasProps, PlotSeries } from './PlotCanvas';
export { AngularStage } from './AngularStage';
export type { AngularStageProps } from './AngularStage';
export { XYCanvas } from './XYCanvas';
export type { XYCanvasProps } from './XYCanvas';
export { scanFormulas, buildSimSetup } from './documentModel';
export { registerSciBlocks, FORMULA_LANG, SIM_LANG, EXERCISE_LANG, SIMSCRIPT_LANG } from './register';
export type { HostBlockRenderer, HostBlockRendererProps } from './register';
export type { SimSpec, SimSetup } from './documentModel';
