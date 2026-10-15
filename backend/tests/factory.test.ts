import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/factory.ts';

afterEach(() => vi.restoreAllMocks());

function fakeDatabase(findFirst = vi.fn().mockResolvedValue(null)) {
  const database = { todo: { findFirst, findMany: vi.fn().mockResolvedValue([]) } };
  return { database, findFirst };
}

describe('createApp', () => {
  it('reports health after probing the database', async () => {
    const { database, findFirst } = fakeDatabase();
    const response = await request(createApp(database as never)).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(findFirst).toHaveBeenCalledWith({ select: { id: true } });
  });

  it('returns a JSON 404 for unknown routes', async () => {
    const { database } = fakeDatabase();
    const response = await request(createApp(database as never)).get('/nope');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ detail: 'Not Found' });
  });

  it('returns 422 for malformed JSON', async () => {
    const { database } = fakeDatabase();
    const response = await request(createApp(database as never))
      .post('/api/todos')
      .set('Content-Type', 'application/json')
      .send('{bad');
    expect(response.status).toBe(422);
    expect(response.body).toEqual({ detail: 'Invalid JSON.' });
  });

  it('returns 413 for an oversized body', async () => {
    const { database } = fakeDatabase();
    const response = await request(createApp(database as never))
      .post('/api/todos')
      .send({ title: 'x'.repeat(200_000) });
    expect(response.status).toBe(413);
    expect(response.body).toEqual({ detail: 'Request body too large.' });
  });

  it('hides unexpected errors behind a generic 500 and logs them', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failure = new Error('boom');
    const { database } = fakeDatabase(vi.fn().mockRejectedValue(failure));
    const response = await request(createApp(database as never)).get('/api/health');
    expect(response.status).toBe(500);
    expect(response.body).toEqual({ detail: 'Internal Server Error' });
    expect(JSON.stringify(response.body)).not.toContain('boom');
    expect(consoleError).toHaveBeenCalledWith(failure);
  });

  it('serves the OpenAPI document and does not advertise Express', async () => {
    const { database } = fakeDatabase();
    const response = await request(createApp(database as never)).get('/openapi.json');
    expect(response.status).toBe(200);
    expect(typeof response.body).toBe('object');
    expect(response.body).not.toBeNull();
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});
