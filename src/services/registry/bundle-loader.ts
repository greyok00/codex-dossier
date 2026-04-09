import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

import { z } from "zod";

import { ValidationError } from "../../lib/errors.js";
import type { CompiledDestinationBundle } from "./types.js";

const destinationTypeSchema = z.enum([
  "business",
  "corporate",
  "local_agency",
  "state_agency",
  "federal_agency",
  "regulator",
  "law_enforcement",
  "consumer_org",
  "other",
]);

const intakeMethodSchema = z.enum([
  "web_form",
  "email",
  "phone",
  "mail",
  "portal",
  "in_person",
]);

const trustLevelSchema = z.enum(["official", "verified", "directory", "unconfirmed"]);
const statusSchema = z.enum(["active", "inactive"]);
const verificationResultSchema = z.enum(["verified", "changed", "failed", "unreachable", "skipped"]);

const destinationSchema = z.object({
  id: z.string().uuid(),
  destination_name: z.string().min(1),
  destination_type: destinationTypeSchema,
  jurisdiction_country: z.literal("US"),
  jurisdiction_state: z.string().length(2).nullable(),
  jurisdiction_county: z.string().min(1).nullable(),
  jurisdiction_city: z.string().min(1).nullable(),
  categories_handled_json: z.array(z.string().min(1)).min(1),
  source_url: z.url(),
  last_verified_date: z.string().date(),
  trust_level: trustLevelSchema,
  status: statusSchema,
});

const destinationIntakeSchema = z
  .object({
    id: z.string().uuid(),
    destination_id: z.string().uuid(),
    intake_method: intakeMethodSchema,
    complaint_url: z.url().nullable(),
    email: z.email().nullable(),
    phone: z.string().min(1).nullable(),
    mailing_address_json: z.record(z.string(), z.unknown()).nullable(),
    notes_required_fields: z.array(z.string().min(1)),
    notes_required_documents: z.array(z.string().min(1)),
  })
  .superRefine((value, ctx) => {
    if (!value.complaint_url && !value.email && !value.phone && !value.mailing_address_json) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "destination intake must include at least one contact path",
      });
    }
  });

const destinationRuleSchema = z.object({
  id: z.string().uuid(),
  destination_id: z.string().uuid(),
  incident_categories_json: z.array(z.string().min(1)).min(1),
  business_types_json: z.array(z.string().min(1)).min(1),
  jurisdiction_rules_json: z.record(z.string(), z.unknown()),
  priority_weight: z.number().int().nonnegative(),
  exclusions_json: z.array(z.string().min(1)),
  reason_template: z.string().min(1),
});

const verificationRecordSchema = z.object({
  id: z.string().uuid(),
  destination_id: z.string().uuid(),
  source_url: z.url(),
  checked_at: z.string().datetime({ offset: true }),
  result: verificationResultSchema,
  change_summary: z.string(),
  checked_by: z.string().min(1),
  next_review_due: z.string().datetime({ offset: true }).nullable(),
});

const bundleEntrySchema = z
  .object({
    destination: destinationSchema,
    intakes: z.array(destinationIntakeSchema).min(1),
    rules: z.array(destinationRuleSchema).min(1),
    verification_records: z.array(verificationRecordSchema).min(1),
    source_files: z.array(z.string().min(1)).min(1),
    source_kinds: z.array(z.enum(["csv", "json"])).min(1),
    merged_from: z.number().int().positive(),
  })
  .superRefine((value, ctx) => {
    for (const intake of value.intakes) {
      if (intake.destination_id !== value.destination.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "intake destination_id must match destination.id",
        });
      }
    }
    for (const rule of value.rules) {
      if (rule.destination_id !== value.destination.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "rule destination_id must match destination.id",
        });
      }
    }
    for (const record of value.verification_records) {
      if (record.destination_id !== value.destination.id) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "verification destination_id must match destination.id",
        });
      }
    }
  });

const compiledBundleSchema = z.object({
  import_batch_id: z.string().min(1),
  generated_at: z.string().datetime({ offset: true }),
  source_files: z.array(z.string().min(1)),
  summary: z.object({
    destination_count: z.number().int().nonnegative(),
    intake_count: z.number().int().nonnegative(),
    rule_count: z.number().int().nonnegative(),
    verification_record_count: z.number().int().nonnegative(),
  }),
  destinations: z.array(bundleEntrySchema),
});

function parseCompiledBundle(raw: unknown): CompiledDestinationBundle {
  try {
    return compiledBundleSchema.parse(raw) as CompiledDestinationBundle;
  } catch (error) {
    throw new ValidationError("Compiled bundle validation failed.", error);
  }
}

export async function loadCompiledBundleFromPath(compiledBundlePath: string) {
  try {
    const raw = JSON.parse(await readFile(compiledBundlePath, "utf8"));
    return parseCompiledBundle(raw);
  } catch (error) {
    throw new ValidationError("Compiled bundle could not be read or parsed.", error);
  }
}

function runPythonImporter(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const process = spawn("python", args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd: fileURLToPath(new URL("../../../", import.meta.url)),
      env: processEnv(),
    });

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    process.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    process.on("error", reject);
    process.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new ValidationError("Seed compilation failed.", { code, stdout, stderr }));
    });
  });
}

function processEnv() {
  return { ...process.env };
}

export async function compileBundleFromSeedInputs(seedInputs: string[], importBatchId?: string) {
  if (seedInputs.length === 0) {
    throw new ValidationError("seed_inputs must not be empty.");
  }

  const outputDir = await mkdtemp(join(tmpdir(), "dossier-registry-import-"));
  try {
    const importerPath = fileURLToPath(new URL("../../../tools/routing_registry_importer.py", import.meta.url));
    const args = [importerPath, "--output-dir", outputDir];
    if (importBatchId) {
      args.push("--import-batch-id", importBatchId);
    }
    for (const input of seedInputs) {
      args.push("--input", input);
    }

    await runPythonImporter(args);
    return await loadCompiledBundleFromPath(join(outputDir, "routing_registry_compiled_bundle.json"));
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
}
