import { config } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../lib/db/schema";

config({ path: ".env.local" });

async function testDatabase() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  try {
    console.log("Connecting to database...");
    const sql = neon(process.env.DATABASE_URL);
    const db = drizzle(sql, { schema });

    // Test connection by querying a simple table
    console.log("Testing database connection...");
    const result = await sql`SELECT 1 as test`;
    console.log("✅ Database connection successful!", result);

    // Test schema access
    console.log("✅ Schema loaded successfully");
    console.log("Tables:", Object.keys(schema).filter((key) => key !== "employees" || key.includes("Enum") === false));

    console.log("\n✅ All database tests passed!");
  } catch (error) {
    console.error("❌ Database test failed:", error);
    process.exit(1);
  }
}

testDatabase();

