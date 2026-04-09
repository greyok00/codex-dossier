import { Pool, type PoolClient, type PoolConfig } from "pg";

export function createPool(config: PoolConfig) {
  return new Pool(config);
}

export async function withTransaction<T>(client: PoolClient, fn: () => Promise<T>) {
  await client.query("BEGIN");
  try {
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
