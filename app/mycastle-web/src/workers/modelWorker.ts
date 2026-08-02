/**
 * modelWorker.ts — obliczenia modeli poza wątkiem interfejsu.
 *
 * Plik jest celowo jednolinijkowy: cała logika mieszka w `sci-core`, gdzie da
 * się ją sprawdzić testem bez przeglądarki. Tutaj zostaje tylko to, czego w
 * pakiecie być nie może — powiązanie z bundlerem hosta.
 */
import { handleWorkerMessage, type ComputeRequest } from '@mhersztowski/sci-core';

self.onmessage = (event: MessageEvent<ComputeRequest>) => {
  self.postMessage(handleWorkerMessage(event.data));
};
