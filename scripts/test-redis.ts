import { config } from "dotenv";
import { get, set, del, exists, lpush, lrange } from "../lib/redis";

config({ path: ".env.local" });

async function testRedis() {
  try {
    console.log("Testing Redis connection...");

    // Test SET and GET
    await set("test:key", "test-value");
    const value = await get("test:key");
    console.log("✅ SET/GET test:", value === "test-value" ? "PASSED" : "FAILED");

    // Test EXISTS
    const keyExists = await exists("test:key");
    console.log("✅ EXISTS test:", keyExists ? "PASSED" : "FAILED");

    // Test LPUSH and LRANGE
    await lpush("test:list", "item1", "item2", "item3");
    const listItems = await lrange("test:list", 0, -1);
    console.log("✅ LPUSH/LRANGE test:", listItems.length === 3 ? "PASSED" : "FAILED");

    // Test DEL
    await del("test:key");
    const keyExistsAfterDel = await exists("test:key");
    console.log("✅ DEL test:", !keyExistsAfterDel ? "PASSED" : "FAILED");

    // Cleanup
    await del("test:list");

    console.log("\n✅ All Redis tests passed!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Redis test failed:", error);
    process.exit(1);
  }
}

testRedis();

