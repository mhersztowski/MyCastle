/**
 * sci-core — rdzeń naukowy bazy wiedzy.
 *
 * Zero UI, zero React, zero Three.js: solvery, jednostki i graf wzorów dają się
 * uruchomić w Vitest headless i w Web Workerze. Rendering jest osobno, bo model
 * nie ma prawa wiedzieć, że ktoś go rysuje.
 *
 * Droga od dokumentu do symulacji: bloki ```formula w treści → `parseFormulaBlock`
 * → `buildGraph` (kolejność obliczeń, parametry, walidacja) → `compileGraph`
 * (wykonywalny model) → `run()` (wyniki i trajektoria).
 */
export { Trajectory } from './numeric/trajectory';
export type { State, Sample, Derivative, SolveOptions, StepHook } from './numeric/trajectory';
export { rk4, euler, verlet, solve } from './numeric/solvers';
export type { SolverName, SolverOptions, Acceleration } from './numeric/solvers';

export { parseQuantity, toSI, sameDimension, formatIn, UnitError } from './units/quantity';
export type { ParsedQuantity } from './units/quantity';
export { CONSTANTS, constantValue } from './units/constants';
export type { PhysicalConstant } from './units/constants';

export { parseFormulaBlock, serializeFormulaBlock, symbolName, FORMULA_FENCE } from './formula/parseFormula';
export type { FormulaBlock, FormulaKind, FormulaIssue, FormulaEvent } from './formula/parseFormula';
export { compileExpression, compileCondition, evaluateOnce } from './formula/expression';
export { RESERVED_SYMBOLS, reservedSymbol } from './formula/reservedSymbols';
export type { ReservedSymbol } from './formula/reservedSymbols';
export type { CompiledExpression, CompiledCondition } from './formula/expression';

export { buildGraph, topologicalOrder } from './graph/formulaGraph';
export type { FormulaGraph, GraphNode, GraphIssue } from './graph/formulaGraph';
export { compileGraph, defaultValues, applyOverrides } from './graph/compileGraph';
export { suggestViews } from './graph/visualization';
export { walkthrough, knownAfter } from './graph/walkthrough';

export { parseExerciseBlock, serializeExerciseBlock, EXERCISE_FENCE } from './exercise/parseExercise';
export type { ExerciseBlock, GivenRange, AnswerKind } from './exercise/parseExercise';
export { exerciseVariant, checkNumeric, checkSymbolic } from './exercise/solveExercise';
export type { ExerciseVariant, CheckResult, CheckVerdict } from './exercise/solveExercise';
export { buildHints } from './exercise/hints';

export { defineModel } from './model/defineModel';
export type { ManualModelSpec } from './model/defineModel';
export { runScript, stripTypes, SCRIPT_API_TYPES } from './model/runScript';

export {
  computeRequest, handleWorkerMessage, modelFromSource, restoreResult,
} from './worker/protocol';
export type { ModelSource, ComputeRequest, ComputeResponse } from './worker/protocol';

export {
  heliocentric, heliocentricDistance, distanceFromEarth, geocentricLongitude,
  solveKepler, toJulianDate, centuriesSinceJ2000, KEPLER_J2000, BODIES, AU,
} from './astro/ephemeris';
export type { KeplerElements, BodyData, HeliocentricPosition } from './astro/ephemeris';
export type { ScriptApi, ScriptResult } from './model/runScript';

export {
  buildIndex, readDocument, parseFrontMatter, learningGraph,
  allExercises, exercisesFor, documentsByTag,
} from './knowledge/index';
export type {
  KnowledgeIndex, KnowledgeDocument, KnowledgeIssue, DocumentMeta, LearningEdge,
} from './knowledge/index';
export { search, layoutKnowledgeGraph, learningOrder, tagCounts, odmiana } from './knowledge/catalog';
export { exportSite, pagePath } from './knowledge/exportSite';
export type { SourceDocument, SiteFile, ExportOptions } from './knowledge/exportSite';
export { planPack } from './knowledge/packSite';
export type { PdeSpec } from './formula/parseFormula';
export {
  apply, compose, det, eigen, identity, interpolate, inverse, rank,
} from './linalg/matrix';
export type { Matrix2, Vector2, EigenPair, EigenResult } from './linalg/matrix';
export {
  applyM3, composeM3, detM3, eigenM3, identityM3, interpolateM3, inverseM3,
  kernelBasis, rankM3,
} from './linalg/matrix3';
export type { Matrix3, Vector3, EigenPair3, EigenResult3 } from './linalg/matrix3';
export { alignment, pickVector, snapToEigen } from './linalg/interaction';
export { gaussSteps, gramSchmidtSteps, isOrthonormal } from './linalg/procedures';
export type { GaussStep, GramSchmidtStep } from './linalg/procedures';
export { compileLinAlg } from './linalg/compileLinAlg';
export { compileLinAlg3 } from './linalg/compileLinAlg3';
export type { LinAlg3Model, LinAlg3Result } from './linalg/compileLinAlg3';
export type { LinAlgModel, LinAlgResult, MatrixParam, VectorParam } from './linalg/compileLinAlg';
export type { LinAlgSpec } from './formula/parseFormula';
export { latexToPython } from './validation/toPython';
export type { PythonExpression } from './validation/toPython';
export { exportScenario } from './validation/scenario';
export type { Scenario, ScenarioCheckpoint, ScenarioOptions } from './validation/scenario';
export { editableExpressions, replaceExpression } from './formula/editFormula';
export type { EditableExpression } from './formula/editFormula';
export { compileStrokes, parseStrokes, serializeStrokes } from './pen/strokes';
export type { Stroke } from './pen/strokes';
export { compilePde } from './pde/grid2d';
export type { PdeModel, PdeResult, PdeFrame } from './pde/grid2d';
export { emptyProgress, recordAttempt, dueFor, qualityOf, summarize } from './progress/schedule';
export type { Progress, ProgressItem, Quality, Attempt } from './progress/schedule';
export type { PackPlan, PackEntry } from './knowledge/packSite';
export type { SearchHit, MatchKind, GraphLayout, GraphNodePosition } from './knowledge/catalog';
export type { Hint } from './exercise/hints';
export type { WalkthroughStep } from './graph/walkthrough';
export type { ViewSpec, ViewKind } from './graph/visualization';
export type { PhenomenonModel, PhenomenonResult, ParamSchema, ObservableDef } from './graph/compileGraph';
