// Generates the board/cards seed migration from the TypeScript source of truth.
//   npm run db:generate-seed
import { writeFileSync } from "node:fs";
import path from "node:path";
import { buildSeedSql } from "../src/lib/server/seed-sql";

const out = path.resolve(import.meta.dirname, "../supabase/migrations/20261122000004_seed_board.sql");
writeFileSync(out, buildSeedSql(), "utf8");
console.log(`Seed written to ${out}`);
