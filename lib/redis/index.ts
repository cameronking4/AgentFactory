import { createClient, type RedisClientType } from "redis";

let _client: RedisClientType | null = null;

function getClient() {
  if (!process.env.REDIS_URL) {
    throw new Error("REDIS_URL environment variable is not set");
  }

  if (!_client) {
    _client = createClient({
      url: process.env.REDIS_URL,
    }) as RedisClientType;
  }

  return _client;
}

// Connect to Redis
let isConnected = false;

async function connect() {
  const client = getClient();
  
  if (!isConnected) {
    client.on("error", (err) => {
      console.error("Redis Client Error:", err);
    });
    await client.connect();
    isConnected = true;
  }
  return client;
}

// Helper functions
export async function get(key: string): Promise<string | null> {
  try {
    const redis = await connect();
    return await redis.get(key);
  } catch (error) {
    console.error(`Redis GET error for key ${key}:`, error);
    throw error;
  }
}

export async function set(
  key: string,
  value: string,
  options?: { ex?: number }
): Promise<void> {
  try {
    const redis = await connect();
    if (options?.ex) {
      await redis.setEx(key, options.ex, value);
    } else {
      await redis.set(key, value);
    }
  } catch (error) {
    console.error(`Redis SET error for key ${key}:`, error);
    throw error;
  }
}

export async function del(key: string): Promise<number> {
  try {
    const redis = await connect();
    return await redis.del(key);
  } catch (error) {
    console.error(`Redis DEL error for key ${key}:`, error);
    throw error;
  }
}

export async function exists(key: string): Promise<boolean> {
  try {
    const redis = await connect();
    const result = await redis.exists(key);
    return result === 1;
  } catch (error) {
    console.error(`Redis EXISTS error for key ${key}:`, error);
    throw error;
  }
}

export async function lpush(key: string, ...values: string[]): Promise<number> {
  try {
    const redis = await connect();
    return await redis.lPush(key, values);
  } catch (error) {
    console.error(`Redis LPUSH error for key ${key}:`, error);
    throw error;
  }
}

export async function lrange(
  key: string,
  start: number,
  stop: number
): Promise<string[]> {
  try {
    const redis = await connect();
    return await redis.lRange(key, start, stop);
  } catch (error) {
    console.error(`Redis LRANGE error for key ${key}:`, error);
    throw error;
  }
}

// Export getClient for advanced usage
export { getClient as client };

