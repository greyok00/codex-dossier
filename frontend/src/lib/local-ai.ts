import { buildDeterministicRouteRecommendations } from "./local-routing";
import type { FactTimelineItemRecord, RouteGroup, RouteTrustLevel } from "./db";
import type {
  ApiClient,
  FactSetDto,
  LocalAiPreparationResult,
  LocalAiProgressEvent,
  ModelMetadata,
  RouteRecommendationDto,
  TranscriptDocument,
  TranscriptSegment,
} from "./runtime";
import { FrontendRuntimeError } from "./runtime";
import ortWasmMjsUrl from "../assets/ort/ort-wasm-simd-threaded.mjs?url";
import ortWasmUrl from "../assets/ort/ort-wasm-simd-threaded.wasm?url";

export interface LocalTranscriberInput {
  audioBytes: ArrayBuffer;
  mimeType: string;
  languageHint: string | null;
  includeTimestamps: boolean;
  onProgress?: (event: LocalAiProgressEvent) => void;
}

export interface LocalTranscriberOutput {
  text: string;
  language: string | null;
  segments: TranscriptSegment[];
  warnings: string[];
  model: string;
}

export interface LocalTranscriber {
  prepare?(input?: { onProgress?: (event: LocalAiProgressEvent) => void }): Promise<LocalAiPreparationResult>;
  transcribe(input: LocalTranscriberInput): Promise<LocalTranscriberOutput>;
}

export function createLocalApiClient(options: {
  transcriber?: LocalTranscriber;
  now?: () => string;
} = {}): ApiClient {
  const transcriber = options.transcriber ?? createWhisperTinyTranscriber();
  const now = options.now ?? (() => new Date().toISOString());

  return {
    async prepareLocalAi(input = {}) {
      if (typeof transcriber.prepare === "function") {
        return transcriber.prepare(
          input.on_progress
            ? {
                onProgress: input.on_progress,
              }
            : undefined,
        );
      }

      const preparedAt = now();
      input.on_progress?.({
        stage: "ready",
        label: "Offline tools are ready on this device.",
        progress: 100,
        loaded_bytes: null,
        total_bytes: null,
        file: null,
        model: "deterministic-local-v1",
      });
      return {
        model: "deterministic-local-v1",
        prepared_at: preparedAt,
        cached: true,
        warnings: [],
      };
    },

    async transcribe(input) {
      const requestedAt = now();
      const bytes = base64ToArrayBuffer(input.upload.content_base64);

      const result = await transcriber.transcribe({
        audioBytes: bytes,
        mimeType: input.upload.mime_type,
        languageHint: input.language_hint ?? "en",
        includeTimestamps: input.include_timestamps ?? true,
        ...(input.on_progress
          ? {
              onProgress: input.on_progress,
            }
          : {}),
      });

      const completedAt = now();
      return {
        incident_id: input.incident_id,
        source_evidence_id: input.source_evidence_id,
        transcript_evidence_id: crypto.randomUUID(),
        transcript: {
          full_text: result.text,
          language: result.language,
          segment_count: result.segments.length,
          segments: result.segments,
        },
        model_metadata: metadata({
          provider: "local",
          model: result.model,
          purpose: "transcribe",
          requestedAt,
          completedAt,
          inputAudioSeconds: estimateAudioSeconds(bytes.byteLength, input.upload.mime_type),
        }),
        warnings: result.warnings,
      };
    },

    async extract(input) {
      const requestedAt = now();
      const factSet = buildDeterministicFactSet(input.transcript, input.context);
      const completedAt = now();

      return {
        incident_id: input.incident_id,
        transcript_evidence_id: input.transcript_evidence_id,
        fact_set: {
          fact_set_id: crypto.randomUUID(),
          ...factSet,
          reviewed_by_user: false,
        },
        model_metadata: metadata({
          provider: "local",
          model: "deterministic-facts-v1",
          purpose: "extract",
          requestedAt,
          completedAt,
          inputCharacters: input.transcript.full_text.length,
        }),
        warnings: [],
      };
    },

    async recommendRoutes(input) {
      const requestedAt = now();
      const recommendations = buildDeterministicRouteRecommendations({
        incident_id: input.incident_id,
        fact_set: input.fact_set,
        context: input.context,
      });
      const completedAt = now();

      return {
        incident_id: input.incident_id,
        recommendations,
        model_metadata: metadata({
          provider: "local",
          model: "deterministic-routing-v1",
          purpose: "route_reasoning",
          requestedAt,
          completedAt,
          inputCharacters: JSON.stringify(input.fact_set).length,
        }),
      };
    },

    async draft(input) {
      const requestedAt = now();
      const draftPacket = buildTemplateDraft(input.fact_set, input.route);
      const completedAt = now();

      return {
        incident_id: input.incident_id,
        route_recommendation_id: input.route_recommendation_id,
        draft_packet: {
          draft_packet_id: crypto.randomUUID(),
          subject: draftPacket.subject,
          body: draftPacket.body,
          attachment_labels: draftPacket.attachment_labels,
          approved: false,
        },
        model_metadata: metadata({
          provider: "local",
          model: "template-draft-v1",
          purpose: "draft",
          requestedAt,
          completedAt,
          inputCharacters: JSON.stringify({
            fact_set: input.fact_set,
            route: input.route,
          }).length,
        }),
        warnings: [],
      };
    },
  };
}

export function buildDeterministicFactSet(
  transcript: TranscriptDocument,
  context: {
    location_address: string | null;
    confirmed_place_id: string | null;
    confirmed_place_name: string | null;
    confirmed_place_phone: string | null;
  },
): Omit<FactSetDto, "fact_set_id" | "reviewed_by_user"> {
  const fullText = transcript.full_text.trim();
  const sentences = splitSentences(fullText);
  const incidentType = classifyIncident(fullText);
  const businesses = unique([
    ...extractBusinessNames(fullText),
    context.confirmed_place_name ?? null,
  ]);
  const places = unique([
    context.location_address,
    ...extractPlacePhrases(fullText),
  ]);
  const people = unique(extractPeople(fullText));
  const phones = unique([context.confirmed_place_phone, ...extractPhones(fullText)]);
  const dates = unique(extractDates(fullText));
  const amounts = unique(extractAmounts(fullText));
  const timeline = buildTimeline(transcript.segments);
  const keyFacts = unique(selectKeyFacts(sentences, amounts));

  return {
    incident_type: incidentType,
    people,
    places,
    businesses,
    phones,
    dates,
    amounts,
    timeline,
    key_facts: keyFacts,
  };
}

export function buildTemplateDraft(
  factSet: FactSetDto,
  route: {
    destination_name_snapshot: string;
    route_group: RouteGroup;
    reason: string;
    source_label: string;
    trust_level: RouteTrustLevel;
  },
) {
  const businessName = factSet.businesses[0] ?? factSet.places[0] ?? "this case";
  const caseType = factSet.incident_type ?? "consumer_issue";
  const caseTypeLabel = formatCaseTypeLabel(caseType);
  const when = factSet.dates[0] ?? "the recorded date";
  const summaryFacts = factSet.key_facts.length > 0 ? factSet.key_facts : fallbackKeyFacts(factSet.timeline);
  const timelineFacts = factSet.timeline.slice(0, 4).map((item) => `${item.time_label || "Time not set"} - ${item.description}`);
  const routeLabel = route.destination_name_snapshot;
  const amountLabel = factSet.amounts[0] ?? null;
  const placeLabel = factSet.places[0] ?? null;
  const phoneLabel = factSet.phones[0] ?? null;
  const requestedResolution = inferResolution(caseType, amountLabel);

  const subjectTarget = factSet.businesses[0] ?? factSet.places[0] ?? "case file";

  const bodyLines = [
    `To: ${routeLabel}`,
    "",
    "Complaint summary",
    `I am filing a ${caseTypeLabel.toLowerCase()} complaint related to ${businessName}.`,
    "",
    "Case details",
    `Case type: ${caseTypeLabel}`,
    `Business: ${businessName}`,
    `Date of incident: ${when}`,
    placeLabel ? `Location: ${placeLabel}` : null,
    phoneLabel ? `Business phone: ${phoneLabel}` : null,
    amountLabel ? `Amount involved: ${amountLabel}` : null,
    "",
    "What happened",
    ...summaryFacts.map((fact) => `- ${fact}`),
    ...(timelineFacts.length > 0
      ? [
          "",
          "Timeline from capture",
          ...timelineFacts.map((item) => `- ${item}`),
        ]
      : []),
    "",
    "Requested resolution",
    `- ${requestedResolution}`,
    "",
    "Why this reporting option fits",
    route.reason,
    "",
    "Source and trust",
    `Source: ${route.source_label}`,
    `Trust level: ${route.trust_level}`,
    "",
    "Attached proof packet",
    "- Original audio capture",
    "- Transcript",
    "- Confirmed facts",
    amountLabel ? "- Amount and payment reference" : null,
    placeLabel ? "- Location details" : null,
    "",
    "I confirm this report is accurate to the best of my knowledge.",
  ].filter(Boolean);

  return {
    subject: `${caseTypeLabel}: ${subjectTarget}`,
    body: bodyLines.join("\n"),
    attachment_labels: ["Original audio capture", "Transcript", "Confirmed facts"],
  };
}

function formatCaseTypeLabel(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/^\w/u, (char) => char.toUpperCase());
}

function inferResolution(caseType: string, amountLabel: string | null) {
  switch (caseType) {
    case "emergency_safety":
      return "This report concerns immediate public safety. Please route it to the correct authority and confirm next steps.";
    case "consumer_billing":
      return amountLabel
        ? `Review the charge and provide a correction or refund for ${amountLabel}.`
        : "Review the charge and provide correction or refund where appropriate.";
    case "fraud_or_deception":
      return "Investigate suspected fraud or theft activity and provide required next steps.";
    case "service_quality":
      return "Review this service complaint and provide a written response and corrective action.";
    case "retail_transaction":
      return "Review the transaction records and provide a written outcome or correction.";
    case "civil_rights":
      return "Review this report for potential rights violations and provide the proper filing path.";
    case "workplace_wages":
      return "Review wage records and correct unpaid or incorrect compensation.";
    case "tenant_issue":
      return "Review the housing complaint and enforce applicable tenant protections.";
    default:
      return "Review this complaint and provide a written response with next steps.";
  }
}

export function createWhisperTinyTranscriber(): LocalTranscriber {
  let pipelinePromise: Promise<(audio: Float32Array, options: Record<string, unknown>) => Promise<unknown>> | null = null;
  let modelIdPromise: Promise<string> | null = null;

  return {
    async prepare(input = {}) {
      modelIdPromise ??= resolvePreferredWhisperModel();
      const modelId = await modelIdPromise;
      const alreadyLoaded = Boolean(pipelinePromise);
      await loadWhisperPipeline(pipelinePromise, input.onProgress, modelId).then((pipeline) => {
        pipelinePromise ??= pipeline.promise;
      });

      const preparedAt = new Date().toISOString();
      input.onProgress?.({
        stage: "ready",
        label: "Built-in speech tools are ready on this device.",
        progress: 100,
        loaded_bytes: null,
        total_bytes: null,
        file: null,
        model: modelId,
      });
      return {
        model: modelId,
        prepared_at: preparedAt,
        cached: alreadyLoaded,
        warnings: [],
      };
    },

    async transcribe(input) {
      modelIdPromise ??= resolvePreferredWhisperModel();
      const modelId = await modelIdPromise;
      input.onProgress?.({
        stage: "load",
        label: "Loading built-in speech tools.",
        progress: 0,
        loaded_bytes: null,
        total_bytes: null,
        file: null,
        model: modelId,
      });

      const pipeline = await loadWhisperPipeline(pipelinePromise, input.onProgress, modelId);
      pipelinePromise ??= pipeline.promise;

      const { pcm16k } = await decodeAudioForAsr(input.audioBytes);
      input.onProgress?.({
        stage: "transcribe",
        label: "Transcribing the saved capture on this device.",
        progress: null,
        loaded_bytes: null,
        total_bytes: null,
        file: null,
        model: modelId,
      });
      const result = await pipeline.instance(pcm16k, {
        return_timestamps: input.includeTimestamps,
        chunk_length_s: modelId.includes("base") ? 15 : 20,
        stride_length_s: 4,
      });

      const parsed = parseWhisperOutput(result, input.includeTimestamps, input.languageHint);
      input.onProgress?.({
        stage: "ready",
        label: "Transcript ready.",
        progress: 100,
        loaded_bytes: null,
        total_bytes: null,
        file: null,
        model: modelId,
      });
      return {
        ...parsed,
        model: modelId,
      };
    },
  };
}

async function resolvePreferredWhisperModel() {
  const preferredModels = ["Xenova/whisper-tiny.en"];

  for (const model of preferredModels) {
    const available = await isBundledModelAvailable(model);
    if (available) {
      return model;
    }
  }

  throw new FrontendRuntimeError(
    "local_ai_failed",
    "Built-in speech model files are missing on this device bundle.",
    {
      required_model: "Xenova/whisper-tiny.en",
      expected_path: "/models/Xenova/whisper-tiny.en/",
    },
  );
}

async function isBundledModelAvailable(modelId: string) {
  const path = `/models/${modelId}/config.json`;
  try {
    const response = await fetch(path, {
      method: "HEAD",
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function loadWhisperPipeline(
  existing: Promise<(audio: Float32Array, options: Record<string, unknown>) => Promise<unknown>> | null,
  onProgress: ((event: LocalAiProgressEvent) => void) | undefined,
  modelId: string,
) {
  if (existing) {
    const instance = await existing;
    return { instance, promise: existing };
  }

  const promise = (async () => {
    const transformers = await import("@huggingface/transformers");
    transformers.env.useBrowserCache = true;
    transformers.env.allowLocalModels = true;
    transformers.env.allowRemoteModels = false;
    transformers.env.localModelPath = "/models/";
    if (transformers.env.backends?.onnx?.wasm) {
      transformers.env.backends.onnx.wasm.numThreads = 1;
      transformers.env.backends.onnx.wasm.proxy = false;
      transformers.env.backends.onnx.wasm.wasmPaths = {
        mjs: ortWasmMjsUrl,
        wasm: ortWasmUrl,
      };
    }
    const instance = await transformers.pipeline("automatic-speech-recognition", modelId, {
      device: "wasm",
      dtype: "fp32",
      progress_callback(progress) {
        const next = mapProgressInfo(progress as Record<string, unknown>, modelId);
        if (next) {
          onProgress?.(next);
        }
      },
    });
    return instance as (audio: Float32Array, options: Record<string, unknown>) => Promise<unknown>;
  })();

  try {
    const instance = await promise;
    return { instance, promise };
  } catch (error) {
    throw new FrontendRuntimeError(
      "local_ai_failed",
      "Built-in speech tools could not be loaded on this device.",
      {
        message: error instanceof Error ? error.message : "Unknown local AI loader failure.",
        model: modelId,
        runtime: {
          device: "wasm",
          dtype: "fp32",
          local_model_path: "/models/",
          ort_mjs_url: ortWasmMjsUrl,
          ort_wasm_url: ortWasmUrl,
        },
        cause: error,
      },
    );
  }
}

function mapProgressInfo(progress: Record<string, unknown>, modelId: string): LocalAiProgressEvent | null {
  const status = typeof progress.status === "string" ? progress.status : null;
  if (!status) {
    return null;
  }

  switch (status) {
    case "initiate":
    case "download":
      return {
        stage: "load",
        label: "Loading built-in speech tools.",
        progress: 0,
        loaded_bytes: null,
        total_bytes: null,
        file: typeof progress.file === "string" ? progress.file : null,
        model: modelId,
      };
    case "progress":
    case "progress_total":
      return {
        stage: "load",
        label: "Loading built-in speech tools.",
        progress: typeof progress.progress === "number" ? progress.progress : null,
        loaded_bytes: typeof progress.loaded === "number" ? progress.loaded : null,
        total_bytes: typeof progress.total === "number" ? progress.total : null,
        file: typeof progress.file === "string" ? progress.file : null,
        model: modelId,
      };
    case "done":
      return {
        stage: "load",
        label: "Loading built-in speech tools.",
        progress: 100,
        loaded_bytes: typeof progress.loaded === "number" ? progress.loaded : null,
        total_bytes: typeof progress.total === "number" ? progress.total : null,
        file: typeof progress.file === "string" ? progress.file : null,
        model: modelId,
      };
    case "ready":
      return {
        stage: "ready",
        label: "Built-in speech tools are ready on this device.",
        progress: 100,
        loaded_bytes: null,
        total_bytes: null,
        file: null,
        model: typeof progress.model === "string" ? progress.model : modelId,
      };
    default:
      return null;
  }
}

async function decodeAudioForAsr(audioBytes: ArrayBuffer) {
  const AudioContextCtor =
    globalThis.AudioContext ??
    (globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextCtor) {
    throw new FrontendRuntimeError("local_ai_failed", "Audio decoding is not available on this device.");
  }

  const context = new AudioContextCtor();
  try {
    const decoded = await context.decodeAudioData(audioBytes.slice(0));
    const mono = mixToMono(decoded);
    return {
      pcm16k: resampleFloat32(mono, decoded.sampleRate, 16000),
    };
  } catch (error) {
    throw new FrontendRuntimeError("local_ai_failed", "Local transcription could not decode this capture.", error);
  } finally {
    await context.close().catch(() => undefined);
  }
}

function mixToMono(buffer: AudioBuffer) {
  if (buffer.numberOfChannels === 1) {
    return new Float32Array(buffer.getChannelData(0));
  }

  const output = new Float32Array(buffer.length);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const channelData = buffer.getChannelData(channel);
    for (let index = 0; index < channelData.length; index += 1) {
      const currentOutput = output[index] ?? 0;
      const currentChannelSample = channelData[index] ?? 0;
      output[index] = currentOutput + currentChannelSample / buffer.numberOfChannels;
    }
  }
  return output;
}

function resampleFloat32(input: Float32Array, sourceRate: number, targetRate: number) {
  if (sourceRate === targetRate) {
    return input;
  }

  const ratio = sourceRate / targetRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(outputLength);

  for (let index = 0; index < outputLength; index += 1) {
    const sourceIndex = index * ratio;
    const lower = Math.floor(sourceIndex);
    const upper = Math.min(input.length - 1, Math.ceil(sourceIndex));
    const weight = sourceIndex - lower;
    const lowerSample = input[lower] ?? 0;
    const upperSample = input[upper] ?? lowerSample;
    output[index] = lowerSample * (1 - weight) + upperSample * weight;
  }

  return output;
}

function parseWhisperOutput(result: unknown, includeTimestamps: boolean, languageHint: string | null) {
  if (typeof result === "string") {
    return {
      text: result,
      language: languageHint ?? "en",
      segments: buildFallbackSegments(result, includeTimestamps),
      warnings: includeTimestamps ? ["Segment timestamps were estimated from the local transcript output."] : [],
    };
  }

  const output = result as {
    text?: string;
    chunks?: Array<{
      text?: string;
      timestamp?: [number | null, number | null] | number[] | null;
    }>;
  };

  const text = output.text?.trim() ?? "";
  if (!includeTimestamps || !Array.isArray(output.chunks) || output.chunks.length === 0) {
    return {
      text,
      language: languageHint ?? "en",
      segments: buildFallbackSegments(text, includeTimestamps),
      warnings: includeTimestamps ? ["Segment timestamps were estimated from the local transcript output."] : [],
    };
  }

  const segments: TranscriptSegment[] = output.chunks.map((chunk, index) => {
    const start = Number(Array.isArray(chunk.timestamp) ? chunk.timestamp[0] ?? 0 : 0);
    const end = Number(Array.isArray(chunk.timestamp) ? chunk.timestamp[1] ?? start : start);
    return {
      start_ms: Number.isFinite(start) ? Math.max(0, Math.round(start * 1000)) : index * 1000,
      end_ms: Number.isFinite(end) ? Math.max(Math.round(end * 1000), Math.round(start * 1000)) : (index + 1) * 1000,
      speaker_label: "Speaker 1",
      text: chunk.text?.trim() ?? "",
      confidence: null,
    };
  });

  return {
    text,
    language: languageHint ?? "en",
    segments,
    warnings: [],
  };
}

function buildFallbackSegments(text: string, includeTimestamps: boolean): TranscriptSegment[] {
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return [];
  }

  return sentences.map((sentence, index) => ({
    start_ms: includeTimestamps ? index * 2000 : 0,
    end_ms: includeTimestamps ? (index + 1) * 2000 : 0,
    speaker_label: "Speaker 1",
    text: sentence,
    confidence: null,
  }));
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function classifyIncident(text: string) {
  const normalized = text.toLowerCase();
  if (/\bpolice report\b|\bbreak[- ]?in\b|\bbroken into\b|\bburglary\b|\bcar break[- ]?in\b|\brobbed\b|\brobbery\b|\bvandaliz/iu.test(normalized)) {
    return "emergency_safety";
  }
  if (/\bmurder\b|\bhomicide\b|\bshooting\b|\bgun\b|\bweapon\b|\bassault\b|\battacked\b|\battack\b|\bkidnapp/iu.test(normalized)) {
    return "emergency_safety";
  }
  if (/\bstolen\b|\btheft\b|\bstole\b|\bidentity theft\b|\bcard stolen\b|\bcredit card stolen\b/iu.test(normalized)) {
    return "fraud_or_deception";
  }
  if (/\bcharged\b|\bbilling\b|\brefund\b|\bovercharg/iu.test(normalized)) {
    return "consumer_billing";
  }
  if (/\bscam\b|\bfraud\b|\bdeceptive\b/iu.test(normalized)) {
    return "fraud_or_deception";
  }
  if (/\brent\b|\blandlord\b|\btenant\b|\bhousing\b/iu.test(normalized)) {
    return "tenant_issue";
  }
  if (/\bwage\b|\bovertime\b|\bpaycheck\b/iu.test(normalized)) {
    return "workplace_wages";
  }
  if (/\bdiscriminat/iu.test(normalized)) {
    return "civil_rights";
  }
  if (/\bstore\b|\bmarket\b|\bpurchase\b|\breceipt\b/iu.test(normalized)) {
    return "retail_transaction";
  }
  if (/\bservice\b|\brude\b|\bunresolved\b/iu.test(normalized)) {
    return "service_quality";
  }
  return "consumer_issue";
}

function extractPeople(text: string) {
  const matches = new Set<string>();

  for (const match of text.matchAll(/\b(store manager|manager|owner|employee|cashier|officer|agent|representative)\b/giu)) {
    matches.add(toTitleCase(match[0]));
  }

  for (const match of text.matchAll(/\b(?:Mr|Mrs|Ms|Officer)\.?\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/gu)) {
    matches.add(match[0].trim());
  }

  return [...matches];
}

function extractBusinessNames(text: string) {
  const businesses = new Set<string>();

  for (const match of text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2}\s+(?:Market|Store|Shop|Restaurant|Cafe|Bank|Clinic|Hotel|Pharmacy|Services?|Motors?|Auto))\b/gu)) {
    businesses.add(match[1]?.trim() ?? match[0].trim());
  }

  return [...businesses];
}

function extractPlacePhrases(text: string) {
  const places = new Set<string>();
  for (const match of text.matchAll(/\b(?:at|in|near)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/gu)) {
    places.add(match[1]?.trim() ?? match[0].trim());
  }
  return [...places];
}

function extractPhones(text: string) {
  const phones = new Set<string>();
  for (const match of text.matchAll(/\b(?:\+1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/gu)) {
    phones.add(match[0].replace(/\s+/gu, " ").trim());
  }
  return [...phones];
}

function extractDates(text: string) {
  const dates = new Set<string>();
  for (const match of text.matchAll(/\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2}(?:,\s+\d{4})?)\b/giu)) {
    dates.add(match[0]);
  }
  return [...dates];
}

function extractAmounts(text: string) {
  const amounts = new Set<string>();
  for (const match of text.matchAll(/\$\s?\d+(?:\.\d{2})?|\b\d+(?:\.\d{2})\b/gu)) {
    amounts.add(match[0].replace(/\s+/gu, ""));
  }
  return [...amounts];
}

function buildTimeline(segments: TranscriptSegment[]): FactTimelineItemRecord[] {
  if (segments.length === 0) {
    return [];
  }

  return segments.map((segment) => ({
    time_label: formatTimestamp(segment.start_ms),
    description: segment.text,
  }));
}

function selectKeyFacts(sentences: string[], amounts: string[]) {
  const urgent = sentences.filter((sentence) =>
    /\bmurder\b|\bhomicide\b|\bshooting\b|\bweapon\b|\bassault\b|\battack\b|\bstolen\b|\btheft\b|\bpolice report\b|\bbreak[- ]?in\b|\bbroken into\b|\bburglary\b|\brobbery\b/iu.test(
      sentence,
    ),
  );
  if (urgent.length > 0) {
    return urgent.map(cleanKeyFactSentence).slice(0, 4);
  }

  const selected = sentences.filter((sentence) =>
    /\bcharged\b|\brefund\b|\brefused\b|\bmanager\b|\bdispute\b|\bproblem\b/iu.test(sentence),
  );

  if (selected.length > 0) {
    return selected.map(cleanKeyFactSentence).slice(0, 4);
  }

  if (amounts.length > 0) {
    return [`A payment or amount was mentioned: ${amounts[0]}.`, ...sentences.slice(0, 2).map(cleanKeyFactSentence)];
  }

  return sentences.map(cleanKeyFactSentence).slice(0, 3);
}

function cleanKeyFactSentence(sentence: string) {
  const normalized = sentence
    .replace(/\s+/gu, " ")
    .replace(/\bokay\b/giu, "")
    .replace(/\buh\b|\bum\b/giu, "")
    .trim();
  if (!normalized) {
    return sentence.trim();
  }
  return normalized.replace(/^\w/u, (char) => char.toUpperCase());
}

function fallbackKeyFacts(timeline: FactTimelineItemRecord[]) {
  return timeline.map((item) => item.description).slice(0, 3);
}

function unique(values: Array<string | null | undefined>) {
  return [...new Set(values.filter((value): value is string => Boolean(value)).map((value) => value.trim()))];
}

function metadata(input: {
  provider: string;
  model: string;
  purpose: ModelMetadata["purpose"];
  requestedAt: string;
  completedAt: string;
  inputAudioSeconds?: number | null;
  inputCharacters?: number | null;
}) {
  return {
    provider: input.provider,
    model: input.model,
    purpose: input.purpose,
    requested_at: input.requestedAt,
    completed_at: input.completedAt,
    latency_ms: elapsedMs(input.requestedAt, input.completedAt),
    input_audio_seconds: input.inputAudioSeconds ?? null,
    input_characters: input.inputCharacters ?? null,
    input_tokens: null,
    output_tokens: null,
  } satisfies ModelMetadata;
}

function elapsedMs(start: string, end: string) {
  return Math.max(0, new Date(end).getTime() - new Date(start).getTime());
}

function base64ToArrayBuffer(input: string) {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function estimateAudioSeconds(sizeBytes: number, mimeType: string) {
  if (mimeType.includes("wav")) {
    return Number((sizeBytes / 32000).toFixed(2));
  }
  return Number((sizeBytes / 16000).toFixed(2));
}

function formatTimestamp(durationMs: number) {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function toTitleCase(value: string) {
  return value.replace(/\b\w/gu, (letter) => letter.toUpperCase());
}
