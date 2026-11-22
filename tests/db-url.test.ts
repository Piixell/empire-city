import { describe, expect, it } from "vitest";
import { parseDatabaseUrl } from "@/lib/server/db";

describe("database URL parsing", () => {
  it("drops integration-only params and requires SSL for remote hosts", () => {
    const r = parseDatabaseUrl(
      "postgres://postgres.abc:p%40ss@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x",
    );
    expect(r).toEqual({
      host: "aws-0-eu-central-1.pooler.supabase.com",
      port: 6543,
      user: "postgres.abc",
      password: "p@ss",
      database: "postgres",
      ssl: "require",
    });
  });

  it("accepts unescaped special characters in the password", () => {
    const r = parseDatabaseUrl("postgresql://postgres.abc:we?ird#pa@ss/:x??@db.example.com:6543/postgres");
    expect(r.password).toBe("we?ird#pa@ss/:x??");
    expect(r.host).toBe("db.example.com");
    expect(r.port).toBe(6543);
    expect(r.database).toBe("postgres");
  });

  it("keeps a literal % that is not an escape sequence", () => {
    expect(parseDatabaseUrl("postgresql://u:100%sure@h:5432/db").password).toBe("100%sure");
  });

  it("does not force SSL on localhost", () => {
    expect(parseDatabaseUrl("postgresql://postgres:x@localhost:5432/postgres").ssl).toBe(false);
  });

  it("never echoes the connection string in errors", () => {
    expect(() => parseDatabaseUrl("mysql://u:secret@h/db")).toThrow(/postgresql:\/\//);
    try {
      parseDatabaseUrl("postgresql://nohost-secret");
    } catch (e) {
      expect(String(e)).not.toContain("secret");
    }
  });
});
