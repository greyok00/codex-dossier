import type {
  DraftPacket,
  ExtractContext,
  FactSet,
  ModelMetadata,
  RouteRecommendation,
  TranscriptDocument,
  TranscriptSegment,
} from "../contracts.js";

export type AIPurpose = "transcribe" | "extract" | "draft";

export interface AIUsageMetrics {
  input_audio_seconds?: number | null;
  input_characters?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
}

export interface ResolvedAudioUpload {
  filename: string;
  mime_type: string;
  size_bytes: number;
  content: Buffer;
}

export interface TranscribeProviderInput {
  audio: ResolvedAudioUpload;
  language_hint: string | null;
  include_timestamps: boolean;
}

export interface TranscribeProviderOutput {
  transcript: TranscriptDocument;
  model_metadata: ModelMetadata;
  warnings: string[];
}

export interface ExtractProviderInput {
  transcript: TranscriptDocument;
  context: ExtractContext;
}

export interface ExtractProviderOutput {
  fact_set: Omit<FactSet, "fact_set_id" | "reviewed_by_user">;
  model_metadata: ModelMetadata;
  warnings: string[];
}

export interface DraftProviderInput {
  fact_set: FactSet;
  selected_route: RouteRecommendation;
  transcript_excerpt: string | null;
  desired_tone: string;
}

export interface DraftProviderOutput {
  draft_packet: Omit<DraftPacket, "draft_packet_id" | "incident_id" | "destination_id" | "version" | "approved">;
  model_metadata: ModelMetadata;
  warnings: string[];
}

export interface AIProvider {
  transcribe(input: TranscribeProviderInput): Promise<TranscribeProviderOutput>;
  extract(input: ExtractProviderInput): Promise<ExtractProviderOutput>;
  draft(input: DraftProviderInput): Promise<DraftProviderOutput>;
}

export interface AudioUploadResolver {
  resolve(upload: import("../contracts.js").AudioUpload): Promise<ResolvedAudioUpload>;
}

export interface AIRequestLogInput extends AIUsageMetrics {
  user_id: string | null;
  client_incident_id: string | null;
  purpose: AIPurpose;
  model: string;
  request_id: string;
  requested_at: string;
}

export interface AIRequestLogCompletion extends AIUsageMetrics {
  completed_at: string;
  latency_ms: number;
}

export interface AIRequestLogFailure {
  completed_at: string;
  latency_ms: number;
  error_code: string;
}

export interface AITranscriptHeuristicsInput {
  text: string;
  audio_seconds: number | null;
  include_timestamps: boolean;
}

export interface ExtractStructuredOutput {
  incident_type: string | null;
  people: string[];
  places: string[];
  businesses: string[];
  phones: string[];
  dates: string[];
  amounts: string[];
  timeline: Array<{
    time_label: string;
    description: string;
  }>;
  key_facts: string[];
}

export interface DraftStructuredOutput {
  subject: string;
  body: string;
  attachments?: DraftPacket["attachments"];
}

export type AIRequestLogStatus = "requested" | "completed" | "failed";
export type AITranscriptSegment = TranscriptSegment;
