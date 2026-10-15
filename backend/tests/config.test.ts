import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveDatabaseUrl } from '../src/core/config.ts';

vi.mock('dotenv', () => ({ default: { config: vi.fn() } }));

afterEach(() => vi.unstubAllEnvs());

function stubComposeEnv(overrides: Record<string, string> = {}) {
  const values: Record<string, string> = {
    DATABASE_URL: '',
    POSTGRES_USER: 'user',
    POSTGRES_PASSWORD: 'p@ss',
    POSTGRES_HOST: 'db',
    DB_PORT: '5433',
    POSTGRES_DB: 'my db',
    ...overrides,
  };
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value);
}

describe('resolveDatabaseUrl', () => {
  it('prefers the override over DATABASE_URL and rewrites the psycopg scheme', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://other/x');
    expect(resolveDatabaseUrl('postgresql+psycopg://u:p@h:5432/d')).toBe('postgresql://u:p@h:5432/d');
  });

  it('uses DATABASE_URL, normalized, when there is no override', () => {
    vi.stubEnv('DATABASE_URL', 'postgresql+psycopg://a:b@host:5432/name');
    expect(resolveDatabaseUrl()).toBe('postgresql://a:b@host:5432/name');
  });

  it('builds the URL from POSTGRES_* variables and encodes special characters', () => {
    stubComposeEnv();
    const url = new URL(resolveDatabaseUrl());
    expect(url.protocol).toBe('postgresql:');
    expect(url.hostname).toBe('db');
    expect(url.port).toBe('5433');
    expect(url.username).toBe('user');
    expect(decodeURIComponent(url.password)).toBe('p@ss');
    expect(url.pathname).toBe('/my%20db');
  });

  it.each(['POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST', 'DB_PORT', 'POSTGRES_DB'])(
    'throws when %s is missing',
    (name) => {
      stubComposeEnv({ [name]: '' });
      expect(() => resolveDatabaseUrl()).toThrow(`Missing environment variable: ${name}`);
    },
  );
});
