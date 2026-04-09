import OpenAI, { toFile } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { ServiceUnavailableError } from "../../lib/errors.js";
import {
  draftPacketSchema,
  extractContextSchema,
  factSetSchema,
  modelMetadataSchema,
  routeRecommendationSchema,
  transcriptDocumentSchema,
  transcriptSegmentSchema,
  type ExtractContext,
  type FactSet,
  type RouteRecommendation,
  type TranscriptDocument,
  type TranscriptSegment,
} from "../contracts.js";
import type {
  AIProvider,
  AITranscriptHeuristicsInput,
  DraftProviderInput,
  DraftProviderOutput,
  DraftStructuredOutput,
  ExtractProviderInput,
  ExtractProviderOutput,
  ExtractStructuredOutput,
  TranscribeProviderInput,
  TranscribeProviderOutput,
} from "./types.js";

const extractOutputSchema = z
  .object({
    incident_type: z.string().nullable(),
    people: z.array(z.string()),
    places: z.array(z.string()),
    businesses: z.array(z.string()),
    phones: z.array(z.string()),
    dates: z.array(z.string()),
    amounts: z.array(z.string()),
    timeline: z.array(
      z
        .object({
          time_label: z.string(),
          description: z.string(),
        })
        .strict(),
    ),
    key_facts: z.array(z.string()),
  })
  .strict();

const draftOutputSchema = z
  .object({
    subject: z.string(),
    body: z.string(),
    attachments: z
      .array(
        z
          .object({
            evidence_id: z.string().uuid(),
            label: z.string(),
            mime_type: z.string(),
            sha256: z.string(),
          })
          .strict(),
      )
      .optional(),
  })
  .strict();

export class OpenAIAIProvider implements AIProvider {
  private readonly client: OpenAI;
  private readonly transcribeModel: string;
  private readonly extractModel: string;
  private readonly draftModel: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableError("OpenAI is not configured.");
    }

    this.client = new OpenAI({
      apiKey,
      organization: process.env.OPENAI_ORGANIZATION,
      project: process.env.OPENAI_PROJECT,
    });
    this.transcribeModel = process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-transcribe";
    this.extractModel = process.env.OPENAI_EXTRACT_MODEL ?? "gpt-5.1-mini";
    this.draftModel = process.env.OPENAI_DRAFT_MODEL ?? process.env.OPENAI_EXTRACT_MODEL ?? "gpt-5.1-mini";
  }

  async transcribe(input: TranscribeProviderInput): Promise<TranscribeProviderOutput> {
    const requestedAt = new Date().toISOString();
    const audioFile = await toFile(input.audio.content, input.audio.filename, {
      type: input.audio.mime_type,
    });
    const transcriptionRequest = {
      file: audioFile,
      model: this.transcribeModel,
      response_format: "json",
      ...(input.language_hint ? { language: input.language_hint } : {}),
    } as const;

    const response = await this.client.audio.transcriptions.create(transcriptionRequest);

    const completedAt = new Date().toISOString();
    const usage = response.usage;
    const inputAudioSeconds = usage && "seconds" in usage ? usage.seconds : null;
    const transcript = transcriptDocumentSchema.parse({
      full_text: response.text,
      language: input.language_hint ?? null,
      segment_count: 0,
      segments: buildTranscriptSegments({
        text: response.text,
        audio_seconds: inputAudioSeconds,
        include_timestamps: input.include_timestamps,
      }),
    });

    return {
      transcript: {
        ...transcript,
        segment_count: transcript.segments.length,
      },
      model_metadata: modelMetadataSchema.parse({
        provider: "openai",
        model: this.transcribeModel,
        purpose: "transcribe",
        requested_at: requestedAt,
        completed_at: completedAt,
        latency_ms: elapsedMs(requestedAt, completedAt),
        input_audio_seconds: inputAudioSeconds,
        input_characters: null,
        input_tokens: usage && "input_tokens" in usage ? usage.input_tokens : null,
        output_tokens: usage && "output_tokens" in usage ? usage.output_tokens : null,
      }),
      warnings: input.include_timestamps ? ["Segment timestamps were estimated from the transcript output."] : [],
    };
  }

  async extract(input: ExtractProviderInput): Promise<ExtractProviderOutput> {
    const requestedAt = new Date().toISOString();
    const parsed = await this.client.responses.parse({
      model: this.extractModel,
      input: buildExtractPrompt(input.transcript, input.context),
      text: {
        format: zodTextFormat(extractOutputSchema, "dossier_extract"),
      },
    });
    const completedAt = new Date().toISOString();

    const structured = extractOutputSchema.parse(parsed.output_parsed);
    return {
      fact_set: toExtractFactSet(structured),
      model_metadata: modelMetadataSchema.parse({
        provider: "openai",
        model: this.extractModel,
        purpose: "extract",
        requested_at: requestedAt,
        completed_at: completedAt,
        latency_ms: elapsedMs(requestedAt, completedAt),
        input_characters: input.transcript.full_text.length,
        input_tokens: parsed.usage?.input_tokens ?? null,
        output_tokens: parsed.usage?.output_tokens ?? null,
        input_audio_seconds: null,
      }),
      warnings: [],
    };
  }

  async draft(input: DraftProviderInput): Promise<DraftProviderOutput> {
    const requestedAt = new Date().toISOString();
    const parsed = await this.client.responses.parse({
      model: this.draftModel,
      input: buildDraftPrompt(input.fact_set, input.selected_route, input.transcript_excerpt, input.desired_tone),
      text: {
        format: zodTextFormat(draftOutputSchema, "dossier_draft"),
      },
    });
    const completedAt = new Date().toISOString();

    const structured = draftOutputSchema.parse(parsed.output_parsed);
    return {
      draft_packet: {
        subject: structured.subject,
        body: structured.body,
        attachments: structured.attachments ?? [],
      },
      model_metadata: modelMetadataSchema.parse({
        provider: "openai",
        model: this.draftModel,
        purpose: "draft",
        requested_at: requestedAt,
        completed_at: completedAt,
        latency_ms: elapsedMs(requestedAt, completedAt),
        input_characters: JSON.stringify({
          fact_set: input.fact_set,
          selected_route: input.selected_route,
          transcript_excerpt: input.transcript_excerpt,
          desired_tone: input.desired_tone,
        }).length,
        input_tokens: parsed.usage?.input_tokens ?? null,
        output_tokens: parsed.usage?.output_tokens ?? null,
        input_audio_seconds: null,
      }),
      warnings: [],
    };
  }
}

export function createDefaultAIProvider(): AIProvider {
  try {
    return new OpenAIAIProvider();
  } catch (error) {
    if (error instanceof ServiceUnavailableError) {
      return {
        async transcribe() {
          throw error;
        },
        async extract() {
          throw error;
        },
        async draft() {
          throw error;
        },
      };
    }
    throw error;
  }
}

function buildTranscriptSegments(input: AITranscriptHeuristicsInput): TranscriptSegment[] {
  const text = input.text.trim();
  if (!text) {
    return [];
  }

  const parts = text
    .split(/(?<=[.!?])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const segments = parts.length > 0 ? parts : [text];

  if (!input.include_timestamps) {
    return segments.map((segment) =>
      transcriptSegmentSchema.parse({
        start_ms: 0,
        end_ms: 0,
        speaker_label: null,
        text: segment,
        confidence: null,
      }),
    );
  }

  const totalMs = Math.max(
    1000,
    Math.round((input.audio_seconds ?? estimateAudioSeconds(text)) * 1000),
  );
  let startMs = 0;
  const totalChars = segments.reduce((sum, segment) => sum + segment.length, 0);

  return segments.map((segment, index) => {
    const segmentMs =
      index === segments.length - 1
        ? totalMs - startMs
        : Math.max(500, Math.round((segment.length / Math.max(totalChars, 1)) * totalMs));
    const endMs = Math.min(totalMs, startMs + segmentMs);
    const parsed = transcriptSegmentSchema.parse({
      start_ms: startMs,
      end_ms: endMs,
      speaker_label: null,
      text: segment,
      confidence: null,
    });
    startMs = endMs;
    return parsed;
  });
}

function estimateAudioSeconds(text: string) {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, words / 2.6);
}

function buildExtractPrompt(transcript: TranscriptDocument, context: ExtractContext) {
  return [
    {
      role: "system" as const,
      content:
        "Extract only source-backed facts from the transcript. Do not invent details. Use short plain strings. If a field is unknown, use null or an empty array. Keep timeline entries chronological. Use one internal incident type if clearly supported by the transcript, otherwise null.",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        transcript,
        context: extractContextSchema.parse(context),
      }),
    },
  ];
}

function buildDraftPrompt(
  factSet: FactSet,
  selectedRoute: RouteRecommendation,
  transcriptExcerpt: string | null,
  desiredTone: string,
) {
  return [
    {
      role: "system" as const,
      content:
        "Write a clear report in plain serious language. Stay close to the supplied facts. Do not add claims that are not supported. Use a concise subject line and a direct report body suited to the selected route.",
    },
    {
      role: "user" as const,
      content: JSON.stringify({
        desired_tone: desiredTone,
        fact_set: factSetSchema.parse(factSet),
        selected_route: routeRecommendationSchema.parse(selectedRoute),
        transcript_excerpt: transcriptExcerpt,
      }),
    },
  ];
}

function toExtractFactSet(structured: ExtractStructuredOutput): Omit<FactSet, "fact_set_id" | "reviewed_by_user"> {
  return {
    incident_type: structured.incident_type,
    people: structured.people,
    places: structured.places,
    businesses: structured.businesses,
    phones: structured.phones,
    dates: structured.dates,
    amounts: structured.amounts,
    timeline: structured.timeline,
    key_facts: structured.key_facts,
  };
}

function elapsedMs(requestedAt: string, completedAt: string) {
  return Math.max(0, Date.parse(completedAt) - Date.parse(requestedAt));
}
