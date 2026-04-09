import { randomUUID } from "node:crypto";

import type { Pool, PoolClient } from "pg";
import { z } from "zod";

import { DatabaseError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { withTransaction } from "../../db/pool.js";
import { compileBundleFromSeedInputs, loadCompiledBundleFromPath } from "./bundle-loader.js";
import { getRegistryVersion } from "./version-service.js";
import type {
  CompiledDestinationBundle,
  CompiledDestinationBundleEntry,
  RegistryImportSummary,
  RegistryVerifySummary,
  VerificationResult,
} from "./types.js";

const importRequestSchema = z
  .object({
    compiled_bundle_path: z.string().min(1).optional(),
    seed_inputs: z.array(z.string().min(1)).min(1).optional(),
    import_batch_id: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const hasBundle = Boolean(value.compiled_bundle_path);
    const hasSeeds = Boolean(value.seed_inputs && value.seed_inputs.length > 0);
    if (hasBundle === hasSeeds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide exactly one of compiled_bundle_path or seed_inputs.",
      });
    }
  });

const verifyRequestSchema = z.object({
  destination_id: z.string().uuid(),
  source_url: z.url(),
  checked_at: z.string().datetime({ offset: true }),
  result: z.enum(["verified", "changed", "failed", "unreachable", "skipped"]),
  change_summary: z.string().default(""),
  checked_by: z.string().min(1),
  next_review_due: z.string().datetime({ offset: true }).nullable().optional(),
});

export type ImportRequest = z.infer<typeof importRequestSchema>;
export type VerifyRequest = z.infer<typeof verifyRequestSchema>;

export class RoutingRegistryImportService {
  constructor(private readonly pool: Pool) {}

  async importFromRequest(rawRequest: unknown): Promise<RegistryImportSummary> {
    let request: ImportRequest;
    try {
      request = importRequestSchema.parse(rawRequest);
    } catch (error) {
      throw new ValidationError("Import request validation failed.", error);
    }

    const bundle = request.compiled_bundle_path
      ? await loadCompiledBundleFromPath(request.compiled_bundle_path)
      : await compileBundleFromSeedInputs(request.seed_inputs ?? [], request.import_batch_id);

    return this.importCompiledBundle(bundle, request.compiled_bundle_path ? "compiled_bundle" : "seed_inputs");
  }

  async importCompiledBundle(bundle: CompiledDestinationBundle, sourceKind: "compiled_bundle" | "seed_inputs"): Promise<RegistryImportSummary> {
    const client = await this.pool.connect();
    try {
      const summary = await withTransaction(client, async () => {
        for (const item of bundle.destinations) {
          await this.upsertDestination(client, item);
        }

        const registryVersion = await getRegistryVersion(client);
        return {
          import_batch_id: bundle.import_batch_id,
          source_kind: sourceKind,
          source_files: bundle.source_files,
          accepted: {
            destinations: bundle.summary.destination_count,
            intakes: bundle.summary.intake_count,
            rules: bundle.summary.rule_count,
            verification_records: bundle.summary.verification_record_count,
          },
          skipped: {
            destinations: 0,
            intakes: 0,
            rules: 0,
            verification_records: 0,
          },
          rejected: {
            destinations: 0,
            intakes: 0,
            rules: 0,
            verification_records: 0,
          },
          registry_version: registryVersion,
        } satisfies RegistryImportSummary;
      });

      return summary;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new DatabaseError("Routing registry import failed.", error);
    } finally {
      client.release();
    }
  }

  async verifyDestination(rawRequest: unknown): Promise<RegistryVerifySummary> {
    let request: VerifyRequest;
    try {
      request = verifyRequestSchema.parse(rawRequest);
    } catch (error) {
      throw new ValidationError("Verification request validation failed.", error);
    }

    const client = await this.pool.connect();
    try {
      return await withTransaction(client, async () => {
        const destination = await client.query<{ id: string; last_verified_date: string }>(
          `
            SELECT id, last_verified_date::text
            FROM dossier_backend.destination
            WHERE id = $1::uuid
          `,
          [request.destination_id],
        );
        if (destination.rowCount !== 1) {
          throw new NotFoundError("Destination not found.", { destination_id: request.destination_id });
        }

        const verificationRecordId = randomUUID();
        await client.query(
          `
            INSERT INTO dossier_backend.verification_record (
              id,
              destination_id,
              source_url,
              checked_at,
              result,
              change_summary,
              checked_by,
              next_review_due
            )
            VALUES ($1::uuid, $2::uuid, $3, $4::timestamptz, $5, $6, $7, $8::timestamptz)
          `,
          [
            verificationRecordId,
            request.destination_id,
            request.source_url,
            request.checked_at,
            request.result,
            request.change_summary,
            request.checked_by,
            request.next_review_due ?? null,
          ],
        );

        if (isPositiveVerification(request.result)) {
          await client.query(
            `
              UPDATE dossier_backend.destination
              SET
                last_verified_date = GREATEST(last_verified_date, ($2::timestamptz)::date),
                updated_at = now()
              WHERE id = $1::uuid
            `,
            [request.destination_id, request.checked_at],
          );
        }

        const registryVersion = await getRegistryVersion(client);
        return {
          verification_record_id: verificationRecordId,
          destination_id: request.destination_id,
          registry_version: registryVersion,
        };
      });
    } catch (error) {
      if (error instanceof ValidationError || error instanceof NotFoundError) {
        throw error;
      }
      throw new DatabaseError("Registry verification write failed.", error);
    } finally {
      client.release();
    }
  }

  private async upsertDestination(client: PoolClient, item: CompiledDestinationBundleEntry) {
    await client.query(
      `
        INSERT INTO dossier_backend.destination (
          id,
          destination_name,
          destination_type,
          jurisdiction_country,
          jurisdiction_state,
          jurisdiction_county,
          jurisdiction_city,
          categories_handled_json,
          source_url,
          last_verified_date,
          trust_level,
          status
        )
        VALUES ($1::uuid, $2, $3::dossier_enum.destination_type_enum, $4, $5, $6, $7, $8::jsonb, $9, $10::date, $11::dossier_enum.trust_level_enum, $12)
        ON CONFLICT (id) DO UPDATE SET
          destination_name = EXCLUDED.destination_name,
          destination_type = EXCLUDED.destination_type,
          jurisdiction_country = EXCLUDED.jurisdiction_country,
          jurisdiction_state = EXCLUDED.jurisdiction_state,
          jurisdiction_county = EXCLUDED.jurisdiction_county,
          jurisdiction_city = EXCLUDED.jurisdiction_city,
          categories_handled_json = EXCLUDED.categories_handled_json,
          source_url = EXCLUDED.source_url,
          last_verified_date = EXCLUDED.last_verified_date,
          trust_level = EXCLUDED.trust_level,
          status = EXCLUDED.status,
          updated_at = now()
      `,
      [
        item.destination.id,
        item.destination.destination_name,
        item.destination.destination_type,
        item.destination.jurisdiction_country,
        item.destination.jurisdiction_state,
        item.destination.jurisdiction_county,
        item.destination.jurisdiction_city,
        JSON.stringify(item.destination.categories_handled_json),
        item.destination.source_url,
        item.destination.last_verified_date,
        item.destination.trust_level,
        item.destination.status,
      ],
    );

    for (const intake of item.intakes) {
      await client.query(
        `
          INSERT INTO dossier_backend.destination_intake (
            id,
            destination_id,
            intake_method,
            complaint_url,
            email,
            phone,
            mailing_address_json,
            notes_required_fields,
            notes_required_documents
          )
          VALUES ($1::uuid, $2::uuid, $3::dossier_enum.intake_method_enum, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb)
          ON CONFLICT (id) DO UPDATE SET
            destination_id = EXCLUDED.destination_id,
            intake_method = EXCLUDED.intake_method,
            complaint_url = EXCLUDED.complaint_url,
            email = EXCLUDED.email,
            phone = EXCLUDED.phone,
            mailing_address_json = EXCLUDED.mailing_address_json,
            notes_required_fields = EXCLUDED.notes_required_fields,
            notes_required_documents = EXCLUDED.notes_required_documents,
            updated_at = now()
        `,
        [
          intake.id,
          intake.destination_id,
          intake.intake_method,
          intake.complaint_url,
          intake.email,
          intake.phone,
          intake.mailing_address_json === null ? null : JSON.stringify(intake.mailing_address_json),
          JSON.stringify(intake.notes_required_fields),
          JSON.stringify(intake.notes_required_documents),
        ],
      );
    }

    for (const rule of item.rules) {
      await client.query(
        `
          INSERT INTO dossier_backend.destination_rule (
            id,
            destination_id,
            incident_categories_json,
            business_types_json,
            jurisdiction_rules_json,
            priority_weight,
            exclusions_json,
            reason_template
          )
          VALUES ($1::uuid, $2::uuid, $3::jsonb, $4::jsonb, $5::jsonb, $6, $7::jsonb, $8)
          ON CONFLICT (id) DO UPDATE SET
            destination_id = EXCLUDED.destination_id,
            incident_categories_json = EXCLUDED.incident_categories_json,
            business_types_json = EXCLUDED.business_types_json,
            jurisdiction_rules_json = EXCLUDED.jurisdiction_rules_json,
            priority_weight = EXCLUDED.priority_weight,
            exclusions_json = EXCLUDED.exclusions_json,
            reason_template = EXCLUDED.reason_template,
            updated_at = now()
        `,
        [
          rule.id,
          rule.destination_id,
          JSON.stringify(rule.incident_categories_json),
          JSON.stringify(rule.business_types_json),
          JSON.stringify(rule.jurisdiction_rules_json),
          rule.priority_weight,
          JSON.stringify(rule.exclusions_json),
          rule.reason_template,
        ],
      );
    }

    for (const verificationRecord of item.verification_records) {
      await client.query(
        `
          INSERT INTO dossier_backend.verification_record (
            id,
            destination_id,
            source_url,
            checked_at,
            result,
            change_summary,
            checked_by,
            next_review_due
          )
          VALUES ($1::uuid, $2::uuid, $3, $4::timestamptz, $5, $6, $7, $8::timestamptz)
          ON CONFLICT (id) DO UPDATE SET
            destination_id = EXCLUDED.destination_id,
            source_url = EXCLUDED.source_url,
            checked_at = EXCLUDED.checked_at,
            result = EXCLUDED.result,
            change_summary = EXCLUDED.change_summary,
            checked_by = EXCLUDED.checked_by,
            next_review_due = EXCLUDED.next_review_due
        `,
        [
          verificationRecord.id,
          verificationRecord.destination_id,
          verificationRecord.source_url,
          verificationRecord.checked_at,
          verificationRecord.result,
          verificationRecord.change_summary,
          verificationRecord.checked_by,
          verificationRecord.next_review_due,
        ],
      );
    }
  }
}

function isPositiveVerification(result: VerificationResult) {
  return result === "verified" || result === "changed";
}
