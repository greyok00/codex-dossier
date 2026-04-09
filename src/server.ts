import { loadNodeEnv } from "./lib/env.js";
import { createPool } from "./db/pool.js";
import { buildApp } from "./app.js";

loadNodeEnv();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is required.");
}

const port = Number(process.env.PORT ?? "3000");
const host = process.env.HOST ?? "0.0.0.0";

const pool = createPool({ connectionString });
const app = buildApp(pool);

const shutdown = async () => {
  await app.close();
  await pool.end();
};

process.on("SIGINT", () => {
  void shutdown().finally(() => process.exit(0));
});
process.on("SIGTERM", () => {
  void shutdown().finally(() => process.exit(0));
});

await app.listen({ port, host });
