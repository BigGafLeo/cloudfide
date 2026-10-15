import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../src/core/lifespan.ts', () => ({ start: vi.fn() }));

const originalExitCode = process.exitCode;

beforeEach(() => {
  vi.resetModules();
  process.exitCode = undefined;
});
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = originalExitCode;
});

it('logs the error and sets exit code 1 when startup fails', async () => {
  const { start } = await import('../src/core/lifespan.ts');
  const error = new Error('boom');
  vi.mocked(start).mockRejectedValue(error);
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  await import('../src/main.ts');
  await vi.waitFor(() => expect(process.exitCode).toBe(1));
  expect(consoleError).toHaveBeenCalledWith('Cannot start Taskly App Node API:', error);
});

it('starts once and leaves the exit code alone on success', async () => {
  const { start } = await import('../src/core/lifespan.ts');
  vi.mocked(start).mockClear();
  vi.mocked(start).mockResolvedValue({} as never);
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  await import('../src/main.ts');
  await Promise.resolve();
  await Promise.resolve();
  expect(start).toHaveBeenCalledOnce();
  expect(process.exitCode).toBeUndefined();
  expect(consoleError).not.toHaveBeenCalled();
});
