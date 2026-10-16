import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Database } from '../src/features/todos/types.ts';

const specification = { openapi: '3.1.0', info: { title: 'Stub API', version: '1' }, paths: {} };

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const readFileSync = ((path: unknown, ...rest: unknown[]) =>
    String(path).endsWith('openapi.json')
      ? JSON.stringify({ openapi: '3.1.0', info: { title: 'Stub API', version: '1' }, paths: {} })
      : (actual.readFileSync as (...args: unknown[]) => unknown)(path, ...rest)) as typeof actual.readFileSync;
  return { ...actual, readFileSync, default: { ...actual, readFileSync } };
});

const { createApp } = await import('../src/factory.ts');

function setup(findFirst = vi.fn().mockResolvedValue(null)) {
  const database = { todo: { findFirst } } as unknown as Database;
  return { app: createApp(database), findFirst };
}

afterEach(() => vi.restoreAllMocks());

describe('createApp', () => {
  it('returns a JSON 404 for unknown routes', async () => {
    const response = await request(setup().app).get('/nope');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ detail: 'Not Found' });
  });

  it('returns 422 for malformed JSON', async () => {
    const response = await request(setup().app).post('/api/todos').set('Content-Type', 'application/json').send('{bad');
    expect(response.status).toBe(422);
    expect(response.body).toEqual({ detail: 'Invalid JSON.' });
  });

  it('returns 413 for oversized bodies', async () => {
    const body = JSON.stringify({ title: 'x'.repeat(200 * 1024) });
    const response = await request(setup().app).post('/api/todos').set('Content-Type', 'application/json').send(body);
    expect(response.status).toBe(413);
    expect(response.body).toEqual({ detail: 'Request body too large.' });
  });

  it('returns a generic 500 without leaking the error and logs it', async () => {
    const error = new Error('secret db failure');
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { app } = setup(vi.fn().mockRejectedValue(error));
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ detail: 'Internal Server Error' });
    expect(response.text).not.toContain('secret db failure');
    expect(logged).toHaveBeenCalledWith(error);
  });

  it('reports health after querying the database and hides x-powered-by', async () => {
    const { app, findFirst } = setup();
    const response = await request(app).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(findFirst).toHaveBeenCalledWith({ select: { id: true } });
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('serves the OpenAPI document', async () => {
    const response = await request(setup().app).get('/openapi.json');
    expect(response.status).toBe(200);
    expect(response.body).toEqual(specification);
  });
});
