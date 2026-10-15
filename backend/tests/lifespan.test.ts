import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, initialize } from '../src/core/database.ts';
import { resolveDatabaseUrl } from '../src/core/config.ts';
import { createApp } from '../src/factory.ts';
import { start } from '../src/core/lifespan.ts';

vi.mock('../src/core/database.ts', () => ({ createDatabase: vi.fn(), initialize: vi.fn() }));
vi.mock('../src/core/config.ts', () => ({ resolveDatabaseUrl: vi.fn() }));
vi.mock('../src/factory.ts', () => ({ createApp: vi.fn() }));

const originalExitCode = process.exitCode;

function setup({ autoListen = true } = {}) {
  const database = { $connect: vi.fn().mockResolvedValue(undefined), $disconnect: vi.fn().mockResolvedValue(undefined) };
  const listener = Object.assign(new EventEmitter(), {
    address: () => ({ port: 8000 }),
    close: vi.fn((cb: () => void) => cb()),
  });
  const listen = vi.fn((_port: number, _host: string, cb: () => void) => {
    if (autoListen) queueMicrotask(cb);
    return listener;
  });
  const app = { listen };
  vi.mocked(resolveDatabaseUrl).mockReturnValue('postgresql://resolved');
  vi.mocked(createDatabase).mockReturnValue(database as never);
  vi.mocked(initialize).mockResolvedValue(undefined);
  vi.mocked(createApp).mockReturnValue(app as never);
  const handlers = new Map<string, () => void>();
  vi.spyOn(process, 'once').mockImplementation(((event: string, handler: () => void) => {
    handlers.set(event, handler);
    return process;
  }) as never);
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  return { database, listener, listen, handlers, log };
}

beforeEach(() => vi.clearAllMocks());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  process.exitCode = originalExitCode;
});

describe('start', () => {
  it('connects, initializes, listens on the default port and returns the server', async () => {
    vi.stubEnv('API_PORT', '');
    const { database, listener, listen, log } = setup();
    const result = await start();
    expect(result).toEqual({ server: listener, database });
    expect(result.server).toBe(listener);
    expect(createDatabase).toHaveBeenCalledWith('postgresql://resolved');
    expect(listen).toHaveBeenCalledWith(8000, '0.0.0.0', expect.any(Function));
    expect(createApp).toHaveBeenCalledWith(database);
    expect(initialize).toHaveBeenCalledWith(database);
    expect(database.$connect.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(initialize).mock.invocationCallOrder[0],
    );
    expect(log).toHaveBeenCalledWith(expect.stringContaining('8000'));
  });

  it('uses API_PORT from the environment as a number', async () => {
    vi.stubEnv('API_PORT', '9123');
    const { listen } = setup();
    await start();
    expect(listen).toHaveBeenCalledWith(9123, '0.0.0.0', expect.any(Function));
  });

  it('disconnects and rethrows when connecting fails', async () => {
    const { database } = setup();
    database.$connect.mockRejectedValue(new Error('connect failed'));
    await expect(start()).rejects.toThrow('connect failed');
    expect(database.$disconnect).toHaveBeenCalledTimes(1);
    expect(createApp).not.toHaveBeenCalled();
  });

  it('disconnects and rethrows when schema initialization fails', async () => {
    const { database } = setup();
    vi.mocked(initialize).mockRejectedValue(new Error('init failed'));
    await expect(start()).rejects.toThrow('init failed');
    expect(database.$disconnect).toHaveBeenCalledTimes(1);
    expect(createApp).not.toHaveBeenCalled();
  });

  it('rejects and disconnects when the listener emits an error', async () => {
    const { database, listener, listen } = setup({ autoListen: false });
    const pending = start();
    const assertion = expect(pending).rejects.toThrow('EADDRINUSE');
    await vi.waitFor(() => expect(listen).toHaveBeenCalled());
    listener.emit('error', new Error('EADDRINUSE'));
    await assertion;
    expect(database.$disconnect).toHaveBeenCalledTimes(1);
  });
});

describe('shutdown handler', () => {
  it('registers on SIGTERM and SIGINT and closes cleanly without exiting', async () => {
    vi.useFakeTimers();
    const { database, listener, handlers } = setup();
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    process.exitCode = undefined;
    await start();
    expect(handlers.get('SIGTERM')).toBeTypeOf('function');
    expect(handlers.get('SIGINT')).toBe(handlers.get('SIGTERM'));
    handlers.get('SIGTERM')!();
    await vi.advanceTimersByTimeAsync(0);
    expect(listener.close).toHaveBeenCalledTimes(1);
    expect(database.$disconnect).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBeUndefined();
    await vi.advanceTimersByTimeAsync(10000);
    expect(exit).not.toHaveBeenCalled();
  });

  it('logs a disconnect failure and sets exit code 1', async () => {
    vi.useFakeTimers();
    const { database, handlers } = setup();
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('disconnect failed');
    process.exitCode = undefined;
    await start();
    database.$disconnect.mockRejectedValue(error);
    handlers.get('SIGINT')!();
    await vi.advanceTimersByTimeAsync(0);
    expect(consoleError).toHaveBeenCalledWith(error);
    expect(process.exitCode).toBe(1);
  });

  it('force-exits with code 1 after 10000 ms if the server never closes', async () => {
    vi.useFakeTimers();
    const { listener, handlers } = setup();
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    await start();
    listener.close.mockImplementation(() => undefined);
    handlers.get('SIGTERM')!();
    await vi.advanceTimersByTimeAsync(9999);
    expect(exit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(exit).toHaveBeenCalledWith(1);
  });
});
