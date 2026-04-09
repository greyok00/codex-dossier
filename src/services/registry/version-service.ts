import type { Pool, PoolClient } from "pg";

import type { RegistryVersionMetadata } from "./types.js";

type Queryable = Pool | PoolClient;

interface RegistryVersionRow {
  published_at: string | null;
  destination_count: number;
  verification_window_start: string | null;
  verification_window_end: string | null;
}

export async function getRegistryVersion(db: Queryable): Promise<RegistryVersionMetadata> {
  const result = await db.query<RegistryVersionRow>(`
    WITH destination_stats AS (
      SELECT
        COUNT(*)::int AS destination_count,
        MIN(last_verified_date)::text AS verification_window_start,
        MAX(last_verified_date)::text AS verification_window_end
      FROM dossier_backend.destination
      WHERE status = 'active'
    ),
    verification_stats AS (
      SELECT MAX(checked_at)::text AS published_at
      FROM dossier_backend.verification_record
    )
    SELECT
      verification_stats.published_at,
      destination_stats.destination_count,
      destination_stats.verification_window_start,
      destination_stats.verification_window_end
    FROM destination_stats
    CROSS JOIN verification_stats
  `);

  const row = result.rows[0] ?? {
    published_at: null,
    destination_count: 0,
    verification_window_start: null,
    verification_window_end: null,
  };

  const publishedAt =
    row.published_at === null
      ? "1970-01-01T00:00:00.000Z"
      : new Date(row.published_at).toISOString();

  const versionDate = row.verification_window_end ?? "1970-01-01";
  return {
    registry_version: `${versionDate.replaceAll("-", ".")}.${row.destination_count}`,
    published_at: publishedAt,
    destination_count: row.destination_count,
    verification_window_start: row.verification_window_start,
    verification_window_end: row.verification_window_end,
  };
}
