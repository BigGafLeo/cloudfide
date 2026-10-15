import { expect, it, vi } from 'vitest';
import { initialize } from '../src/core/database.ts';

it('issues one idempotent CREATE TABLE statement with the expected columns and constraints', async () => {
  const $executeRaw = vi.fn().mockResolvedValue(0);
  await initialize({ $executeRaw } as never);
  expect($executeRaw).toHaveBeenCalledTimes(1);
  const sql = ($executeRaw.mock.calls[0][0] as string[]).join('');
  expect(sql).toContain('CREATE TABLE IF NOT EXISTS todos');
  expect(sql).toContain('title VARCHAR(120) NOT NULL');
  expect(sql).toContain('description VARCHAR(2000) NOT NULL');
  expect(sql).toContain("priority IN ('low', 'medium', 'high')");
  for (const column of ['due_date DATE', 'completed BOOLEAN', 'created_at TIMESTAMPTZ', 'updated_at TIMESTAMPTZ']) {
    expect(sql).toContain(column);
  }
});

it('propagates database errors', async () => {
  const $executeRaw = vi.fn().mockRejectedValue(new Error('db down'));
  await expect(initialize({ $executeRaw } as never)).rejects.toThrow('db down');
});
