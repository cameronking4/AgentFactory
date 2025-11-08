/**
 * Apply the manager_id migration manually
 */
import "dotenv/config";
import { neon } from "@neondatabase/serverless";
import * as fs from "fs";
import * as path from "path";

async function applyMigration() {
  const sql = neon(process.env.DATABASE_URL!);

  const migrationFile = path.join(
    process.cwd(),
    "migrations",
    "0001_colossal_orphan.sql"
  );

  const migrationSQL = fs.readFileSync(migrationFile, "utf-8");
  
  // Split by statement-breakpoint
  const statements = migrationSQL
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  console.log(`Applying ${statements.length} migration statements...`);

  for (const statement of statements) {
    try {
      await sql(statement);
      console.log(`✅ Applied: ${statement.substring(0, 50)}...`);
    } catch (error: any) {
      if (error.message?.includes("already exists") || error.message?.includes("duplicate")) {
        console.log(`⚠️  Skipped (already exists): ${statement.substring(0, 50)}...`);
      } else {
        console.error(`❌ Error: ${error.message}`);
        throw error;
      }
    }
  }

  console.log("\n✅ Migration applied successfully!");
}

applyMigration().catch(console.error);

