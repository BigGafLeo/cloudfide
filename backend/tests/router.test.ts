import express from 'express';
import request from 'supertest';
import { it, expect, vi } from 'vitest';
import { createTodosRouter } from '../src/features/todos/router.ts';
import { todo } from './fixture.ts';

function setup() {
  const repository = { list: vi.fn().mockResolvedValue([todo]), create: vi.fn().mockResolvedValue(todo), get: vi.fn(), update: vi.fn(), delete: vi.fn() };
  const app = express();
  app.use(express.json());
  app.use('/api/todos', createTodosRouter(repository));
  return { app, repository };
}
it('lists tasks from the repository', async () => {
  const { app, repository } = setup();
  const response = await request(app).get('/api/todos');
  expect(response.status).toBe(200);
  expect(response.body).toEqual([todo]);
  expect(repository.list).toHaveBeenCalledOnce();
  expect(repository.list).toHaveBeenCalledWith({});
  expect(Object.keys(repository.list.mock.calls[0][0])).toEqual([]);
});
it('does not forward unrelated query parameters to the repository', async () => {
  const { app, repository } = setup();
  const response = await request(app).get('/api/todos?unrelated=1');
  expect(response.status).toBe(200);
  expect(repository.list).toHaveBeenCalledOnce();
  expect(Object.keys(repository.list.mock.calls[0][0])).toEqual([]);
});
it('forwards a valid priority query to the repository', async () => {
  const { app, repository } = setup();
  const response = await request(app).get('/api/todos?priority=high');
  expect(response.status).toBe(200);
  expect(response.body).toEqual([todo]);
  expect(repository.list).toHaveBeenCalledOnce();
  expect(repository.list).toHaveBeenCalledWith({ priority: 'high' });
});
it('rejects an invalid priority query without calling the repository', async () => {
  const { app, repository } = setup();
  const response = await request(app).get('/api/todos?priority=urgent');
  expect(response.status).toBe(422);
  expect(Array.isArray(response.body.detail)).toBe(true);
  expect(response.body.detail.length).toBeGreaterThan(0);
  expect(repository.list).not.toHaveBeenCalled();
});
it.each(['priority=', 'priority=HIGH', 'priority=high&priority=low'])(
  'rejects the near-miss priority query %s without calling the repository', async (query) => {
    const { app, repository } = setup();
    const response = await request(app).get(`/api/todos?${query}`);
    expect(response.status).toBe(422);
    expect(Array.isArray(response.body.detail)).toBe(true);
    expect(response.body.detail.length).toBeGreaterThan(0);
    expect(repository.list).not.toHaveBeenCalled();
  },
);
it('creates tasks with trimmed input and defaults', async () => {
  const { app, repository } = setup();
  const response = await request(app).post('/api/todos').send({ title: '  Plan the sprint  ', priority: 'high' });
  expect(response.status).toBe(201);
  expect(response.body).toEqual(todo);
  expect(repository.create).toHaveBeenCalledWith({ title: 'Plan the sprint', description: '', priority: 'high', due_date: null, completed: false });
});
it.each([{ title: '  ' }, { title: 'x'.repeat(121) }, { title: 'Task', priority: 'urgent' }, { title: 'Task', due_date: '2026-02-30' }])(
  'rejects invalid create input without calling the repository: %j', async (payload) => {
    const { app, repository } = setup();
    expect((await request(app).post('/api/todos').send(payload)).status).toBe(422);
    expect(repository.create).not.toHaveBeenCalled();
  },
);

it.each(['abc', '0', '-3', '9007199254740992'])('rejects invalid id %s on every id route before calling the repository', async (id) => {
  const { app, repository } = setup();
  const responses = [
    await request(app).get(`/api/todos/${id}`),
    await request(app).patch(`/api/todos/${id}`).send({ title: 'New' }),
    await request(app).delete(`/api/todos/${id}`),
  ];
  for (const response of responses) {
    expect(response.status).toBe(422);
    expect(Array.isArray(response.body.detail)).toBe(true);
    expect(response.body.detail.length).toBeGreaterThan(0);
  }
  expect(repository.get).not.toHaveBeenCalled();
  expect(repository.update).not.toHaveBeenCalled();
  expect(repository.delete).not.toHaveBeenCalled();
});
it('gets a task by numeric id and reports a missing task', async () => {
  const { app, repository } = setup();
  repository.get.mockResolvedValueOnce(todo).mockResolvedValueOnce(null);
  const found = await request(app).get('/api/todos/1');
  expect(found.status).toBe(200);
  expect(found.body).toEqual(todo);
  expect(repository.get).toHaveBeenCalledWith(1);
  const missing = await request(app).get('/api/todos/2');
  expect(missing.status).toBe(404);
  expect(missing.body).toEqual({ detail: 'Task not found.' });
  expect(repository.get).toHaveBeenLastCalledWith(2);
});
it('patches a task with the parsed payload', async () => {
  const { app, repository } = setup();
  repository.update.mockResolvedValue({ ...todo, title: 'New' });
  const response = await request(app).patch('/api/todos/1').send({ title: '  New  ' });
  expect(response.status).toBe(200);
  expect(response.body).toEqual({ ...todo, title: 'New' });
  expect(repository.update).toHaveBeenCalledWith(1, { title: 'New' });
});
it.each([{}, { id: 5 }, { title: 'New', id: 5 }, { title: '  ' }, { completed: null }])('rejects invalid patch body without updating: %j', async (payload) => {
  const { app, repository } = setup();
  const response = await request(app).patch('/api/todos/1').send(payload);
  expect(response.status).toBe(422);
  expect(response.body.detail.length).toBeGreaterThan(0);
  expect(repository.update).not.toHaveBeenCalled();
});
it('returns 404 when patching a missing task', async () => {
  const { app, repository } = setup();
  repository.update.mockResolvedValue(null);
  const response = await request(app).patch('/api/todos/9').send({ completed: true });
  expect(response.status).toBe(404);
  expect(response.body).toEqual({ detail: 'Task not found.' });
  expect(repository.update).toHaveBeenCalledWith(9, { completed: true });
});
it('deletes a task with an empty 204 and reports a missing task', async () => {
  const { app, repository } = setup();
  repository.delete.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
  const deleted = await request(app).delete('/api/todos/1');
  expect(deleted.status).toBe(204);
  expect(deleted.text).toBe('');
  expect(repository.delete).toHaveBeenCalledWith(1);
  const missing = await request(app).delete('/api/todos/2');
  expect(missing.status).toBe(404);
  expect(missing.body).toEqual({ detail: 'Task not found.' });
  expect(repository.delete).toHaveBeenLastCalledWith(2);
});
