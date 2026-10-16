import { describe, expect, it, vi } from 'vitest';
import { initialize } from '../src/core/database.ts';
import type { Database } from '../src/features/todos/types.ts';

function fakeDatabase(executeRaw = vi.fn().mockResolvedValue(0)) {
  return { database: { $executeRaw: executeRaw } as unknown as Database, executeRaw };
}

describe('initialize', () => {
  it('issues a single CREATE TABLE IF NOT EXISTS with the columns, checks and defaults', async () => {
    const { database, executeRaw } = fakeDatabase();
    await initialize(database);
    expect(executeRaw).toHaveBeenCalledTimes(1);
    const sql = (executeRaw.mock.calls[0][0] as readonly string[]).join('');
    expect(sql).toMatch(/CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+todos/i);
    expect(sql).toMatch(/\bid\s+SERIAL\s+PRIMARY\s+KEY/i);
    expect(sql).toMatch(/\btitle\s+VARCHAR\s*\(\s*120\s*\)\s+NOT\s+NULL/i);
    expect(sql).toMatch(/CHECK\s*\(\s*length\s*\(\s*title\s*\)\s*>=\s*1\s*\)/i);
    expect(sql).toMatch(/\bdescription\s+VARCHAR\s*\(\s*2000\s*\)\s+NOT\s+NULL\s+DEFAULT\s+''/i);
    expect(sql).toMatch(/\bpriority\s+VARCHAR\s*\(\s*6\s*\)\s+NOT\s+NULL\s+DEFAULT\s+'medium'/i);
    expect(sql).toMatch(/CHECK\s*\(\s*priority\s+IN\s*\(\s*'low'\s*,\s*'medium'\s*,\s*'high'\s*\)\s*\)/i);
    expect(sql).toMatch(/\bdue_date\s+DATE\s*,/i);
    expect(sql).toMatch(/\bcompleted\s+BOOLEAN\s+NOT\s+NULL\s+DEFAULT\s+FALSE/i);
    expect(sql).toMatch(/\bcreated_at\s+TIMESTAMPTZ\s+NOT\s+NULL/i);
    expect(sql).toMatch(/\bupdated_at\s+TIMESTAMPTZ\s+NOT\s+NULL/i);
  });

  it('propagates database failures', async () => {
    const { database } = fakeDatabase(vi.fn().mockRejectedValue(new Error('db down')));
    await expect(initialize(database)).rejects.toThrow('db down');
  });
});
