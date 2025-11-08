import { db } from "@/lib/db";
import { tasks, employees, deliverables, memories, meetings, costs, mcpServers } from "@/lib/db/schema";
import "dotenv/config";

async function clearDatabase() {
  try {
    console.log("Clearing database...");

    // Delete in order to respect foreign key constraints
    await db.delete(costs);
    console.log("✓ Cleared costs");

    await db.delete(deliverables);
    console.log("✓ Cleared deliverables");

    await db.delete(memories);
    console.log("✓ Cleared memories");

    await db.delete(meetings);
    console.log("✓ Cleared meetings");

    await db.delete(tasks);
    console.log("✓ Cleared tasks");

    await db.delete(mcpServers);
    console.log("✓ Cleared mcpServers");

    await db.delete(employees);
    console.log("✓ Cleared employees");

    console.log("\n✅ Database cleared successfully!");
  } catch (error) {
    console.error("Error clearing database:", error);
    process.exit(1);
  }
}

clearDatabase()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

