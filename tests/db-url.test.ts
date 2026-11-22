import { describe, expect, it } from "vitest";
import { normalizeDatabaseUrl } from "@/lib/server/db";

describe("database URL normalization", () => {
  it("strips integration-only params and requires SSL for remote hosts", () => {
    const r = normalizeDatabaseUrl(
      "postgres://postgres.abc:p%40ss@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x",
    );
    expect(r.url).toBe("postgres://postgres.abc:p%40ss@aws-0-eu-central-1.pooler.supabase.com:6543/postgres");
    expect(r.ssl).toBe("require");
  });

  it("does not force SSL on localhost", () => {
    expect(normalizeDatabaseUrl("postgresql://postgres:x@localhost:5432/postgres").ssl).toBe(false);
  });
});
