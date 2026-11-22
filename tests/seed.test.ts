import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SEED_MIGRATION_FILE, buildSeedSql } from "@/lib/server/seed-sql";

describe("seed migration", () => {
  it("is in sync with board.ts / cards.ts (run `npm run db:generate-seed` if this fails)", () => {
    const file = readFileSync(path.resolve(process.cwd(), "supabase/migrations", SEED_MIGRATION_FILE), "utf8");
    expect(file.replace(/\r\n/g, "\n")).toBe(buildSeedSql());
  });
});
