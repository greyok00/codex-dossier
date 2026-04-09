import { randomUUID } from "node:crypto";

import type { Pool } from "pg";

import { AppError, DatabaseError, ValidationError } from "../../lib/errors.js";
import type {
  DraftPacket,
  DraftRequest,
  ExtractRequest,
  FactSet,
  ModelMetadata,
  TranscriptDocument,
  TranscribeRequest,
} from "../contracts.js";
import {
  draftPacketSchema,
  draftRequestSchema,
  extractRequestSchema,
  factSetSchema,
  modelMetadataSchema,
  transcriptDocumentSchema,
  transcribeRequestSchema,
} from "../contracts.js";
import type { RequestAuthContext } from "../auth/types.js";
import type {
  AIProvider,
  AIRequestLogCompletion,
  AIRequestLogFailure,
  AIRequestLogInput,
  AudioUploadResolver,
} from "./types.js";

export class AIService {
  constructor(
    private readonly pool: Pool,
    private readonly aiProvider: AIProvider,
    private readonly audioUploadResolver: AudioUploadResolver,
  ) {}

  async transcribe(auth: RequestAuthContext | null, rawRequest: unknown) {
    const request = parseRequest(transcribeRequestSchema, rawRequest, "Transcribe request validation failed.");

    const audio = await this.audioUploadResolver.resolve(request.upload);
    const requestLog = createLogStart({
      auth,
      incidentId: request.incident_id,
      purpose: "transcribe",
      model: process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-transcribe",
      input_audio_seconds: null,
    });
    await this.insertRequestedLog(requestLog);

    try {
      const result = await this.aiProvider.transcribe({
        audio,
        language_hint: request.language_hint ?? null,
        include_timestamps: request.include_timestamps,
      });

      const transcriptEvidenceId = randomUUID();
      const transcript = transcriptDocumentSchema.parse(result.transcript);
      const modelMetadata = modelMetadataSchema.parse(result.model_metadata);
      await this.completeLog(requestLog.request_id, mergeCompletion(modelMetadata));

      return {
        incident_id: request.incident_id,
        source_evidence_id: request.source_evidence_id,
        transcript_evidence_id: transcriptEvidenceId,
        transcript,
        model_metadata: modelMetadata,
        warnings: result.warnings,
      };
    } catch (error) {
      await this.failLog(requestLog.request_id, failureFromError(error));
      throw normalizeServiceError("Transcription failed.", error);
    }
  }

  async extract(auth: RequestAuthContext | null, rawRequest: unknown) {
    const request = parseRequest(extractRequestSchema, rawRequest, "Extract request validation failed.");

    const requestLog = createLogStart({
      auth,
      incidentId: request.incident_id,
      purpose: "extract",
      model: process.env.OPENAI_EXTRACT_MODEL ?? "gpt-5.1-mini",
      input_characters: request.transcript.full_text.length,
    });
    await this.insertRequestedLog(requestLog);

    try {
      const result = await this.aiProvider.extract({
        transcript: request.transcript,
        context: request.context,
      });

      const factSet: FactSet = factSetSchema.parse({
        fact_set_id: randomUUID(),
        ...result.fact_set,
        reviewed_by_user: false,
      });
      const modelMetadata = modelMetadataSchema.parse(result.model_metadata);
      await this.completeLog(requestLog.request_id, mergeCompletion(modelMetadata));

      return {
        incident_id: request.incident_id,
        transcript_evidence_id: request.transcript_evidence_id,
        fact_set: factSet,
        model_metadata: modelMetadata,
        warnings: result.warnings,
      };
    } catch (error) {
      await this.failLog(requestLog.request_id, failureFromError(error));
      throw normalizeServiceError("Fact extraction failed.", error);
    }
  }

  async draft(auth: RequestAuthContext | null, rawRequest: unknown) {
    const request = parseRequest(draftRequestSchema, rawRequest, "Draft request validation failed.");

    const requestLog = createLogStart({
      auth,
      incidentId: request.incident_id,
      purpose: "draft",
      model: process.env.OPENAI_DRAFT_MODEL ?? process.env.OPENAI_EXTRACT_MODEL ?? "gpt-5.1-mini",
      input_characters: JSON.stringify({
        fact_set: request.fact_set,
        selected_route: request.selected_route,
        transcript_excerpt: request.transcript_excerpt ?? null,
        desired_tone: request.desired_tone,
      }).length,
    });
    await this.insertRequestedLog(requestLog);

    try {
      const result = await this.aiProvider.draft({
        fact_set: request.fact_set,
        selected_route: request.selected_route,
        transcript_excerpt: request.transcript_excerpt ?? null,
        desired_tone: request.desired_tone,
      });

      const draftPacket: DraftPacket = draftPacketSchema.parse({
        draft_packet_id: randomUUID(),
        incident_id: request.incident_id,
        destination_id: request.selected_route.destination_id,
        subject: result.draft_packet.subject,
        body: result.draft_packet.body,
        attachments: result.draft_packet.attachments ?? [],
        version: 1,
        approved: false,
      });
      const modelMetadata = modelMetadataSchema.parse(result.model_metadata);
      await this.completeLog(requestLog.request_id, mergeCompletion(modelMetadata));

      return {
        incident_id: request.incident_id,
        selected_route: request.selected_route,
        draft_packet: draftPacket,
        model_metadata: modelMetadata,
        warnings: result.warnings,
      };
    } catch (error) {
      await this.failLog(requestLog.request_id, failureFromError(error));
      throw normalizeServiceError("Draft generation failed.", error);
    }
  }

  private async insertRequestedLog(input: AIRequestLogInput) {
    try {
      await this.pool.query(
        `
          INSERT INTO dossier_backend.ai_request_log (
            id,
            user_id,
            client_incident_id,
            purpose,
            provider,
            model,
            request_id,
            requested_at,
            input_audio_seconds,
            input_characters,
            input_tokens,
            output_tokens,
            status,
            error_code
          )
          VALUES (
            gen_random_uuid(),
            $1::uuid,
            $2::uuid,
            $3::dossier_enum.ai_purpose_enum,
            'openai',
            $4,
            $5,
            $6::timestamptz,
            $7,
            $8,
            $9,
            $10,
            'requested',
            NULL
          )
        `,
        [
          input.user_id,
          input.client_incident_id,
          input.purpose,
          input.model,
          input.request_id,
          input.requested_at,
          input.input_audio_seconds ?? null,
          input.input_characters ?? null,
          input.input_tokens ?? null,
          input.output_tokens ?? null,
        ],
      );
    } catch (error) {
      throw new DatabaseError("AI request log insert failed.", error);
    }
  }

  private async completeLog(requestId: string, input: AIRequestLogCompletion) {
    try {
      await this.pool.query(
        `
          UPDATE dossier_backend.ai_request_log
          SET
            completed_at = $2::timestamptz,
            latency_ms = $3,
            input_audio_seconds = COALESCE($4, input_audio_seconds),
            input_characters = COALESCE($5, input_characters),
            input_tokens = COALESCE($6, input_tokens),
            output_tokens = COALESCE($7, output_tokens),
            status = 'completed',
            error_code = NULL
          WHERE request_id = $1
        `,
        [
          requestId,
          input.completed_at,
          input.latency_ms,
          input.input_audio_seconds ?? null,
          input.input_characters ?? null,
          input.input_tokens ?? null,
          input.output_tokens ?? null,
        ],
      );
    } catch (error) {
      throw new DatabaseError("AI request log completion update failed.", error);
    }
  }

  private async failLog(requestId: string, input: AIRequestLogFailure) {
    try {
      await this.pool.query(
        `
          UPDATE dossier_backend.ai_request_log
          SET
            completed_at = $2::timestamptz,
            latency_ms = $3,
            status = 'failed',
            error_code = $4
          WHERE request_id = $1
        `,
        [requestId, input.completed_at, input.latency_ms, input.error_code],
      );
    } catch {
      // Do not mask the original AI failure if log finalization also fails.
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

function createLogStart(input: {
  auth: RequestAuthContext | null;
  incidentId: string;
  purpose: AIRequestLogInput["purpose"];
  model: string;
  input_audio_seconds?: number | null;
  input_characters?: number | null;
}) {
  return {
    user_id: input.auth?.user.id ?? null,
    client_incident_id: input.incidentId,
    purpose: input.purpose,
    model: input.model,
    request_id: randomUUID(),
    requested_at: new Date().toISOString(),
    input_audio_seconds: input.input_audio_seconds ?? null,
    input_characters: input.input_characters ?? null,
    input_tokens: null,
    output_tokens: null,
  } satisfies AIRequestLogInput;
}

function mergeCompletion(modelMetadata: ModelMetadata): AIRequestLogCompletion {
  return {
    completed_at: modelMetadata.completed_at,
    latency_ms: modelMetadata.latency_ms,
    input_audio_seconds: modelMetadata.input_audio_seconds ?? null,
    input_characters: modelMetadata.input_characters ?? null,
    input_tokens: modelMetadata.input_tokens ?? null,
    output_tokens: modelMetadata.output_tokens ?? null,
  };
}

function failureFromError(error: unknown): AIRequestLogFailure {
  const completedAt = new Date().toISOString();
  return {
    completed_at: completedAt,
    latency_ms: 0,
    error_code: error instanceof Error ? error.name : "UNKNOWN_ERROR",
  };
}

function normalizeServiceError(message: string, error: unknown) {
  if (error instanceof ValidationError || error instanceof AppError) {
    return error;
  }
  return new DatabaseError(message, error);
}
