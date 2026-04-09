import type { Pool } from "pg";

import { withTransaction } from "../../db/pool.js";
import { DatabaseError, UnprocessableEntityError, ValidationError } from "../../lib/errors.js";
import type {
  DestinationDto,
  EmailPreview,
  EmailPreviewRequest,
  RecordActionRequest,
  SubmissionProof,
} from "../contracts.js";
import {
  emailPreviewRequestSchema,
  emailPreviewSchema,
  recordActionRequestSchema,
  submissionProofSchema,
} from "../contracts.js";
import type { RequestAuthContext } from "../auth/types.js";

interface DestinationEmailRow {
  destination_name: string;
  destination_type: string;
  source_url: string;
  last_verified_date: string;
  trust_level: EmailPreview["trust_level"];
  email: string | null;
}

interface InsertedActionRow {
  id: string;
  created_at: string;
}

export class SubmissionService {
  constructor(private readonly pool: Pool) {}

  async buildEmailPreview(auth: RequestAuthContext | null, rawRequest: unknown) {
    const request = parseRequest(emailPreviewRequestSchema, rawRequest, "Email preview request validation failed.");
    assertEmailPreviewConsistency(request);

    const recipients = await this.resolveRecipientEmails(request.selected_route.destination_id, request.selected_route.destination);
    const emailPreview = emailPreviewSchema.parse({
      to: recipients,
      cc: [],
      subject: request.draft_packet.subject,
      body: request.draft_packet.body,
      attachments: request.draft_packet.attachments,
      destination_name_snapshot: request.selected_route.destination_name_snapshot,
      destination_type_snapshot: request.selected_route.destination_type_snapshot,
      source_url: request.selected_route.source_url,
      last_verified_date: request.selected_route.last_verified_date,
      trust_level: request.selected_route.trust_level,
    });

    return {
      incident_id: request.incident_id,
      destination_id: request.selected_route.destination_id,
      email_preview: emailPreview,
    };
  }

  async recordAction(auth: RequestAuthContext | null, rawRequest: unknown) {
    const request = parseRequest(recordActionRequestSchema, rawRequest, "Submission action request validation failed.");
    assertRecordActionConsistency(request);

    try {
      const client = await this.pool.connect();
      try {
        return await withTransaction(client, async () => {
          if (request.selected_route.destination_id) {
            await this.assertDestinationExists(request.selected_route.destination_id, client);
          }

          const insertResult = await client.query<InsertedActionRow>(
            `
              INSERT INTO dossier_backend.submission_action_record (
                user_id,
                client_incident_id,
                submission_proof_id,
                destination_id,
                destination_name_snapshot,
                destination_type_snapshot,
                source_url,
                last_verified_date,
                trust_level,
                method,
                status,
                confirmation_number,
                external_reference_url,
                notes,
                attachments_json,
                custody_event_json
              )
              VALUES (
                $1::uuid,
                $2::uuid,
                $3::uuid,
                $4::uuid,
                $5,
                $6,
                $7,
                $8::date,
                $9::dossier_enum.trust_level_enum,
                $10::dossier_enum.submission_method_enum,
                $11::dossier_enum.submission_status_enum,
                $12,
                $13,
                $14,
                $15::jsonb,
                $16::jsonb
              )
              RETURNING id, created_at::text AS created_at
            `,
            [
              auth?.user.id ?? null,
              request.submission_proof.incident_id,
              request.submission_proof.submission_proof_id,
              request.selected_route.destination_id,
              request.selected_route.destination_name_snapshot,
              request.selected_route.destination_type_snapshot,
              request.selected_route.source_url,
              request.selected_route.last_verified_date,
              request.selected_route.trust_level,
              request.submission_proof.method,
              request.submission_proof.status,
              request.submission_proof.confirmation_number,
              request.submission_proof.external_reference_url,
              request.submission_proof.notes,
              JSON.stringify(request.submission_proof.attachments),
              JSON.stringify(request.custody_event),
            ],
          );

          const inserted = insertResult.rows[0];
          if (!inserted) {
            throw new DatabaseError("Submission action insert did not return a server reference.");
          }

          return {
            submission_proof: submissionProofSchema.parse(request.submission_proof),
            destination_source: {
              destination_id: request.selected_route.destination_id,
              destination_name_snapshot: request.selected_route.destination_name_snapshot,
              destination_type_snapshot: request.selected_route.destination_type_snapshot,
              source_url: request.selected_route.source_url,
              last_verified_date: request.selected_route.last_verified_date,
              trust_level: request.selected_route.trust_level,
            },
            recorded_at: new Date(inserted.created_at).toISOString(),
            server_reference_id: inserted.id,
          };
        });
      } finally {
        client.release();
      }
    } catch (error) {
      if (error instanceof ValidationError || error instanceof UnprocessableEntityError) {
        throw error;
      }
      throw new DatabaseError("Submission action recording failed.", error);
    }
  }

  private async resolveRecipientEmails(destinationId: string | null, destination: DestinationDto | null) {
    const emails = new Set<string>();
    if (destination?.email) {
      emails.add(destination.email);
    }

    if (!destinationId) {
      return [...emails];
    }

    const destinationResult = await this.pool.query<DestinationEmailRow>(
      `
        SELECT
          d.destination_name,
          d.destination_type,
          d.source_url,
          d.last_verified_date::text,
          d.trust_level,
          di.email
        FROM dossier_backend.destination d
        LEFT JOIN dossier_backend.destination_intake di
          ON di.destination_id = d.id
        WHERE d.id = $1::uuid
      `,
      [destinationId],
    );

    if (destinationResult.rowCount === 0) {
      throw new UnprocessableEntityError("Selected route destination was not found.", {
        destination_id: destinationId,
      });
    }

    for (const row of destinationResult.rows) {
      if (row.email) {
        emails.add(row.email);
      }
    }

    return [...emails];
  }

  private async assertDestinationExists(destinationId: string, db: Pool | { query: Pool["query"] }) {
    const result = await db.query<{ id: string }>(
      `
        SELECT id
        FROM dossier_backend.destination
        WHERE id = $1::uuid
      `,
      [destinationId],
    );

    if (result.rowCount === 0) {
      throw new UnprocessableEntityError("Selected route destination was not found.", {
        destination_id: destinationId,
      });
    }
  }
}

function parseRequest<T>(schema: { parse(input: unknown): T }, rawRequest: unknown, message: string) {
  try {
    return schema.parse(rawRequest);
  } catch (error) {
    throw new ValidationError(message, error);
  }
}

function assertEmailPreviewConsistency(request: EmailPreviewRequest) {
  if (request.draft_packet.incident_id !== request.incident_id) {
    throw new UnprocessableEntityError("Draft packet incident does not match the requested incident.", {
      incident_id: request.incident_id,
      draft_packet_incident_id: request.draft_packet.incident_id,
    });
  }

  if (request.draft_packet.destination_id !== request.selected_route.destination_id) {
    throw new UnprocessableEntityError("Draft packet destination does not match the selected route.", {
      draft_packet_destination_id: request.draft_packet.destination_id,
      selected_route_destination_id: request.selected_route.destination_id,
    });
  }
}

function assertRecordActionConsistency(request: RecordActionRequest) {
  if (request.submission_proof.destination_id !== request.selected_route.destination_id) {
    throw new UnprocessableEntityError("Submission proof destination does not match the selected route.", {
      submission_proof_destination_id: request.submission_proof.destination_id,
      selected_route_destination_id: request.selected_route.destination_id,
    });
  }

  switch (request.custody_event.details_json.event) {
    case "send_action_recorded":
      assertSendActionMatchesProof(request.submission_proof, request.custody_event.details_json);
      break;
    case "proof_saved":
      assertProofSavedMatchesProof(request.submission_proof, request.custody_event.details_json);
      break;
    default:
      break;
  }
}

function assertSendActionMatchesProof(
  submissionProof: SubmissionProof,
  details: Extract<RecordActionRequest["custody_event"]["details_json"], { event: "send_action_recorded" }>,
) {
  if (details.submission_proof_id && details.submission_proof_id !== submissionProof.submission_proof_id) {
    throw new UnprocessableEntityError("Send action details do not match the submission proof.", {
      submission_proof_id: submissionProof.submission_proof_id,
      details_submission_proof_id: details.submission_proof_id,
    });
  }

  if (
    details.destination_id !== submissionProof.destination_id ||
    details.method !== submissionProof.method ||
    details.status !== submissionProof.status ||
    details.external_reference_url !== submissionProof.external_reference_url
  ) {
    throw new UnprocessableEntityError("Send action details do not match the submission proof.", {
      submission_proof: submissionProof,
      details,
    });
  }
}

function assertProofSavedMatchesProof(
  submissionProof: SubmissionProof,
  details: Extract<RecordActionRequest["custody_event"]["details_json"], { event: "proof_saved" }>,
) {
  if (
    details.submission_proof_id !== submissionProof.submission_proof_id ||
    details.destination_id !== submissionProof.destination_id ||
    details.method !== submissionProof.method ||
    details.status !== submissionProof.status ||
    details.confirmation_number !== submissionProof.confirmation_number ||
    details.external_reference_url !== submissionProof.external_reference_url ||
    details.attachment_count !== submissionProof.attachments.length
  ) {
    throw new UnprocessableEntityError("Proof details do not match the submission proof.", {
      submission_proof: submissionProof,
      details,
    });
  }
}
