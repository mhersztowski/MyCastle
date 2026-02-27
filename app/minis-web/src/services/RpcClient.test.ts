import { describe, it, expect, beforeEach, vi } from 'vitest';
import { rpcClient } from './RpcClient';

vi.mock('@mhersztowski/web-client', () => ({
  getHttpUrl: () => 'http://test-host',
}));

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

describe('RpcClient', () => {
  it('calls RPC endpoint and returns typed result', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ ok: true, result: { pong: true, timestamp: 1000, version: '1.0.0' } }),
    });
    const result = await rpcClient.call('ping', {});
    expect(result.pong).toBe(true);
    expect(result.timestamp).toBe(1000);
    expect(mockFetch).toHaveBeenCalledWith('http://test-host/api/rpc/ping', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
  });

  it('passes echo parameter', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ ok: true, result: { pong: true, echo: 'hello', timestamp: 1000, version: '1.0.0' } }),
    });
    const result = await rpcClient.call('ping', { echo: 'hello' });
    expect(result.echo).toBe('hello');
  });

  it('throws on RPC error response', async () => {
    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ ok: false, error: 'Validation error', code: 'VALIDATION_ERROR' }),
    });
    await expect(rpcClient.call('ping', {})).rejects.toThrow('Validation error');
  });
});
