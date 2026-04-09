import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import type { Pool } from "pg";

export async function resetTestDatabase(pool: Pool) {
  await pool.query("DROP SCHEMA IF EXISTS dossier_local CASCADE");
  await pool.query("DROP SCHEMA IF EXISTS dossier_backend CASCADE");
  await pool.query("DROP SCHEMA IF EXISTS dossier_enum CASCADE");

  const schemaPath = fileURLToPath(new URL("../../docs/SCHEMA.sql", import.meta.url));
  const schemaSql = await readFile(schemaPath, "utf8");
  await pool.query(schemaSql);
}

export async function countTable(pool: Pool, tableName: string) {
  const result = await pool.query<{ count: string }>(`SELECT COUNT(*)::text AS count FROM ${tableName}`);
  return Number(result.rows[0]?.count ?? "0");
}
