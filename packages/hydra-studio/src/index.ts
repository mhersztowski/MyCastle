/**
 * @mhersztowski/hydra-studio — środowisko projektowe frameworka Hydra.
 *
 * Wejście dla edytora: wtyczka otwierająca pliki `.hydra` w interfejsie oraz
 * cały model projektu. Panele interfejsu wystawia osobne wejście
 * `@mhersztowski/hydra-studio/panels`, bo wtyczka ładuje je leniwie — edytor
 * nie płaci za interfejs Studia, dopóki nikt nie otworzy pliku projektu.
 */

export * from './model';
export {
    createHydraStudioPlugin, HYDRA_EXTENSION,
    type ModelAccess, type StudioPluginOptions,
    // Gospodarz podłączający `runBuild` musi umieć nazwać to, co zwraca —
    // inaczej oddanie artefaktu wymaga powtórzenia kształtu wyniku u siebie.
    type BuildOutcome,
} from './plugin/plugin';
export type * from './plugin/host';
export { applyToModel, toMonacoEdits } from './plugin/monacoBridge';
export type { EditableModel, MonacoEdit, MonacoRange } from './plugin/monacoBridge';

/*
 * Kompilacja AssemblyScriptu do WebAssembly — bez `asc` w paczce, dopóki
 * nikt nie kliknie „Kompiluj": sam kompilator wchodzi importem dynamicznym.
 * Panel wystawia osobne wejście `/panels`, jak pozostałe.
 */
export {
    ENTRY_FILE, compileAssemblyScript, sha256Hex,
    type CompileDiagnostic, type CompileRequest, type CompileResult,
} from './wasm/compileAssemblyScript';
export { useAssemblyScript, type AssemblyScriptCompiler } from './wasm/useAssemblyScript';
