// Test harness for the Supabase migration.
//
// Uses a real Postgres when DATABASE_URL is set (CI), otherwise PGlite (Postgres
// compiled to WASM) so the suite also runs on machines without Docker.
// Supabase-provided objects the migration depends on (auth.users, auth.uid(), the
// anon/authenticated/service_role roles) are stubbed to match Supabase's behaviour.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';
import { PGlite } from '@electric-sql/pglite';

export type Row = Record<string, unknown>;
export type Query = (sql: string, params?: unknown[]) => Promise<Row[]>;
export type Role = 'anon' | 'authenticated' | 'service_role';

export interface TestDb {
  readonly kind: 'postgres' | 'pglite';
  /** Runs as the superuser (bypasses RLS). */
  query: Query;
  /** Runs fn inside one transaction as the given role and JWT subject. Rolls back on throw. */
  as<T>(role: Role, userId: string | null, fn: (q: Query) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const SUPABASE_STUB = `
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb not null default '{}'
);
create function auth.uid() returns uuid language sql stable as $fn$
  select nullif(coalesce(
    current_setting('request.jwt.claim.sub', true),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  ), '')::uuid
$fn$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
`;

const RESET = `
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
grant usage on schema public to public;
`;

function migrationSql(): string {
  const dir = join(import.meta.dirname, '..', '..', 'supabase', 'migrations');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n');
}

const SET_ROLE = `select set_config('role', $1, true), set_config('request.jwt.claim.sub', $2, true)`;

export async function createTestDb(): Promise<TestDb> {
  const url = process.env.DATABASE_URL;
  const db = url ? await postgresDb(url) : await pgliteDb();
  if (db.kind === 'postgres') await db.query(RESET);
  await db.query(SUPABASE_STUB);
  await db.query(migrationSql());
  return db;
}

async function pgliteDb(): Promise<TestDb> {
  const lite = new PGlite();
  const query: Query = async (sql, params) => {
    if (params && params.length) return (await lite.query<Row>(sql, params)).rows;
    const results = await lite.exec(sql);
    return (results.at(-1)?.rows ?? []) as Row[];
  };
  return {
    kind: 'pglite',
    query,
    as: (role, userId, fn) =>
      lite.transaction(async (tx) => {
        await tx.query(SET_ROLE, [role, userId ?? '']);
        return fn(async (sql, params) => (await tx.query<Row>(sql, params ?? [])).rows);
      }),
    close: () => lite.close(),
  };
}

async function postgresDb(url: string): Promise<TestDb> {
  const pool = new pg.Pool({ connectionString: url, max: 30 });
  const query: Query = async (sql, params) => {
    const res = await pool.query(sql, params);
    const last = Array.isArray(res) ? res.at(-1) : res;
    return (last?.rows ?? []) as Row[];
  };
  return {
    kind: 'postgres',
    query,
    async as(role, userId, fn) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        await client.query(SET_ROLE, [role, userId ?? '']);
        const out = await fn(async (sql, params) => (await client.query(sql, params)).rows as Row[]);
        await client.query('commit');
        return out;
      } catch (err) {
        await client.query('rollback');
        throw err;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
