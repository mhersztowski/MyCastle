/** Worker obliczeń dla podglądu — cała logika w `sci-core`. */
import { handleWorkerMessage, type ComputeRequest } from '@mhersztowski/sci-core';

self.onmessage = (event: MessageEvent<ComputeRequest>) => {
  self.postMessage(handleWorkerMessage(event.data));
};
