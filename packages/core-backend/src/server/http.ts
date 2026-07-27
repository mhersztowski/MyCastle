/**
 * server/http.ts — realizacja API backendu przez HTTP.
 *
 * Endpointy:
 *   • `POST /api/server/cmd` z ciałem `{ op, args }` → `{ ok, result?, error? }`,
 *   • `ANY  /api/server/ep/{path}` → żądanie przekazane skryptowi, który zarejestrował
 *     tę ścieżkę przez `http_add_endpoint` (patrz `handleEndpointCall`).
 * Router aplikacji (MycastleHttpServer) czyta body i woła odpowiednią funkcję.
 */

import {
  HttpEndpointError,
  type ServerLogic,
  type ServerResponse,
  type DispatchContext,
  type HttpEndpointResponse,
} from './logic';

/** Kształt ciała żądania `POST /api/server/cmd`. */
export interface ServerCmdBody {
  op?: string;
  args?: Record<string, unknown>;
}

/**
 * Wykonuje komendę z ciała HTTP i zwraca znormalizowaną odpowiedź (nigdy nie rzuca).
 * `ctx.owner` powinien pochodzić ze zweryfikowanego JWT (autorytatywny dla email).
 */
export async function handleServerCmd(
  logic: ServerLogic,
  body: ServerCmdBody,
  ctx: DispatchContext = {},
): Promise<ServerResponse> {
  try {
    const result = await logic.dispatch(String(body?.op ?? ''), body?.args ?? {}, ctx);
    return { id: '', ok: true, result };
  } catch (err) {
    return { id: '', ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Wynik wywołania endpointu skryptu — gotowy do odesłania przez router HTTP. */
export interface EndpointCallResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * Wykonuje żądanie do endpointu zarejestrowanego przez skrypt (`http_add_endpoint`).
 *
 * Brak `ctx.owner` oznacza wywołanie NIEUWIERZYTELNIONE — wtedy sięgamy wyłącznie
 * po endpointy zarejestrowane z `{ public: true }` (webhooki usług, które nie
 * potrafią wysłać JWT). Nigdy nie rzuca — błędy zamienia na status HTTP:
 * 404 (brak endpointu), 429 (limit tempa), 504 (skrypt milczy), 500 (callback zgłosił błąd).
 */
export async function handleEndpointCall(
  logic: ServerLogic,
  req: {
    method: string;
    /** Ścieżka BEZ prefiksu `/api/server/ep/`. */
    path: string;
    query?: Record<string, string>;
    headers?: Record<string, string>;
    body?: unknown;
  },
  ctx: DispatchContext = {},
): Promise<EndpointCallResult> {
  try {
    const res: HttpEndpointResponse = ctx.owner
      ? await logic.callHttpEndpoint(ctx.owner, req)
      : await logic.callPublicHttpEndpoint(req);
    return { status: res.status, headers: res.headers ?? {}, body: res.body };
  } catch (err) {
    const status = err instanceof HttpEndpointError ? err.status : 500;
    return { status, headers: {}, body: { error: err instanceof Error ? err.message : String(err) } };
  }
}
