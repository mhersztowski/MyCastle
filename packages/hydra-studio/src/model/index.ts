/**
 * Model pliku .hydra — wejście pakietu.
 *
 * Ten sam kod działa w przeglądarce (wtyczka Monaco: podświetlanie błędów,
 * podpowiedzi, formularze inspektora) i w wierszu poleceń (walidacja w CI,
 * generowanie plików budowania). Dlatego nie ma tu dostępu do systemu plików
 * ani niczego zależnego od Node — wczytywanie plików należy do wywołującego.
 */

export {
    formatDiagnostics, hasErrors, didYouMean,
    type Diagnostic, type Position, type Severity,
} from './diagnostics';

export { HydraDocument, type PathSegment, type TextEdit } from './document';

export { HYDRA_SCHEMA, CAPABILITIES, MCUS } from './hydraSchema';

export {
    validate, validateAgainst, SUPPORTED_SCHEMA_VERSIONS,
} from './validate';

export {
    loadPack, missingCapabilities, collectLibDeps, collectBuildFlags, suggestPack,
    PACK_SCHEMA, PACK_PROVIDES,
    type PackManifest, type LoadedPack,
} from './pack';

export {
    toJsonSchema, hydraJsonSchema, packJsonSchema, type JsonSchema,
} from './jsonSchema';

export {
    buildPlan, MODULE_FLAGS, NATIVE_PIXEL_FORMATS,
    type BuildPlan, type TargetPlan, type PlanOptions, type NativeWindow,
} from './emit/plan';
export {
    HOST_PLATFORMS, hostPlatform, hostPlatformFor, artifactName, decodeBase64,
    detectHostPlatform, detectHostPlatformSync, webglRendererProbe,
    type HostPlatform, type HostOs, type HostArch, type DetectedHost,
    type NavigatorLike, type RendererProbe, type BuildArtifactInfo,
} from './emit/host';
export { emitCMakePresets, type PresetsOptions } from './emit/presets';
export { MCU_PROFILES, profileFor, type McuProfile } from './emit/mcu';
export {
    emitPlatformio, isGenerated, GENERATED_MARKER, GENERATED_PHRASE,
    type PlatformioOptions,
} from './emit/platformio';
export { emitCMake, type CMakeOptions } from './emit/cmake';
export {
    emitBoardHeader, boardSourceFrom, type BoardSource, type BusSource,
} from './emit/board';

export {
    formFor, entriesOf,
    type FormField, type FormSection, type FieldKind,
} from './form';

export {
    configFormFor, unsupportedFields, type ConfigSchema,
} from './configForm';

export {
    buildCatalog, filterCatalog, packForComponent, CATEGORIES,
    type CatalogEntry, type CatalogGroup, type CatalogOptions,
} from './catalog';

export {
    planInsert, applyInsert, defaultsFor,
    type InsertRequest, type InsertPlan,
} from './insert';

export {
    HCOMP_SCHEMA, PIN_KINDS, PIN_ROLES, pinFor, isOptional, drivesNet, conflictsWhenShorted,
    type ComponentDefinition, type ComponentPin, type PinKind,
} from './schematic/hcomp';

export {
    HSCH_SCHEMA, NET_CLASSES, parseNode, netOfNode,
    type Schematic, type SchematicComponent, type SchematicNet,
} from './schematic/hsch';

export { checkSchematic, type ErcOptions } from './schematic/erc';

export {
    layoutSchematic, type Layout, type LayoutNode, type LayoutEdge, type LayoutOptions,
} from './schematic/layout';

export {
    importKiCadNetlist, importEasyEda, type ImportResult,
} from './schematic/import';

export {
    assignPins, netsFromAssignments,
    type PinAssignment, type AssignmentResult, type AssignOptions,
} from './schematic/pins';

export {
    boardFromSchematic,
    type BoardFromSchematicOptions, type BoardFromSchematicResult,
} from './schematic/boardFrom';

export {
    sampleSource, sourcesFrom, timestepOf,
    type SourceModel, type SourceOptions, type SampleAt,
} from './runtime/simulation';

export {
    RingBuffer, LineSplitter, parseLogLine, parseFields, filterLogs, LOG_LEVELS,
    type LogLine, type EventLine, type LogLevel,
} from './runtime/telemetry';

export {
    SimulationClock, SPEEDS, type Speed, type ClockState,
} from './runtime/clock';

export {
    writeVcd, signalsForBuses, type VcdSignal, type VcdChange,
} from './runtime/vcd';

export {
    parseEvent, injectCommand, topicsSeen, eventsToVcd, type BusEvent,
} from './runtime/eventbus';

export {
    parseBuildOutput, parseCompilerMessages, formatUsage,
    type BuildSummary, type CompilerMessage, type MemoryUsage,
} from './runtime/buildOutput';

export {
    hilConfigFrom, checkHil, type HilConfig, type HilFixture, type HilSuite,
} from './runtime/hil';

export type { SchemaNode, ObjectNode, Field } from './schema';
