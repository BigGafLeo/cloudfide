import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDatabase, initialize } from '../src/core/database.ts';
import { resolveDatabaseUrl } from '../src/core/config.ts';
import { createApp } from '../src/factory.ts';
import { start } from '../src/core/lifespan.ts';

vi.mock('../src/core/database.ts', () => ({ createDatabase: vi.fn(), initialize: vi.fn() }));
vi.mock('../src/core/config.ts', () => ({ resolveDatabaseUrl: vi.fn() }));
vi.mock('../src/factory.ts', () => ({ createApp: vi.fn() }));

function setup() {
  const database = { $connect: vi.fn().mockResolvedValue(undefined), $disconnect: vi.fn().mockResolvedValue(undefined) };
  vi.mocked(resolveDatabaseUrl).mockReturnValue('postgresql://test:test@localhost:5432/test');
  vi.mocked(createDatabase).mockReturnValue(database as unknown as ReturnType<typeof createDatabase>);
  vi.mocked(initialize).mockResolvedValue(undefined);
  return database;
}

function fakeApp(behavior: 'listening' | 'error', port = 8000) {
  const listener = Object.assign(new EventEmitter(), { address: () => ({ port }), close: vi.fn() });
  const listen = vi.fn((_port: number, _host: string, callback: () => void) => {
    queueMicrotask(() => {
      if (behavior === 'listening') callback();
      else listener.emit('error', new Error('EADDRINUSE'));
    });
    return listener;
  });
  vi.mocked(createApp).mockReturnValue({ listen } as unknown as ReturnType<typeof createApp>);
  return { listen, listener };
}

async function startServing(signal: 'SIGTERM' | 'SIGINT' = 'SIGTERM') {
  const database = setup();
  const { listener } = fakeApp('listening');
  const once = vi.spyOn(process, 'once').mockImplementation(() => process);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  await start();
  const registration = once.mock.calls.find(([name]) => name === signal);
  const shutdown = registration?.[1] as () => void;
  return { database, listener, shutdown, exit };
}

beforeEach(() => vi.resetAllMocks());
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('start', () => {
  it('disconnects and rethrows when connecting fails, without initializing or creating the app', async () => {
    const database = setup();
    database.$connect.mockRejectedValue(new Error('connect failed'));
    await expect(start()).rejects.toThrow('connect failed');
    expect(createDatabase).toHaveBeenCalledWith('postgresql://test:test@localhost:5432/test');
    expect(database.$disconnect).toHaveBeenCalledTimes(1);
    expect(initialize).not.toHaveBeenCalled();
    expect(createApp).not.toHaveBeenCalled();
  });

  it('disconnects and rethrows when initialization fails, without creating the app', async () => {
    const database = setup();
    vi.mocked(initialize).mockRejectedValue(new Error('init failed'));
    await expect(start()).rejects.toThrow('init failed');
    expect(database.$connect).toHaveBeenCalledTimes(1);
    expect(initialize).toHaveBeenCalledWith(database);
    expect(database.$disconnect).toHaveBeenCalledTimes(1);
    expect(createApp).not.toHaveBeenCalled();
  });

  it.each([
    ['9123', 9123],
    [undefined, 8000],
  ])('listens on API_PORT=%s (port %i) at 0.0.0.0, registers signal handlers and keeps the database connected', async (envPort, expectedPort) => {
    const database = setup();
    vi.stubEnv('API_PORT', envPort);
    const { listen, listener } = fakeApp('listening', expectedPort);
    const once = vi.spyOn(process, 'once').mockImplementation(() => process);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await start();

    expect(createApp).toHaveBeenCalledWith(database);
    expect(listen).toHaveBeenCalledTimes(1);
    expect(listen).toHaveBeenCalledWith(expectedPort, '0.0.0.0', expect.any(Function));
    expect(result.server).toBe(listener);
    expect(result.database).toBe(database);
    expect(once).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
    expect(once).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    expect(log).toHaveBeenCalledWith(expect.stringContaining(String(expectedPort)));
    expect(database.$disconnect).not.toHaveBeenCalled();
  });

  it('rejects, disconnects the database and registers no signal handlers when the listener errors', async () => {
    const database = setup();
    fakeApp('error');
    const once = vi.spyOn(process, 'once').mockImplementation(() => process);

    await expect(start()).rejects.toThrow('EADDRINUSE');

    expect(createApp).toHaveBeenCalledWith(database);
    expect(database.$disconnect).toHaveBeenCalledTimes(1);
    expect(once).not.toHaveBeenCalled();
  });
});

describe('graceful shutdown', () => {
  it.each(['SIGTERM', 'SIGINT'] as const)('on %s closes the server, disconnects only after it closed and cancels the forced exit', async (signal) => {
    const { database, listener, shutdown, exit } = await startServing(signal);
    vi.useFakeTimers();

    shutdown();

    expect(listener.close).toHaveBeenCalledTimes(1);
    expect(database.$disconnect).not.toHaveBeenCalled();

    const onClosed = listener.close.mock.calls[0][0] as () => Promise<void>;
    await onClosed();

    expect(database.$disconnect).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10000);
    expect(exit).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('logs a failed disconnect, sets a failing exit code and still cancels the forced exit', async () => {
    const { database, listener, shutdown, exit } = await startServing();
    const failure = new Error('disconnect failed');
    database.$disconnect.mockRejectedValue(failure);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const previousExitCode = process.exitCode;
    vi.useFakeTimers();
    try {
      shutdown();
      const onClosed = listener.close.mock.calls[0][0] as () => Promise<void>;
      await onClosed();

      expect(database.$disconnect).toHaveBeenCalledTimes(1);
      expect(logged).toHaveBeenCalledWith(failure);
      expect(process.exitCode).toBe(1);
      vi.advanceTimersByTime(10000);
      expect(exit).not.toHaveBeenCalled();
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it('does not set a failing exit code when the disconnect succeeds', async () => {
    const { listener, shutdown } = await startServing();
    const previousExitCode = process.exitCode;
    process.exitCode = undefined;
    vi.useFakeTimers();
    try {
      shutdown();
      await (listener.close.mock.calls[0][0] as () => Promise<void>)();
      expect(process.exitCode).toBeUndefined();
    } finally {
      process.exitCode = previousExitCode;
    }
  });

  it('force-exits with code 1 after 10000 ms when the server never finishes closing', async () => {
    const { database, listener, shutdown, exit } = await startServing();
    vi.useFakeTimers();

    shutdown();
    expect(listener.close).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(9999);
    expect(exit).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(1);
    expect(database.$disconnect).not.toHaveBeenCalled();
  });
});
