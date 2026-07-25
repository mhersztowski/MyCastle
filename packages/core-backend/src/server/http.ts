/**
 * server/http.ts — realizacja API backendu przez HTTP.
 *
 * Endpoint: `POST /api/server/cmd` z ciałem `{ op, args }` → `{ ok, result?, error? }`.
 * Router aplikacji (MycastleHttpServer) czyta body i woła `handleServerCmd`.
 */

import type { ServerLogic, ServerResponse } from './logic';

/** Kształt ciała żądania `POST /api/server/cmd`. */
export interface ServerCmdBody {
  op?: string;
  args?: Record<string, unknown>;
}

/** Wykonuje komendę z ciała HTTP i zwraca znormalizowaną odpowiedź (nigdy nie rzuca). */
export async function handleServerCmd(
  logic: ServerLogic,
  body: ServerCmdBody,
): Promise<ServerResponse> {
  try {
    const result = await logic.dispatch(String(body?.op ?? ''), body?.args ?? {});
    return { id: '', ok: true, result };
  } catch (err) {
    return { id: '', ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
