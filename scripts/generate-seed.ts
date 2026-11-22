// Generates the board/cards seed migration from the TypeScript source of truth.
//   npm run db:generate-seed
import { writeFileSync } from "node:fs";
import path from "node:path";
import { SEED_MIGRATION_FILE, buildSeedSql } from "../src/lib/server/seed-sql";

const out = path.resolve(import.meta.dirname, "../supabase/migrations", SEED_MIGRATION_FILE);
writeFileSync(out, buildSeedSql(), "utf8");
console.log(`Seed written to ${out}`);
