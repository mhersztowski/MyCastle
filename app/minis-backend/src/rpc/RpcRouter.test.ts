import { describe, it, expect, beforeEach } from 'vitest';
import { RpcRouter } from '@mhersztowski/core-backend';
import { registerHandlers } from './handlers.js';

let router: RpcRouter;

beforeEach(() => {
  router = new RpcRouter();
  registerHandlers(router);
});

describe('RpcRouter', () => {
  it('dispatches ping method', async () => {
    const result = await router.dispatch('ping', { echo: 'hi' }, {});
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ ok: true, result: { pong: true, echo: 'hi' } });
    expect((result.body as any).result.timestamp).toBeTypeOf('number');
    expect((result.body as any).result.version).toBeTypeOf('string');
  });

  it('dispatches ping without echo', async () => {
    const result = await router.dispatch('ping', {}, {});
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({ ok: true, result: { pong: true } });
  });

  it('returns 404 for unknown method', async () => {
    const result = await router.dispatch('nonexistent', {}, {});
    expect(result.statusCode).toBe(404);
    expect(result.body).toMatchObject({ ok: false, code: 'METHOD_NOT_FOUND' });
  });

  it('returns 400 for invalid input', async () => {
    const result = await router.dispatch('ping', { echo: 123 }, {});
    expect(result.statusCode).toBe(400);
    expect(result.body).toMatchObject({ ok: false, code: 'VALIDATION_ERROR' });
  });

  it('getRegisteredMethods lists all methods', () => {
    const methods = router.getRegisteredMethods();
    expect(methods.length).toBeGreaterThan(0);
    expect(methods.find(m => m.name === 'ping')).toBeDefined();
  });
});
