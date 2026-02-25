import { AutomateSandbox } from './AutomateSandbox';
import { AutomateSystemApiInterface } from './BackendSystemApi';

function createMockApi(): AutomateSystemApiInterface {
  return {
    file: {
      read: vi.fn(),
      write: vi.fn(),
      list: vi.fn(),
    },
    data: {
      getPersons: vi.fn().mockReturnValue([]),
      getPersonById: vi.fn(),
      getTasks: vi.fn().mockReturnValue([]),
      getTaskById: vi.fn(),
      getProjects: vi.fn().mockReturnValue([]),
      getProjectById: vi.fn(),
      getShoppingLists: vi.fn().mockReturnValue([]),
      getShoppingListById: vi.fn(),
    },
    variables: {
      get: vi.fn(),
      set: vi.fn(),
      getAll: vi.fn().mockReturnValue({}),
    },
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    },
    notify: vi.fn(),
    utils: {
      uuid: vi.fn().mockReturnValue('mock-uuid'),
      dayjs: vi.fn(),
      sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
    },
    ai: {
      chat: vi.fn(),
      chatVision: vi.fn(),
      chatMessages: vi.fn(),
      isConfigured: vi.fn().mockReturnValue(false),
    },
    speech: {
      say: vi.fn(),
      stop: vi.fn(),
      isTtsConfigured: vi.fn().mockReturnValue(false),
      isSttConfigured: vi.fn().mockReturnValue(false),
    },
    shopping: {
      createList: vi.fn(),
      addItem: vi.fn(),
      checkItem: vi.fn(),
      uncheckItem: vi.fn(),
      removeItem: vi.fn(),
      completeList: vi.fn(),
    },
    logs: [],
    notifications: [],
  };
}

describe('AutomateSandbox', () => {
  let api: AutomateSystemApiInterface;

  beforeEach(() => {
    api = createMockApi();
  });

  it('executes simple script and returns result', async () => {
    const result = await AutomateSandbox.execute('return 42', api, {}, {});
    expect(result).toBe(42);
  });

  it('accesses input object as inp', async () => {
    const result = await AutomateSandbox.execute(
      'return inp.value',
      api,
      { value: 'hello' },
      {},
    );
    expect(result).toBe('hello');
  });

  it('accesses variables as vars', async () => {
    const result = await AutomateSandbox.execute(
      'return vars.x',
      api,
      {},
      { x: 10 },
    );
    expect(result).toBe(10);
  });

  it('accesses api object', async () => {
    const result = await AutomateSandbox.execute(
      "api.log.info('test'); return true",
      api,
      {},
      {},
    );
    expect(result).toBe(true);
    expect(api.log.info).toHaveBeenCalledWith('test');
  });

  it('handles async scripts', async () => {
    const result = await AutomateSandbox.execute(
      'await api.utils.sleep(10); return "done"',
      api,
      {},
      {},
    );
    expect(result).toBe('done');
  });

  it('times out after specified duration', async () => {
    // Use an async loop that yields to the event loop so the timeout can fire
    const script = 'while(true){ await new Promise(r => setTimeout(r, 10)); }';
    await expect(
      AutomateSandbox.execute(script, api, {}, {}, 100),
    ).rejects.toThrow('Script execution timeout (100ms)');
  });

  it('propagates script errors', async () => {
    await expect(
      AutomateSandbox.execute("throw new Error('boom')", api, {}, {}),
    ).rejects.toThrow('boom');
  });

  it('returns undefined for scripts without return', async () => {
    const result = await AutomateSandbox.execute(
      'const x = 1 + 1;',
      api,
      {},
      {},
    );
    expect(result).toBeUndefined();
  });
});
