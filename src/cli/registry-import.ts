import { createPool } from "../db/pool.js";
import { loadNodeEnv } from "../lib/env.js";
import { RoutingRegistryImportService } from "../services/registry/import-service.js";

loadNodeEnv();

function getArgValue(flag: string) {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function getArgValues(flag: string) {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === flag && process.argv[index + 1]) {
      values.push(process.argv[index + 1]!);
    }
  }
  return values;
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required.");
}

const compiledBundlePath = getArgValue("--compiled-bundle-path");
const seedInputs = getArgValues("--seed-input");
const importBatchId = getArgValue("--import-batch-id");

const pool = createPool({ connectionString: databaseUrl });
const service = new RoutingRegistryImportService(pool);

try {
  const result = await service.importFromRequest({
    compiled_bundle_path: compiledBundlePath,
    seed_inputs: seedInputs.length > 0 ? seedInputs : undefined,
    import_batch_id: importBatchId,
  });
  console.log(JSON.stringify(result, null, 2));
} finally {
  await pool.end();
}
