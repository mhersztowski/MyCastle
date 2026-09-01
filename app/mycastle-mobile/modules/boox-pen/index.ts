/**
 * boox-pen — dostęp do sterownika pióra czytników Onyx Boox.
 *
 * Moduł istnieje tylko na Androidzie i tylko tam ma sens; na wszystkim innym
 * `requireOptionalNativeModule` zwraca `null`, a powłoka po prostu nie
 * ogłasza mostka stronie.
 */

import { requireOptionalNativeModule } from 'expo-modules-core';

export interface BooxPenArea {
  left: number;
  top: number;
  width: number;
  height: number;
  strokeWidth: number;
}

export interface BooxPenDescription {
  available: boolean;
  info: string;
  /** Powód ostatniego niepowodzenia sterownika — `null`, dopóki go nie było. */
  error: string | null;
}

/** Pociągnięcie jako tekst JSON — patrz komentarz w `PenController.emit`. */
export interface BooxPenStrokeEvent {
  stroke: string;
}

export interface BooxPenSubscription {
  remove(): void;
}

/**
 * Kształt opisany wprost, a nie przez `extends NativeModule`.
 *
 * Klasa bazowa niesie sygnaturę indeksową `[key: string]: any`, która zjada
 * kontrolę typów całego modułu — literówka w nazwie metody przechodziłaby
 * przez `tsc` bez słowa.
 */
interface BooxPenNativeModule {
  isAvailable(): boolean;
  describe(): BooxPenDescription;
  setArea(options: BooxPenArea): Promise<void>;
  setEnabled(enabled: boolean): Promise<void>;
  release(): Promise<void>;
  addListener(
    event: 'onStroke',
    listener: (event: BooxPenStrokeEvent) => void,
  ): BooxPenSubscription;
}

const BooxPen = requireOptionalNativeModule<BooxPenNativeModule>('BooxPen');

export default BooxPen;
