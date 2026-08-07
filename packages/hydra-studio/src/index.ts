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
} from './plugin/plugin';
export type * from './plugin/host';
export { applyToModel, toMonacoEdits } from './plugin/monacoBridge';
export type { EditableModel, MonacoEdit, MonacoRange } from './plugin/monacoBridge';
