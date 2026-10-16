import { afterEach, describe, it, expect, vi } from 'vitest';
import { resolveDatabaseUrl } from '../src/core/config.ts';

const names = ['DATABASE_URL', 'POSTGRES_USER', 'POSTGRES_PASSWORD', 'POSTGRES_HOST', 'DB_PORT', 'POSTGRES_DB'];

function stubEnv(values: Record<string, string>) {
  for (const name of names) vi.stubEnv(name, values[name]);
}

afterEach(() => vi.unstubAllEnvs());

describe('resolveDatabaseUrl', () => {
  it('prefers the override over DATABASE_URL', () => {
    stubEnv({ DATABASE_URL: 'postgresql://env/db' });
    expect(resolveDatabaseUrl('postgresql://override/db')).toBe('postgresql://override/db');
  });
  it('rewrites the SQLAlchemy driver prefix', () => {
    stubEnv({ DATABASE_URL: 'postgresql+psycopg://u:p@h:5432/d' });
    expect(resolveDatabaseUrl()).toBe('postgresql://u:p@h:5432/d');
    expect(resolveDatabaseUrl('postgresql+psycopg://o:p@h:5432/x')).toBe('postgresql://o:p@h:5432/x');
  });
  it('prefers DATABASE_URL over the POSTGRES_* parts', () => {
    stubEnv({ DATABASE_URL: 'postgresql://direct/db', POSTGRES_USER: 'u', POSTGRES_PASSWORD: 'p', POSTGRES_HOST: 'h', DB_PORT: '5432', POSTGRES_DB: 'd' });
    expect(resolveDatabaseUrl()).toBe('postgresql://direct/db');
  });
  it('assembles an encoded URL from the POSTGRES_* parts', () => {
    stubEnv({ POSTGRES_USER: 'u', POSTGRES_PASSWORD: 'p@ss', POSTGRES_HOST: 'h', DB_PORT: '5432', POSTGRES_DB: 'my db' });
    expect(resolveDatabaseUrl()).toBe('postgresql://u:p%40ss@h:5432/my%20db');
  });
  it('encodes a literal percent in the database name', () => {
    stubEnv({ POSTGRES_USER: 'u', POSTGRES_PASSWORD: 'p', POSTGRES_HOST: 'h', DB_PORT: '5432', POSTGRES_DB: 'a%b' });
    expect(resolveDatabaseUrl()).toBe('postgresql://u:p@h:5432/a%25b');
  });
  it('treats an empty override as absent and falls back to DATABASE_URL', () => {
    stubEnv({ DATABASE_URL: 'postgresql://env/db' });
    expect(resolveDatabaseUrl('')).toBe('postgresql://env/db');
  });
  it('treats an empty DATABASE_URL as absent and assembles the URL from the POSTGRES_* parts', () => {
    stubEnv({ DATABASE_URL: '', POSTGRES_USER: 'u', POSTGRES_PASSWORD: 'p', POSTGRES_HOST: 'h', DB_PORT: '5432', POSTGRES_DB: 'd' });
    expect(resolveDatabaseUrl()).toBe('postgresql://u:p@h:5432/d');
  });
  it('reports a missing variable by name', () => {
    stubEnv({ POSTGRES_USER: 'u', POSTGRES_PASSWORD: 'p', DB_PORT: '5432', POSTGRES_DB: 'd' });
    expect(() => resolveDatabaseUrl()).toThrow('Missing environment variable: POSTGRES_HOST');
  });
  it('reports the first missing variable in declaration order', () => {
    stubEnv({ POSTGRES_PASSWORD: 'p', DB_PORT: '5432', POSTGRES_DB: 'd' });
    expect(() => resolveDatabaseUrl()).toThrow('Missing environment variable: POSTGRES_USER');
  });
});
