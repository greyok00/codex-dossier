import { Capacitor } from "@capacitor/core";

import type { DossierDatabase, FactTimelineItemRecord, RouteGroup, RouteTrustLevel } from "./db";
import { getFrontendConfig } from "./config";
import { database } from "./db";

interface PositionSnapshot {
  lat: number | null;
  lng: number | null;
  address: string | null;
}

export interface TranscriptSegment {
  start_ms: number;
  end_ms: number;
  speaker_label: string | null;
  text: string;
  confidence: number | null;
}

export interface TranscriptDocument {
  full_text: string;
  language: string | null;
  segment_count: number;
  segments: TranscriptSegment[];
}

export interface FactTimelineItem extends FactTimelineItemRecord {}

export interface FactSetDto {
  fact_set_id: string;
  incident_type: string | null;
  people: string[];
  places: string[];
  businesses: string[];
  phones: string[];
  dates: string[];
  amounts: string[];
  timeline: FactTimelineItem[];
  key_facts: string[];
  reviewed_by_user: boolean;
}

export interface ModelMetadata {
  provider: string;
  model: string;
  purpose: "transcribe" | "extract" | "draft" | "route_reasoning";
  requested_at: string;
  completed_at: string;
  latency_ms: number;
  input_audio_seconds?: number | null;
  input_characters?: number | null;
  input_tokens?: number | null;
  output_tokens?: number | null;
}

export interface LocalAiProgressEvent {
  stage: "download" | "load" | "transcribe" | "ready";
  label: string;
  progress: number | null;
  loaded_bytes: number | null;
  total_bytes: number | null;
  file: string | null;
  model: string | null;
}

export interface LocalAiPreparationResult {
  model: string;
  prepared_at: string;
  cached: boolean;
  warnings: string[];
}

export interface RouteRecommendationDto {
  id: string;
  destination_id: string | null;
  destination_name_snapshot: string;
  destination_type_snapshot: string;
  route_group: RouteGroup;
  rank: number;
  reason: string;
  source_label: string;
  source_url: string | null;
  trust_level: RouteTrustLevel;
  last_verified_date: string | null;
  complaint_url: string | null;
  email: string | null;
  phone: string | null;
  mailing_address: string | null;
  intake_methods_snapshot: string[];
  required_documents_snapshot: string[];
  available_actions: string[];
  selected: boolean;
}

interface VenueMatchDto {
  provider: string;
  place_id: string;
  business_name: string;
  address: string;
  phone: string | null;
  website: string | null;
  lat: number;
  lng: number;
  match_confidence: number;
  source_label: string;
  source_url: string;
  trust_level: RouteTrustLevel;
  captured_at: string;
}

interface BackendDestinationDto {
  destination_id: string;
  destination_name: string;
  destination_type: string;
  intake_methods: string[];
  complaint_url: string | null;
  email: string | null;
  phone: string | null;
  mailing_address:
    | {
        line1: string;
        line2: string | null;
        city: string;
        state: string;
        postal_code: string;
        country: "US";
      }
    | null;
}

interface BackendRouteRecommendationDto {
  destination_id: string | null;
  destination_name_snapshot: string;
  destination_type_snapshot: string;
  route_category: "Business" | "Local" | "State" | "Federal" | "Other verified routes";
  rank: number;
  reason: string;
  source_label: string;
  source_url: string | null;
  last_verified_date: string | null;
  trust_level: RouteTrustLevel;
  intake_methods_snapshot: string[];
  required_documents_snapshot: string[];
  available_actions: string[];
  destination: BackendDestinationDto | null;
}

interface TranscribeApiResponse {
  ok: true;
  request_id: string;
  data: {
    incident_id: string;
    source_evidence_id: string;
    transcript_evidence_id: string;
    transcript: TranscriptDocument;
    model_metadata: ModelMetadata;
    warnings: string[];
  };
}

interface ExtractApiResponse {
  ok: true;
  request_id: string;
  data: {
    incident_id: string;
    transcript_evidence_id: string;
    fact_set: FactSetDto;
    model_metadata: ModelMetadata;
    warnings: string[];
  };
}

interface RecommendRoutesApiResponse {
  ok: true;
  request_id: string;
  data: {
    incident_id: string;
    route_groups: Array<{
      route_category: "Business" | "Local" | "State" | "Federal" | "Other verified routes";
      routes: BackendRouteRecommendationDto[];
    }>;
    model_metadata: ModelMetadata;
  };
}

interface DraftApiResponse {
  ok: true;
  request_id: string;
  data: {
    incident_id: string;
    selected_route: unknown;
    draft_packet: {
      draft_packet_id: string;
      subject: string;
      body: string;
      attachments: Array<{
        evidence_id: string;
        label: string;
        mime_type: string;
        sha256: string;
      }>;
      approved: boolean;
    };
    model_metadata: ModelMetadata;
    warnings: string[];
  };
}

interface RecommendRoutesResult {
  incident_id: string;
  recommendations: RouteRecommendationDto[];
  model_metadata: ModelMetadata;
}

interface DraftResult {
  incident_id: string;
  route_recommendation_id: string;
  draft_packet: {
    draft_packet_id: string;
    subject: string;
    body: string;
    attachment_labels: string[];
    approved: boolean;
  };
  model_metadata: ModelMetadata;
  warnings: string[];
}

interface VenueMatchApiResponse {
  ok: true;
  request_id: string;
  data: {
    incident_id: string;
    matches: VenueMatchDto[];
  };
}

interface ApiErrorResponse {
  ok: false;
  request_id: string;
  error: {
    code: string;
    message: string;
    details: unknown;
  };
}

export interface ApiClient {
  prepareLocalAi(input?: {
    on_progress?: (event: LocalAiProgressEvent) => void;
  }): Promise<LocalAiPreparationResult>;
  transcribe(input: {
    incident_id: string;
    source_evidence_id: string;
    source_evidence_sha256: string;
    upload: {
      upload_mode: "inline_base64";
      filename: string;
      mime_type: string;
      size_bytes: number;
      content_base64: string;
    };
    language_hint?: string | null;
    include_timestamps?: boolean;
    on_progress?: (event: LocalAiProgressEvent) => void;
  }): Promise<TranscribeApiResponse["data"]>;
  extract(input: {
    incident_id: string;
    transcript_evidence_id: string;
    transcript: TranscriptDocument;
    context: {
      location_address: string | null;
      confirmed_place_id: string | null;
      confirmed_place_name: string | null;
      confirmed_place_phone: string | null;
    };
  }): Promise<ExtractApiResponse["data"]>;
  recommendRoutes(input: {
    incident_id: string;
    fact_set: FactSetDto;
    context: {
      location_address: string | null;
      location_lat: number | null;
      location_lng: number | null;
      confirmed_place_name: string | null;
      confirmed_place_phone: string | null;
      transcript_excerpt: string | null;
    };
  }): Promise<RecommendRoutesResult>;
  draft(input: {
    incident_id: string;
    route_recommendation_id: string;
    route: {
      destination_id: string | null;
      destination_name_snapshot: string;
      destination_type_snapshot: string;
      route_group: RouteGroup;
      rank: number;
      reason: string;
      source_label: string;
      source_url: string | null;
      trust_level: RouteTrustLevel;
      last_verified_date: string | null;
      intake_methods_snapshot: string[];
      required_documents_snapshot: string[];
      available_actions: string[];
    };
    fact_set: FactSetDto;
  }): Promise<DraftResult>;
}

export interface DeviceUnlockBridge {
  isAvailable(): Promise<boolean>;
  createCredential(input: { install_id: string }): Promise<string>;
  authenticate(input: { credential_id: string }): Promise<void>;
}

export interface AppServices {
  db: DossierDatabase;
  api: ApiClient;
  deviceUnlock: DeviceUnlockBridge;
  share(input: { title?: string; text?: string; files?: File[] }): Promise<boolean>;
  openExternal(url: string): Promise<void>;
  downloadFile(input: { filename: string; blob: Blob }): Promise<void>;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createMediaRecorder(stream: MediaStream): MediaRecorder;
  getCurrentPosition(): Promise<{
    lat: number | null;
    lng: number | null;
    address: string | null;
  }>;
}

let defaultAppServicesSingleton: AppServices | null = null;

function createLazyLocalApiClient(): ApiClient {
  let clientPromise: Promise<ApiClient> | null = null;

  async function getClient() {
    clientPromise ??= import("./local-ai").then(({ createLocalApiClient }) => createLocalApiClient());
    return clientPromise;
  }

  return {
    async prepareLocalAi(input) {
      return (await getClient()).prepareLocalAi(input);
    },
    async transcribe(input) {
      return (await getClient()).transcribe(input);
    },
    async extract(input) {
      return (await getClient()).extract(input);
    },
    async recommendRoutes(input) {
      return (await getClient()).recommendRoutes(input);
    },
    async draft(input) {
      return (await getClient()).draft(input);
    },
  };
}

export type FrontendRuntimeErrorCode =
  | "device_unlock_unavailable"
  | "device_unlock_failed"
  | "local_ai_failed"
  | "backend_unreachable"
  | "backend_auth_failed"
  | "backend_request_failed";

export class FrontendRuntimeError extends Error {
  readonly code: FrontendRuntimeErrorCode;
  readonly details?: unknown;

  constructor(code: FrontendRuntimeErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = "FrontendRuntimeError";
    this.code = code;
    this.details = details;
  }
}

function env(name: string) {
  const value = import.meta.env[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function detectPlatform(userAgent = navigator.userAgent): "ios" | "android" | "web" {
  if (/iphone|ipad|ipod/i.test(userAgent)) {
    return "ios";
  }
  if (/android/i.test(userAgent)) {
    return "android";
  }
  return "web";
}

export function appVersion() {
  return env("VITE_APP_VERSION") ?? "0.1.0";
}

export function createApiClient(baseUrl = ""): ApiClient {
  const resolvedBaseUrl = resolveApiBaseUrl(baseUrl);

  return {
    async prepareLocalAi() {
      return {
        model: "remote-backend-ai",
        prepared_at: new Date().toISOString(),
        cached: true,
        warnings: ["Local AI preparation is not available in backend mode."],
      };
    },

    async transcribe(input) {
      const { on_progress: _onProgress, ...requestBody } = input;
      const response = await postJson<TranscribeApiResponse>(resolvedBaseUrl, "/v1/ai/transcribe", requestBody);
      return response.data;
    },

    async extract(input) {
      const response = await postJson<ExtractApiResponse>(resolvedBaseUrl, "/v1/ai/extract", input);
      return response.data;
    },

    async recommendRoutes(input) {
      let confirmedPlace: VenueMatchDto | null = null;
      if (input.context.location_lat !== null && input.context.location_lng !== null) {
        try {
          const venueResponse = await postJson<VenueMatchApiResponse>(resolvedBaseUrl, "/v1/venue/match", {
            incident_id: input.incident_id,
            location: {
              lat: input.context.location_lat,
              lng: input.context.location_lng,
              address: input.context.location_address,
            },
            transcript_excerpt: input.context.transcript_excerpt,
            business_hints: [
              ...(input.context.confirmed_place_name ? [input.context.confirmed_place_name] : []),
              ...input.fact_set.businesses,
            ].filter(Boolean),
          });
          confirmedPlace = venueResponse.data.matches[0] ?? null;
        } catch (error) {
          if (!(error instanceof FrontendRuntimeError)) {
            throw error;
          }
          if (error.code !== "backend_unreachable") {
            console.warn("Venue match skipped.", error);
          }
        }
      }

      const response = await postJson<RecommendRoutesApiResponse>(resolvedBaseUrl, "/v1/routes/recommend", {
        incident_id: input.incident_id,
        fact_set: input.fact_set,
        confirmed_place: confirmedPlace,
        location_context: buildLocationContext(input.context.location_address),
      });

      const recommendations = response.data.route_groups.flatMap((group) =>
        group.routes.map((route) => toRouteRecommendationDto(route)),
      );

      return {
        incident_id: input.incident_id,
        recommendations,
        model_metadata: response.data.model_metadata,
      };
    },

    async draft(input) {
      const response = await postJson<DraftApiResponse>(resolvedBaseUrl, "/v1/ai/draft", {
        incident_id: input.incident_id,
        fact_set: input.fact_set,
        selected_route: {
          destination_id: input.route.destination_id,
          destination_name_snapshot: input.route.destination_name_snapshot,
          destination_type_snapshot: input.route.destination_type_snapshot,
          route_category: mapRouteGroupToCategory(input.route.route_group),
          rank: input.route.rank,
          reason: input.route.reason,
          source_label: input.route.source_label,
          source_url: input.route.source_url,
          last_verified_date: input.route.last_verified_date,
          trust_level: input.route.trust_level,
          intake_methods_snapshot: input.route.intake_methods_snapshot.filter(isIntakeMethod),
          required_documents_snapshot: input.route.required_documents_snapshot,
          available_actions: input.route.available_actions.filter(isAvailableAction),
          destination: null,
        },
      });

      return {
        incident_id: response.data.incident_id,
        route_recommendation_id: input.route_recommendation_id,
        draft_packet: {
          draft_packet_id: response.data.draft_packet.draft_packet_id,
          subject: response.data.draft_packet.subject,
          body: response.data.draft_packet.body,
          attachment_labels: response.data.draft_packet.attachments.map((attachment) => attachment.label),
          approved: response.data.draft_packet.approved,
        },
        model_metadata: response.data.model_metadata,
        warnings: response.data.warnings,
      };
    },
  };
}

export function createDefaultDeviceUnlockBridge(): DeviceUnlockBridge {
  return {
    async isAvailable() {
      if (!supportsDeviceUnlock()) {
        return false;
      }

      const candidate = window.PublicKeyCredential as typeof PublicKeyCredential & {
        isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean>;
      };

      if (typeof candidate.isUserVerifyingPlatformAuthenticatorAvailable === "function") {
        return candidate.isUserVerifyingPlatformAuthenticatorAvailable();
      }

      return true;
    },

    async createCredential(input) {
      if (!(await this.isAvailable())) {
        throw new FrontendRuntimeError("device_unlock_unavailable", "Device unlock is not available on this device.");
      }

      try {
        const credential = (await navigator.credentials.create({
          publicKey: {
            challenge: randomBuffer(32),
            rp: { name: "Dossier" },
            user: {
              id: new TextEncoder().encode(input.install_id.slice(0, 64)),
              name: `dossier-${input.install_id}`,
              displayName: "Dossier",
            },
            pubKeyCredParams: [
              { type: "public-key", alg: -7 },
              { type: "public-key", alg: -257 },
            ],
            authenticatorSelection: {
              authenticatorAttachment: "platform",
              residentKey: "preferred",
              userVerification: "required",
            },
            timeout: 60000,
            attestation: "none",
          },
        } as CredentialCreationOptions)) as PublicKeyCredential | null;

        if (!credential) {
          throw new Error("credential_not_created");
        }

        return toBase64Url(credential.rawId);
      } catch (error) {
        throw new FrontendRuntimeError("device_unlock_failed", "Device unlock could not be enabled.", error);
      }
    },

    async authenticate(input) {
      if (!(await this.isAvailable())) {
        throw new FrontendRuntimeError("device_unlock_unavailable", "Device unlock is not available on this device.");
      }

      try {
        const assertion = (await navigator.credentials.get({
          publicKey: {
            challenge: randomBuffer(32),
            allowCredentials: [
              {
                id: fromBase64Url(input.credential_id),
                type: "public-key",
              },
            ],
            userVerification: "required",
            timeout: 60000,
          },
        } as CredentialRequestOptions)) as PublicKeyCredential | null;

        if (!assertion) {
          throw new Error("credential_not_returned");
        }
      } catch (error) {
        throw new FrontendRuntimeError("device_unlock_failed", "Device unlock did not complete.", error);
      }
    },
  };
}

export function createDefaultAppServices(): AppServices {
  if (defaultAppServicesSingleton) {
    return defaultAppServicesSingleton;
  }

  let cachedPosition: PositionSnapshot | null = null;
  let pendingPosition: Promise<PositionSnapshot> | null = null;

  defaultAppServicesSingleton = {
    db: database,
    api: getFrontendConfig().apiMode === "backend" ? createApiClient(getFrontendConfig().backendUrl) : createLazyLocalApiClient(),
    deviceUnlock: createDefaultDeviceUnlockBridge(),
    async share(input) {
      if (isCapacitorNativePlatform()) {
        try {
          const { Share } = await import("@capacitor/share");
          const firstFile = input.files?.[0];
          const url = firstFile
            ? await writeBlobToCapacitorCache({
                filename: firstFile.name || "dossier-share.bin",
                blob: firstFile,
              })
            : undefined;
          const shareOptions: {
            title?: string;
            text?: string;
            url?: string;
            dialogTitle: string;
          } = {
            dialogTitle: input.title ?? "Share from Dossier",
          };
          if (input.title) {
            shareOptions.title = input.title;
          }
          if (input.text) {
            shareOptions.text = input.text;
          }
          if (url) {
            shareOptions.url = url;
          }
          await Share.share(shareOptions);
          return true;
        } catch {
          return false;
        }
      }

      if (typeof navigator === "undefined" || typeof navigator.share !== "function") {
        return false;
      }

      const shareData: ShareData = {};
      if (input.title) {
        shareData.title = input.title;
      }
      if (input.text) {
        shareData.text = input.text;
      }
      if (input.files && input.files.length > 0) {
        shareData.files = input.files;
      }

      try {
        if (typeof navigator.canShare === "function" && shareData.files && !navigator.canShare({ files: shareData.files })) {
          const textOnlyShare: ShareData = {};
          if (shareData.title) {
            textOnlyShare.title = shareData.title;
          }
          if (shareData.text) {
            textOnlyShare.text = shareData.text;
          }

          if (!textOnlyShare.title && !textOnlyShare.text) {
            return false;
          }

          await navigator.share(textOnlyShare);
          return true;
        }
        await navigator.share(shareData);
        return true;
      } catch {
        return false;
      }
    },
    async openExternal(url) {
      if (isCapacitorNativePlatform()) {
        try {
          const normalized = url.trim().toLowerCase();
          if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
            const { Browser } = await import("@capacitor/browser");
            await Browser.open({ url });
            return;
          }
        } catch {
          // Fall back to the browser/webview location handling below.
        }
      }

      if (typeof window !== "undefined") {
        const normalized = url.trim().toLowerCase();
        if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
          const openedWindow = window.open(url, "_blank", "noopener,noreferrer");
          if (openedWindow) {
            return;
          }
        }

        window.location.assign(url);
      }
    },
    async downloadFile(input) {
      if (isCapacitorNativePlatform()) {
        const { Share } = await import("@capacitor/share");
        const uri = await writeBlobToCapacitorCache(input);
        await Share.share({
          title: input.filename,
          url: uri,
          dialogTitle: `Export ${input.filename}`,
        });
        return;
      }

      if (typeof document === "undefined") {
        return;
      }

      const href = URL.createObjectURL(input.blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = input.filename;
      anchor.rel = "noopener";
      anchor.style.display = "none";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    },
    getUserMedia(constraints) {
      return navigator.mediaDevices.getUserMedia(constraints);
    },
    createMediaRecorder(stream) {
      const preferredMimeType = selectPreferredCaptureMimeType();
      if (preferredMimeType) {
        try {
          return new MediaRecorder(stream, {
            mimeType: preferredMimeType,
          });
        } catch {
          // Fall through to the browser default if the preferred type still fails at runtime.
        }
      }

      return new MediaRecorder(stream);
    },
    async getCurrentPosition() {
      if (cachedPosition) {
        return cachedPosition;
      }

      if (pendingPosition) {
        return pendingPosition;
      }

      if (isCapacitorNativePlatform()) {
        pendingPosition = (async () => {
          try {
            const { Geolocation } = await import("@capacitor/geolocation");
            const position = await Geolocation.getCurrentPosition({
              enableHighAccuracy: false,
              timeout: 3500,
              maximumAge: 30000,
            });
            cachedPosition = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              address: null,
            };
            return cachedPosition;
          } catch {
            cachedPosition = {
              lat: null,
              lng: null,
              address: null,
            };
            return cachedPosition;
          }
        })().finally(() => {
          pendingPosition = null;
        });

        return pendingPosition;
      }

      if (!navigator.geolocation) {
        cachedPosition = {
          lat: null,
          lng: null,
          address: null,
        };
        return cachedPosition;
      }

      pendingPosition = new Promise<PositionSnapshot>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (position) => {
            cachedPosition = {
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              address: null,
            };
            resolve(cachedPosition);
          },
          () => {
            cachedPosition = {
              lat: null,
              lng: null,
              address: null,
            };
            resolve(cachedPosition);
          },
          {
            enableHighAccuracy: false,
            timeout: 3500,
            maximumAge: 30000,
          },
        );
      }).finally(() => {
        pendingPosition = null;
      });

      return pendingPosition;
    },
  };

  return defaultAppServicesSingleton;
}

function supportsDeviceUnlock() {
  return typeof window !== "undefined" && "PublicKeyCredential" in window && typeof navigator.credentials !== "undefined";
}

function isCapacitorNativePlatform() {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

function sanitizePortableFilename(filename: string) {
  return filename.replace(/[^a-z0-9._-]+/gi, "-");
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

async function writeBlobToCapacitorCache(input: { filename: string; blob: Blob }) {
  const { Directory, Filesystem } = await import("@capacitor/filesystem");
  const path = `dossier/${Date.now()}-${sanitizePortableFilename(input.filename)}`;
  const data = arrayBufferToBase64(await input.blob.arrayBuffer());

  await Filesystem.writeFile({
    path,
    data,
    directory: Directory.Cache,
    recursive: true,
  });

  const uri = await Filesystem.getUri({
    path,
    directory: Directory.Cache,
  });

  return uri.uri;
}

function selectPreferredCaptureMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return null;
  }

  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];

  for (const candidate of candidates) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }

  return null;
}

function randomBuffer(length: number) {
  return crypto.getRandomValues(new Uint8Array(length));
}

function toBase64Url(input: ArrayBuffer) {
  const bytes = new Uint8Array(input);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function fromBase64Url(input: string) {
  const normalized = input.replace(/-/gu, "+").replace(/_/gu, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function postJson<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const url = `${baseUrl}${path}`;
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    throw new FrontendRuntimeError("backend_unreachable", `Backend request failed for ${path}.`, error);
  }

  return parseJsonResponse<T>(response);
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T | ApiErrorResponse;
  if (response.ok) {
    return payload as T;
  }

  const errorPayload = payload as ApiErrorResponse;
  if (response.status === 401 || response.status === 403) {
    throw new FrontendRuntimeError(
      "backend_auth_failed",
      errorPayload.error?.message ?? "Backend authorization failed.",
      errorPayload.error ?? null,
    );
  }

  throw new FrontendRuntimeError(
    "backend_request_failed",
    errorPayload.error?.message ?? `Backend request failed with status ${response.status}.`,
    errorPayload.error ?? null,
  );
}

function resolveApiBaseUrl(explicitBaseUrl = "") {
  const fallbackBaseUrl = defaultApiBaseUrl();
  const configuredBaseUrl = explicitBaseUrl || env("VITE_API_BASE_URL") || env("VITE_API_BASE") || fallbackBaseUrl;

  if (typeof window === "undefined") {
    return configuredBaseUrl.replace(/\/$/u, "");
  }

  const currentHost = window.location.hostname;
  try {
    const parsed = new URL(configuredBaseUrl, window.location.origin);
    if (isLocalhostHostname(parsed.hostname) && !isLocalhostHostname(currentHost)) {
      parsed.hostname = currentHost;
    }
    return parsed.toString().replace(/\/$/u, "");
  } catch {
    return configuredBaseUrl.replace(/\/$/u, "");
  }
}

function defaultApiBaseUrl() {
  if (typeof window === "undefined") {
    return "http://127.0.0.1:3100";
  }

  const parsed = new URL(window.location.origin);
  if (parsed.port !== "3100") {
    parsed.port = "3100";
  }
  return parsed.toString().replace(/\/$/u, "");
}

function isLocalhostHostname(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function buildLocationContext(address: string | null) {
  const parsed = parseAddressContext(address);
  return {
    state: parsed.state,
    city: parsed.city,
    address,
  };
}

function parseAddressContext(address: string | null) {
  if (!address) {
    return {
      city: null,
      state: null,
    };
  }

  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const city = parts.length >= 2 ? parts.at(-2) ?? null : null;
  const tail = parts.at(-1) ?? "";
  const stateMatch = tail.match(/\b([A-Z]{2})\b/u);
  return {
    city,
    state: stateMatch?.[1] ?? null,
  };
}

function toRouteRecommendationDto(route: BackendRouteRecommendationDto): RouteRecommendationDto {
  return {
    id: crypto.randomUUID(),
    destination_id: route.destination_id,
    destination_name_snapshot: route.destination_name_snapshot,
    destination_type_snapshot: route.destination_type_snapshot,
    route_group: mapRouteCategoryToGroup(route.route_category),
    rank: route.rank,
    reason: route.reason,
    source_label: route.source_label,
    source_url: route.source_url,
    trust_level: route.trust_level,
    last_verified_date: route.last_verified_date,
    complaint_url: route.destination?.complaint_url ?? null,
    email: route.destination?.email ?? null,
    phone: route.destination?.phone ?? null,
    mailing_address: formatMailingAddress(route.destination?.mailing_address ?? null),
    intake_methods_snapshot: route.intake_methods_snapshot,
    required_documents_snapshot: route.required_documents_snapshot,
    available_actions: route.available_actions,
    selected: false,
  };
}

function mapRouteCategoryToGroup(category: BackendRouteRecommendationDto["route_category"]): RouteGroup {
  switch (category) {
    case "Business":
      return "Business";
    case "Local":
      return "Local";
    case "State":
      return "State";
    case "Federal":
      return "Federal";
    case "Other verified routes":
      return "Other";
  }
}

function mapRouteGroupToCategory(group: RouteGroup): BackendRouteRecommendationDto["route_category"] {
  switch (group) {
    case "Business":
      return "Business";
    case "Local":
      return "Local";
    case "State":
      return "State";
    case "Federal":
      return "Federal";
    case "Other":
      return "Other verified routes";
  }
}

function formatMailingAddress(
  mailingAddress: BackendDestinationDto["mailing_address"],
) {
  if (!mailingAddress) {
    return null;
  }

  return [mailingAddress.line1, mailingAddress.line2, `${mailingAddress.city}, ${mailingAddress.state} ${mailingAddress.postal_code}`]
    .filter(Boolean)
    .join(", ");
}

function isIntakeMethod(value: string): value is string {
  return ["web_form", "email", "phone", "mail", "portal", "in_person"].includes(value);
}

function isAvailableAction(value: string): value is string {
  return ["open_form", "call", "email", "share_packet", "export_packet", "save_for_later"].includes(value);
}
