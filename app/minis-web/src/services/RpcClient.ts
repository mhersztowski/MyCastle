import { getHttpUrl } from '@mhersztowski/web-client';
import type { z } from 'zod';
import type { RpcResponse, RpcErrorResponse, RpcMethodRegistry, RpcMethodName } from '@mhersztowski/core';

class RpcClient {
  private getBaseUrl(): string {
    return getHttpUrl();
  }

  async call<TName extends RpcMethodName>(
    method: TName,
    input: z.infer<RpcMethodRegistry[TName]['input']>,
  ): Promise<z.infer<RpcMethodRegistry[TName]['output']>> {
    const res = await fetch(`${this.getBaseUrl()}/api/rpc/${String(method)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });

    const data = await res.json() as RpcResponse | RpcErrorResponse;

    if (!data.ok) {
      throw new Error((data as RpcErrorResponse).error || `RPC call failed: ${String(method)}`);
    }

    return (data as RpcResponse).result as z.infer<RpcMethodRegistry[TName]['output']>;
  }
}

export const rpcClient = new RpcClient();
