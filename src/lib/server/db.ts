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

export interface DbConnectionParams {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl: "require" | false;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s; // not percent-encoded (e.g. a raw "%" in the password)
  }
}

/**
 * Parses a Postgres connection string without `new URL()`, so passwords with
 * unescaped special characters (`?`, `#`, `@`, `/`…) still work: the password
 * ends at the LAST "@" before the host. Integration-only query parameters
 * (e.g. `supa=base-pooler.x`) are dropped; only `sslmode` is honoured.
 * Errors never include the connection string (it contains the password).
 */
export function parseDatabaseUrl(raw: string): DbConnectionParams {
  const m = /^postgres(?:ql)?:\/\/(.*)$/i.exec(raw.trim());
  if (!m) throw new Error("DATABASE_URL non valida: deve iniziare con postgresql://");
  const rest = m[1];
  const at = rest.lastIndexOf("@");
  if (at < 0) throw new Error("DATABASE_URL non valida: manca utente@host.");
  const credentials = rest.slice(0, at);
  const location = rest.slice(at + 1);
  const colon = credentials.indexOf(":");
  const user = safeDecode(colon < 0 ? credentials : credentials.slice(0, colon));
  const password = colon < 0 ? "" : safeDecode(credentials.slice(colon + 1));
  const hm = /^([^:/?#]+)(?::(\d+))?(?:\/([^?#]*))?(?:\?([^#]*))?/.exec(location);
  if (!hm || !user) throw new Error("DATABASE_URL non valida: host o utente mancanti.");
  const host = hm[1];
  const params = new URLSearchParams(hm[4] ?? "");
  const sslmode = params.get("sslmode");
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(host);
  return {
    host,
    port: hm[2] ? Number(hm[2]) : 5432,
    user,
    password,
    database: safeDecode(hm[3] || "postgres"),
    ssl: sslmode === "disable" || (isLocal && !sslmode) ? false : "require",
  };
}

/**
 * All JSON parameters are passed already serialized (JSON.stringify). If a
 * parameter is typed `jsonb`, postgres.js serializes it AGAIN (a JSON string
 * of the JSON text). Casting through `text` makes the driver send the string
 * verbatim and lets Postgres parse it, matching PGlite's behaviour.
 */
export function castJsonParamsAsText(sql: string): string {
  return sql.replace(/(\$\d+)::jsonb\b/g, "$1::text::jsonb");
}

export async function createPostgresDatabase(rawUrl: string): Promise<Database> {
  const { default: postgres } = await import("postgres");
  const conn = parseDatabaseUrl(rawUrl);
  const sql = postgres({
    host: conn.host,
    port: conn.port,
    user: conn.user,
    password: conn.password,
    database: conn.database,
    ssl: conn.ssl,
    prepare: false, // required by Supabase's transaction pooler (pgbouncer)
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });
  const wrap = (s: { unsafe: (q: string, p?: any[]) => Promise<any> }): Queryer => ({
    async query(text, params = []) {
      const rows = await s.unsafe(castJsonParamsAsText(text), params as any[]);
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
      return (await pg.query(castJsonParamsAsText(text), params as any[])).rows as any;
    },
    async tx(fn) {
      return pg.transaction(async (t) =>
        fn({
          async query(text, params = []) {
            return (await t.query(castJsonParamsAsText(text), params as any[])).rows as any;
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
