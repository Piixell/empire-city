// ---------------------------------------------------------------------------
// Database access abstraction.
//   * Production (Vercel): postgres.js over the Supabase transaction pooler.
//   * Local mode / tests: PGlite (Postgres compiled to WASM) running the very
//     same SQL migrations.
// Both expose `tx(fn)`: a real Postgres transaction. Game commands lock the
// game row with SELECT ... FOR UPDATE inside it, which serializes them.
// ---------------------------------------------------------------------------
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;

export interface Queryer {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
}

export interface Database extends Queryer {
  kind: "postgres" | "pglite";
  tx<T>(fn: (q: Queryer) => Promise<T>): Promise<T>;
}

// ------------------------------- postgres.js -------------------------------

/** DATABASE_URL, or POSTGRES_URL as injected by the Vercel ⇄ Supabase integration. */
export function databaseUrl(): string {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || "";
}

/**
 * Keeps only parameters postgres.js understands: integration URLs carry extra
 * query params (e.g. `supa=base-pooler.x`) that would be sent to the server as
 * unknown startup parameters.
 */
export function normalizeDatabaseUrl(raw: string): { url: string; ssl: "require" | false } {
  const u = new URL(raw);
  const sslmode = u.searchParams.get("sslmode");
  u.search = "";
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(u.hostname);
  return { url: u.toString(), ssl: sslmode === "disable" || (isLocal && !sslmode) ? false : "require" };
}

export async function createPostgresDatabase(rawUrl: string): Promise<Database> {
  const { default: postgres } = await import("postgres");
  const { url, ssl } = normalizeDatabaseUrl(rawUrl);
  const sql = postgres(url, {
    ssl,
    prepare: false, // required by Supabase's transaction pooler (pgbouncer)
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  const wrap = (s: { unsafe: (q: string, p?: any[]) => Promise<any> }): Queryer => ({
    async query(text, params = []) {
      const rows = await s.unsafe(text, params as any[]);
      return Array.from(rows as Iterable<Row>) as any;
    },
  });
  const base = wrap(sql as any);
  return {
    kind: "postgres",
    query: base.query,
    async tx(fn) {
      return (await sql.begin(async (t) => fn(wrap(t as any)))) as any;
    },
  };
}

// --------------------------------- PGlite ----------------------------------

export const PGLITE_BOOTSTRAP_SQL = `
create schema if not exists auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
create table if not exists public._local_migrations (name text primary key, applied_at timestamptz not null default now());
`;

export function migrationsDir(): string {
  return path.resolve(process.cwd(), "supabase", "migrations");
}

export function readMigrations(): { name: string; sql: string }[] {
  const dir = migrationsDir();
  return readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((name) => ({ name, sql: readFileSync(path.join(dir, name), "utf8") }));
}

export async function createPgliteDatabase(dataDir?: string): Promise<Database> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) mkdirSync(path.dirname(dataDir), { recursive: true });
  const pg = await PGlite.create(dataDir);
  await pg.exec(PGLITE_BOOTSTRAP_SQL);
  const applied = new Set(
    (await pg.query<{ name: string }>("select name from public._local_migrations")).rows.map((r) => r.name),
  );
  for (const m of readMigrations()) {
    if (applied.has(m.name)) continue;
    await pg.exec(m.sql);
    await pg.query("insert into public._local_migrations(name) values ($1)", [m.name]);
  }
  return {
    kind: "pglite",
    async query(text, params = []) {
      return (await pg.query(text, params as any[])).rows as any;
    },
    async tx(fn) {
      return pg.transaction(async (t) =>
        fn({
          async query(text, params = []) {
            return (await t.query(text, params as any[])).rows as any;
          },
        }),
      );
    },
  };
}

// ------------------------------- singleton ---------------------------------

const g = globalThis as unknown as { __empireDb?: Promise<Database> };

export function getDb(): Promise<Database> {
  if (!g.__empireDb) {
    const url = databaseUrl();
    if (url) {
      g.__empireDb = createPostgresDatabase(url);
    } else if (process.env.NODE_ENV !== "production" || process.env.EMPIRE_ALLOW_LOCAL === "1") {
      const dir = path.resolve(process.cwd(), ".data", "pglite");
      g.__empireDb = createPgliteDatabase(dir);
    } else {
      return Promise.reject(new Error("DATABASE_URL non configurata."));
    }
    g.__empireDb.catch(() => {
      g.__empireDb = undefined;
    });
  }
  return g.__empireDb;
}

/** Test helper: inject a database (e.g. in-memory PGlite). */
export function setDbForTests(db: Database | undefined) {
  g.__empireDb = db ? Promise.resolve(db) : undefined;
}
