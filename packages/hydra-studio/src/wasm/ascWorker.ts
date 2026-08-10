/**
 * Kompilacja AssemblyScriptu w osobnym wątku.
 *
 * `asc` to kilka megabajtów JavaScriptu i sekunda–dwie pracy procesora przy
 * większym module. W wątku głównym oznaczałoby to zamrożony interfejs —
 * a kompiluje się po każdej zmianie, nie raz na godzinę.
 *
 * Worker nie ma tu żadnej logiki własnej: przyjmuje żądanie, woła tę samą
 * funkcję, którą sprawdzają testy w Node, i odsyła wynik. Gdyby miał własną
 * ścieżkę, testy przestałyby dotyczyć tego, co uruchamia użytkownik.
 */

import { compileAssemblyScript, type CompileRequest, type CompileResult } from './compileAssemblyScript';

export interface WorkerRequest extends CompileRequest {
    /** Numer żądania — wynik spóźnionej kompilacji trzeba umieć odrzucić. */
    id: number;
}

export interface WorkerResponse extends CompileResult {
    id: number;
}

self.onmessage = async (event: MessageEvent<WorkerRequest>) => {
    const { id, ...request } = event.data;
    const result = await compileAssemblyScript(request);

    // Bajty modułu przenosimy, zamiast kopiować: przy module rzędu
    // dziesiątek kilobajtów to bez znaczenia, ale kopia rośnie razem z nim,
    // a przenoszenie nie.
    const response: WorkerResponse = { id, ...result };
    (self as unknown as Worker).postMessage(
        response,
        result.wasm.byteLength > 0 ? [result.wasm.buffer as ArrayBuffer] : [],
    );
};
