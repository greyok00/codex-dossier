import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Copy,
  ExternalLink,
  FileArchive,
  FileDown,
  FileText,
  FolderOpen,
  Mail,
  MapPinned,
  Mic,
  NotebookPen,
  Package,
  Phone,
  RefreshCw,
  ScanSearch,
  ScrollText,
  Send,
  Share2,
  Shield,
  SlidersHorizontal,
  Square,
} from "lucide-react";

import { getFrontendConfig } from "@/lib/config";
import { sha256Hex } from "@/lib/crypto";
import {
  approveDraftPacket,
  confirmFactSet,
  createExportEvidence,
  deleteIncidentCase,
  getCaseFileSummary,
  getCaptureContext,
  getDraftPacketSummary,
  getFactSetSummary,
  getRouteRecommendationSummary,
  getSubmissionProofSummary,
  getTranscriptSummary,
  listRecentIncidents,
  persistCapture,
  recordSendAction,
  recordShareCompleted,
  saveDraftPacket,
  saveFactSet,
  saveRouteRecommendations,
  saveSubmissionProof,
  saveTranscript,
  selectRouteRecommendation,
  type CaptureContext,
  type DossierDatabase,
  type FactSetRecord,
  type FactSetSummary,
  type IncidentRecord,
  type RouteRecommendationRecord,
  type SubmissionProofRecord,
} from "@/lib/db";
import {
  appVersion,
  detectPlatform,
  type AppServices,
  type LocalAiProgressEvent,
} from "@/lib/runtime";

import {
  arrayBufferToBase64,
  buildFactSummaryCards,
  buildMailtoUrl,
  CASE_TYPE_LABELS,
  CASE_TYPE_OPTIONS,
  copyTextToClipboard,
  computeEditedFields,
  copyBuffer,
  factSetRecordToDto,
  factSetToForm,
  formatCaseTypeLabel,
  formatDuration,
  formatLocalDateTime,
  formatTimestampMs,
  isSubmissionMethod,
  isSubmissionStatus,
  normalizeOptionalText,
  parseTimeline,
  resolveDeviceUnlockError,
  resolveDraftError,
  resolveExtractError,
  resolveLocalAiPreparationError,
  resolveRouteRecommendationError,
  resolveTranscribeError,
  routePriorityLabel,
  splitLines,
  toArrayBuffer,
  updateFactsField,
} from "./helpers";
import type { ActiveCapture, DraftFormState, FactsFormState } from "./types";
import {
  EmptyState,
  FactPillList,
  FactSummaryCard,
  FactsTextarea,
  FactTimelinePreview,
  FullScreenShell,
  InlineError,
  InlineNote,
  LinkButton,
  LoadingScreen,
  PrimaryButton,
  ProgressPanel,
  ScreenMessage,
} from "./ui";

const APP_SUMMARY = "Dossier turns a recording into a documented case you can review, report, and export.";

async function loadCaseExportTools() {
  return import("@/lib/export");
}

function buildChipClassName(...tokens: Array<string | false | null | undefined>) {
  return tokens.filter(Boolean).join(" ");
}

function routeGroupChipClass(routeGroup: RouteRecommendationRecord["route_group"]) {
  return buildChipClassName("status-chip", `status-chip--${routeGroup.toLowerCase()}`);
}

function trustChipClass(trustLevel: RouteRecommendationRecord["trust_level"]) {
  return buildChipClassName("status-chip", `status-chip--${trustLevel}`);
}

function destinationTypeChipClass(destinationType: string) {
  if (destinationType.includes("federal")) {
    return buildChipClassName("status-chip", "status-chip--federal");
  }
  if (destinationType.includes("state")) {
    return buildChipClassName("status-chip", "status-chip--state");
  }
  if (destinationType.includes("local")) {
    return buildChipClassName("status-chip", "status-chip--local");
  }
  if (destinationType.includes("business")) {
    return buildChipClassName("status-chip", "status-chip--business");
  }
  return buildChipClassName("status-chip", "status-chip--other");
}

function formatSubmissionMethodLabel(method: SubmissionProofRecord["method"]) {
  switch (method) {
    case "web_form":
      return "Official form";
    case "email":
      return "Email";
    case "phone":
      return "Phone call";
    case "mail":
      return "Mail";
    case "share":
      return "Shared packet";
    default:
      return method;
  }
}

function formatSubmissionStatusLabel(status: SubmissionProofRecord["status"]) {
  switch (status) {
    case "attempted":
      return "Attempted";
    case "sent":
      return "Sent";
    case "submitted":
      return "Submitted";
    case "shared":
      return "Shared";
    case "called":
      return "Called";
    case "saved":
      return "Saved";
    default:
      return status;
  }
}

function formatCustodyLogDetail(details: Record<string, unknown>) {
  const event = typeof details.event === "string" ? details.event : null;

  switch (event) {
    case "evidence_created":
      return "Original evidence saved on this device.";
    case "transcript_created":
      return typeof details.model === "string" && details.model
        ? `Transcript created with ${details.model}.`
        : "Transcript created.";
    case "facts_confirmed":
      return "Case details were reviewed and confirmed.";
    case "route_selected":
      return typeof details.destination_name_snapshot === "string"
        ? `Selected ${details.destination_name_snapshot} as the active reporting option.`
        : "A reporting option was selected.";
    case "draft_approved":
      return typeof details.subject === "string" ? `Approved draft: ${details.subject}.` : "Report draft approved.";
    case "send_action_recorded":
      return typeof details.destination_name_snapshot === "string"
        ? `Started a send action for ${details.destination_name_snapshot}.`
        : "A send action was recorded.";
    case "share_completed":
      return Array.isArray(details.shared_items) && details.shared_items.length > 0
        ? `Shared ${String(details.shared_items[0])}.`
        : "A case packet was shared.";
    case "export_created":
      return typeof details.filename === "string" ? `Created export ${details.filename}.` : "Created an export file.";
    case "proof_saved":
      return typeof details.confirmation_number === "string" && details.confirmation_number
        ? `Saved proof with confirmation ${details.confirmation_number}.`
        : "Saved confirmation details.";
    default:
      return null;
  }
}

export function PrepareLocalAiScreen({
  model,
  onPrepared,
  services,
}: {
  model: string | null;
  onPrepared: (input: { prepared_at: string; model: string }) => Promise<void>;
  services: AppServices;
}) {
  const frontendConfig = getFrontendConfig();
  const usesBackendApi = frontendConfig.apiMode === "backend";
  const platform = detectPlatform();
  const usesNativeShell = platform !== "web";
  const shouldShowWritingSetup = !usesBackendApi && !usesNativeShell;
  const [progress, setProgress] = useState<LocalAiProgressEvent | null>(null);
  const [speechModelProgress, setSpeechModelProgress] = useState<LocalAiProgressEvent | null>(null);
  const [writingModelProgress, setWritingModelProgress] = useState<LocalAiProgressEvent | null>(null);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const autoStartedRef = useRef(false);
  const progressTimerRef = useRef<number | null>(null);
  const pendingProgressRef = useRef<LocalAiProgressEvent | null>(null);
  const lastCommittedProgressRef = useRef<LocalAiProgressEvent | null>(null);
  const lastProgressCommitAtRef = useRef(0);

  function applyProgressState(next: LocalAiProgressEvent) {
    lastCommittedProgressRef.current = next;
    lastProgressCommitAtRef.current = Date.now();
    setProgress(next);
    const modelName = (next.model ?? "").toLowerCase();
    if (modelName.includes("whisper")) {
      setSpeechModelProgress(next);
      return;
    }
    if (modelName.includes("qwen") || modelName.includes("draft")) {
      setWritingModelProgress(next);
    }
  }

  function flushPendingProgress() {
    if (progressTimerRef.current !== null) {
      window.clearTimeout(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (pendingProgressRef.current) {
      const next = pendingProgressRef.current;
      pendingProgressRef.current = null;
      applyProgressState(next);
    }
  }

  function scheduleProgressUpdate(next: LocalAiProgressEvent) {
    const previous = lastCommittedProgressRef.current;
    const now = Date.now();
    const immediate =
      next.stage === "ready" ||
      !previous ||
      previous.stage !== next.stage ||
      previous.model !== next.model ||
      previous.file !== next.file ||
      now - lastProgressCommitAtRef.current >= 140;

    if (immediate) {
      pendingProgressRef.current = null;
      flushPendingProgress();
      applyProgressState(next);
      return;
    }

    pendingProgressRef.current = next;
    if (progressTimerRef.current !== null) {
      return;
    }

    const waitMs = Math.max(0, 140 - (now - lastProgressCommitAtRef.current));
    progressTimerRef.current = window.setTimeout(() => {
      flushPendingProgress();
    }, waitMs);
  }

  async function handlePrepare() {
    setPending(true);
    setErrorMessage(null);
    setProgress({
      stage: "load",
      label: usesBackendApi ? "Checking the backend AI service." : "Loading built-in speech tools on this device.",
      progress: 0,
      loaded_bytes: null,
      total_bytes: null,
      file: null,
      model: usesBackendApi ? "remote-backend-ai" : model ?? "Xenova/whisper-tiny.en",
    });
    if (usesBackendApi) {
      setSpeechModelProgress(null);
      setWritingModelProgress(null);
    } else {
      setSpeechModelProgress({
        stage: "load",
        label: "Preparing local speech model.",
        progress: 0,
        loaded_bytes: null,
        total_bytes: null,
        file: null,
        model: model ?? "Xenova/whisper-tiny.en",
      });
      setWritingModelProgress(
        shouldShowWritingSetup
          ? {
              stage: "load",
              label: "Preparing local writing model.",
              progress: 0,
              loaded_bytes: null,
              total_bytes: null,
              file: null,
              model: "Qwen/Qwen2.5-0.5B-Instruct",
            }
          : null,
      );
    }

    try {
      const result = await services.api.prepareLocalAi({
        on_progress: (next) => {
          scheduleProgressUpdate(next);
        },
      });
      await onPrepared({
        prepared_at: result.prepared_at,
        model: result.model,
      });
    } catch (error) {
      setErrorMessage(resolveLocalAiPreparationError(error));
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    if (autoStartedRef.current) {
      return;
    }
    autoStartedRef.current = true;
    void handlePrepare();
  }, []);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current !== null) {
        window.clearTimeout(progressTimerRef.current);
      }
    };
  }, []);

  const localSetupDetail = usesNativeShell
    ? "First setup verifies the bundled speech tools and finishes device setup. The first transcript loads them on this device."
    : "First setup downloads the offline speech and writing models once, then keeps them cached on this device.";

  const localAiGuideItems = usesNativeShell
    ? [
        "Speech tools are bundled into the app instead of being downloaded at setup.",
        "The first transcript loads the speech model on-device and shows live progress there.",
        "Drafts start with standard local report writing in this packaged build.",
        "No cloud calls for AI in this mode. Bundled tools stay cached for offline reuse.",
      ]
    : [
        "Speech model: turns your audio capture into transcript text on-device.",
        "Writing model: improves draft complaint wording from your saved facts.",
        "No cloud calls for AI in this mode. Models stay cached for offline reuse.",
      ];

  return (
    <FullScreenShell
      title={usesBackendApi ? "Connect Dossier" : "Get Dossier ready"}
      body={
        usesBackendApi
          ? "Dossier is checking the detached backend service before opening the app."
          : APP_SUMMARY
      }
      detail={
        usesBackendApi
          ? `Backend mode uses ${frontendConfig.backendUrl} for AI tasks while the frontend stays mounted independently.`
          : localSetupDetail
      }
      actionSlot={
        <>
          <ProgressPanel progress={progress} title="Setup progress" emptyMessage="Local setup has not started." />
          {usesBackendApi ? null : (
            <ProgressPanel
              progress={speechModelProgress}
              title="Speech model download"
              emptyMessage="Speech model is waiting to start."
            />
          )}
          {usesBackendApi || !shouldShowWritingSetup ? null : (
            <ProgressPanel
              progress={writingModelProgress}
              title="Writing model download"
              emptyMessage="Writing model is waiting to start."
            />
          )}
          <section className="settings-card">
            <h2>{usesBackendApi ? "Detached runtime" : "How local AI is used"}</h2>
            {usesBackendApi ? (
              <ul className="inline-list">
                <li>Frontend stays open even if the backend process restarts.</li>
                <li>Saved local case data remains readable while the backend reconnects.</li>
                <li>AI actions resume once the backend health check passes again.</li>
              </ul>
            ) : (
              <ul className="inline-list">
                {localAiGuideItems.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </section>
          <PrimaryButton disabled={pending} icon={usesBackendApi ? RefreshCw : FileDown} onClick={() => void handlePrepare()}>
            {pending ? (usesBackendApi ? "Checking connection" : "Downloading models") : usesBackendApi ? "Retry connection" : "Retry setup"}
          </PrimaryButton>
          {errorMessage ? <InlineError message={errorMessage} /> : null}
        </>
      }
    />
  );
}

export function CaptureScreen({
  services,
}: {
  services: AppServices;
}) {
  const navigate = useNavigate();
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [status, setStatus] = useState("Ready to capture");
  const [locationState, setLocationState] = useState<{
    label: string;
    lat: number | null;
    lng: number | null;
    address: string | null;
  }>({
    label: "Checking location",
    lat: null,
    lng: null,
    address: null,
  });
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const activeCaptureRef = useRef<ActiveCapture | null>(null);

  useEffect(() => {
    let active = true;
    void services.getCurrentPosition().then((position) => {
      if (!active) {
        return;
      }
      setLocationState({
        label: position.lat === null ? "Location unavailable" : "Location ready",
        lat: position.lat,
        lng: position.lng,
        address: position.address,
      });
    });
    return () => {
      active = false;
    };
  }, [services]);

  useEffect(() => {
    if (!recording) {
      return;
    }

    const intervalId = window.setInterval(() => {
      const activeCapture = activeCaptureRef.current;
      if (!activeCapture) {
        return;
      }
      setElapsedMs(Date.now() - activeCapture.startTimeMs);
    }, 250);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [recording]);

  useEffect(() => {
    return () => {
      const activeCapture = activeCaptureRef.current;
      if (!activeCapture) {
        return;
      }
      for (const track of activeCapture.stream.getTracks()) {
        track.stop();
      }
    };
  }, []);

  async function handleToggleCapture() {
    if (recording) {
      await stopCapture();
      return;
    }

    await startCapture();
  }

  async function startCapture() {
    setErrorMessage(null);
    try {
      const stream = await services.getUserMedia({ audio: true });
      const recorder = services.createMediaRecorder(stream);
      const chunks: Blob[] = [];
      const mimeType = recorder.mimeType || "audio/webm";
      let stopResolver: (blob: Blob) => void = () => undefined;
      let stopRejector: (reason?: unknown) => void = () => undefined;
      const stopPromise = new Promise<Blob>((resolve, reject) => {
        stopResolver = resolve;
        stopRejector = reject;
      });

      activeCaptureRef.current = {
        recorder,
        stream,
        stopPromise,
        stopResolver,
        stopRejector,
        startTimeMs: Date.now(),
        mimeType,
        chunks,
      };

      recorder.addEventListener("dataavailable", (event: BlobEvent) => {
        if (event.data.size > 0) {
          activeCaptureRef.current?.chunks.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        const current = activeCaptureRef.current;
        if (!current) {
          return;
        }
        for (const track of current.stream.getTracks()) {
          track.stop();
        }
        const blob = new Blob(current.chunks, {
          type: current.mimeType,
        });
        current.stopResolver(blob);
      });

      recorder.addEventListener("error", () => {
        activeCaptureRef.current?.stopRejector(new Error("capture_failed"));
      });

      recorder.start(1000);
      setRecording(true);
      setElapsedMs(0);
      setStatus("Recording");
    } catch {
      setErrorMessage("Microphone access could not start on this device. Check browser permissions and try again.");
      setStatus("Ready to capture");
    }
  }

  async function stopCapture() {
    const activeCapture = activeCaptureRef.current;
    if (!activeCapture) {
      return;
    }

    setRecording(false);
    setStatus("Saving capture");

    const stopPromise = activeCapture.stopPromise;
    activeCapture.recorder.stop();

    try {
      const blob = await stopPromise;
      const arrayBuffer = await toArrayBuffer(blob);
      const sha256 = await sha256Hex(arrayBuffer);
      const durationMs = Math.max(1, Date.now() - activeCapture.startTimeMs);
      const summary = await persistCapture(services.db, {
        original_bytes: arrayBuffer,
        size_bytes: blob.size,
        mime_type: activeCapture.mimeType,
        duration_ms: durationMs,
        sha256,
        device_info_json: {
          platform: detectPlatform(),
          user_agent: navigator.userAgent,
          app_version: appVersion(),
        },
        location: {
          lat: locationState.lat,
          lng: locationState.lng,
          address: locationState.address,
        },
      });

      activeCaptureRef.current = null;
      setElapsedMs(0);
      setStatus("Capture saved");
      navigate(`/cases/${summary.incident_id}/capture-saved`);
    } catch {
      setErrorMessage("The recording was captured, but Dossier could not save it locally. Try again before leaving this screen.");
      setStatus("Ready to capture");
    }
  }

  return (
    <main className="screen screen--capture">
      <header className="capture-header">
        <div>
          <h1 className="screen-title">Start a case</h1>
          <p className="screen-body">Create a new dossier from one verified recording, then build the case from there.</p>
        </div>
        <div className="capture-status-group">
          <span className="status-chip">{status}</span>
          <span className="status-chip">{locationState.label}</span>
        </div>
      </header>

      <section className="settings-card settings-card--subtle">
        <div className="section-heading">
          <h2>Capture preflight</h2>
          <span className="status-chip">{locationState.lat === null ? "Partial context" : "Context ready"}</span>
        </div>
        <ul className="inline-list">
          <li>Microphone permission is required to start.</li>
          <li>Location is optional but will be saved with the case when available.</li>
          <li>The original recording stays local with a verified hash and activity log.</li>
        </ul>
      </section>

      <section className="capture-stage">
        <p className="capture-timer">{formatDuration(elapsedMs)}</p>
        <button
          aria-label={recording ? "Stop recording" : "Start recording"}
          className={`capture-orb ${recording ? "capture-orb--recording" : ""}`}
          onClick={() => {
            void handleToggleCapture();
          }}
          type="button"
        >
          <span className="capture-orb__core" />
          <span className="capture-orb__ring" />
          <span className="capture-orb__label">{recording ? "Stop recording" : "Start recording"}</span>
        </button>
        <PrimaryButton
          icon={recording ? Square : Mic}
          onClick={() => {
            void handleToggleCapture();
          }}
        >
          {recording ? "Stop recording" : "Start recording"}
        </PrimaryButton>
        <p className="capture-note">The original recording stays on this device with a verified hash and activity log.</p>
      </section>

      {errorMessage ? <InlineError message={errorMessage} /> : null}
    </main>
  );
}

export function CaptureSavedScreen({
  db,
  services,
  walkthroughEnabled,
}: {
  db: DossierDatabase;
  services: AppServices;
  walkthroughEnabled: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { incidentId = "" } = useParams();
  const [transcribeProgress, setTranscribeProgress] = useState<LocalAiProgressEvent | null>(null);
  const captureQuery = useQuery({
    queryKey: ["capture-context", incidentId],
    queryFn: () => getCaptureContext(db, incidentId),
    enabled: Boolean(incidentId),
  });
  const transcriptQuery = useQuery({
    queryKey: ["transcript-summary", incidentId],
    queryFn: () => getTranscriptSummary(db, incidentId),
    enabled: Boolean(incidentId),
  });

  const transcribeMutation = useMutation({
    mutationFn: async (context: CaptureContext) => {
      const contentBase64 = arrayBufferToBase64(context.source_evidence.original_bytes ?? new ArrayBuffer(0));
      const result = await services.api.transcribe({
        incident_id: context.incident.id,
        source_evidence_id: context.source_evidence.id,
        source_evidence_sha256: context.source_evidence.sha256,
        upload: {
          upload_mode: "inline_base64",
          filename: `${context.source_evidence.id}.webm`,
          mime_type: context.source_evidence.mime_type,
          size_bytes: context.source_evidence.size_bytes,
          content_base64: contentBase64,
        },
        include_timestamps: true,
        on_progress: (next) => setTranscribeProgress(next),
      });

      await saveTranscript(db, {
        incident_id: result.incident_id,
        transcript_evidence_id: result.transcript_evidence_id,
        source_evidence_id: result.source_evidence_id,
        full_text: result.transcript.full_text,
        language: result.transcript.language,
        segments: result.transcript.segments,
        model_metadata_json: result.model_metadata as unknown as Record<string, unknown>,
        warnings_json: result.warnings,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transcript-summary", incidentId] }),
        queryClient.invalidateQueries({ queryKey: ["cases"] }),
      ]);

      return result;
    },
    onSuccess: () => {
      navigate(`/cases/${incidentId}/transcript`);
    },
  });

  if (captureQuery.isLoading) {
    return <LoadingScreen title="Recording saved" body="Loading your saved recording." />;
  }

  if (captureQuery.isError || !captureQuery.data) {
    return (
      <ScreenMessage title="Recording saved" body="This saved recording could not be opened from local storage on this device." action={<LinkButton icon={ArrowLeft} to="/capture">Back to recording</LinkButton>} />
    );
  }

  const { incident, source_evidence: sourceEvidence } = captureQuery.data;
  const transcriptExists = Boolean(transcriptQuery.data?.transcript);

  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">Recording saved</h1>
        <p className="screen-body">Your original recording is stored on this device with its hash and case history.</p>
      </header>

      <section className="case-card">
        <dl className="detail-list">
          <div>
            <dt>Evidence hash</dt>
            <dd>{sourceEvidence.sha256}</dd>
          </div>
          <div>
            <dt>Captured</dt>
            <dd>{formatLocalDateTime(sourceEvidence.captured_at)}</dd>
          </div>
          <div>
            <dt>Length</dt>
            <dd>{formatDuration(sourceEvidence.duration_ms ?? 0)}</dd>
          </div>
          <div>
            <dt>Case reference</dt>
            <dd>{incident.id}</dd>
          </div>
        </dl>
      </section>

      {transcriptQuery.data?.transcript ? (
        <section className="settings-card">
          <h2>Transcript ready</h2>
          <p>The text version is ready to review with timestamps.</p>
          <PrimaryButton icon={ScrollText} onClick={() => { navigate(`/cases/${incidentId}/transcript`); }}>Review transcript</PrimaryButton>
        </section>
      ) : (
        <section className="settings-card">
          <h2>Next step</h2>
          <p>Create the transcript before checking details or choosing where to report.</p>
          <ProgressPanel
            progress={transcribeProgress}
            title="Transcript progress"
            emptyMessage="The first transcript may take longer while this device loads its built-in speech tools."
          />
          <PrimaryButton
            className={walkthroughEnabled ? "walkthrough-target" : undefined}
            disabled={transcribeMutation.isPending}
            icon={ScrollText}
            onClick={() => {
              if (captureQuery.data) {
                void transcribeMutation.mutate(captureQuery.data);
              }
            }}
          >
            {transcribeMutation.isPending ? "Creating transcript" : "Create transcript"}
          </PrimaryButton>
          {transcribeMutation.error ? <InlineError message={resolveTranscribeError(transcribeMutation.error)} /> : null}
        </section>
      )}

      {transcriptExists ? null : (
        <section className="case-card case-card--subtle">
          <p className="screen-body">Transcript creation reads the saved recording and does not change the original file.</p>
        </section>
      )}
    </main>
  );
}

export function TranscriptScreen({
  db,
  services,
  walkthroughEnabled,
}: {
  db: DossierDatabase;
  services: AppServices;
  walkthroughEnabled: boolean;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { incidentId = "" } = useParams();
  const [transcribeProgress, setTranscribeProgress] = useState<LocalAiProgressEvent | null>(null);
  const captureQuery = useQuery({
    queryKey: ["capture-context", incidentId],
    queryFn: () => getCaptureContext(db, incidentId),
    enabled: Boolean(incidentId),
  });
  const transcriptQuery = useQuery({
    queryKey: ["transcript-summary", incidentId],
    queryFn: () => getTranscriptSummary(db, incidentId),
    enabled: Boolean(incidentId),
  });
  const factSetQuery = useQuery({
    queryKey: ["fact-set-summary", incidentId],
    queryFn: () => getFactSetSummary(db, incidentId),
    enabled: Boolean(incidentId),
  });

  const transcribeMutation = useMutation({
    mutationFn: async (context: CaptureContext) => {
      const contentBase64 = arrayBufferToBase64(context.source_evidence.original_bytes ?? new ArrayBuffer(0));
      const result = await services.api.transcribe({
        incident_id: context.incident.id,
        source_evidence_id: context.source_evidence.id,
        source_evidence_sha256: context.source_evidence.sha256,
        upload: {
          upload_mode: "inline_base64",
          filename: `${context.source_evidence.id}.webm`,
          mime_type: context.source_evidence.mime_type,
          size_bytes: context.source_evidence.size_bytes,
          content_base64: contentBase64,
        },
        include_timestamps: true,
        on_progress: (next) => setTranscribeProgress(next),
      });

      await saveTranscript(db, {
        incident_id: result.incident_id,
        transcript_evidence_id: result.transcript_evidence_id,
        source_evidence_id: result.source_evidence_id,
        full_text: result.transcript.full_text,
        language: result.transcript.language,
        segments: result.transcript.segments,
        model_metadata_json: result.model_metadata as unknown as Record<string, unknown>,
        warnings_json: result.warnings,
      });

      await queryClient.invalidateQueries({ queryKey: ["transcript-summary", incidentId] });
    },
  });

  if (captureQuery.isLoading || transcriptQuery.isLoading) {
    return <LoadingScreen title="Review transcript" body="Loading the transcript for this case." />;
  }

  if (captureQuery.isError || !captureQuery.data) {
    return <ScreenMessage title="Review transcript" body="The source recording could not be reopened from local storage for this case." action={<LinkButton icon={ArrowLeft} to="/capture">Back to recording</LinkButton>} />;
  }

  if (!transcriptQuery.data?.transcript) {
    return (
      <ScreenMessage
        title="Review transcript"
        body="There is no transcript for this case yet."
        action={
          <>
            <ProgressPanel progress={transcribeProgress} title="Transcript progress" emptyMessage="Transcript work runs on this device and may take longer on the first run." />
            <PrimaryButton
              disabled={transcribeMutation.isPending}
              icon={ScrollText}
              onClick={() => {
                if (captureQuery.data) {
                  void transcribeMutation.mutate(captureQuery.data);
                }
              }}
            >
              {transcribeMutation.isPending ? "Creating transcript" : "Create transcript"}
            </PrimaryButton>
          </>
        }
        footer={transcribeMutation.error ? <InlineError message={resolveTranscribeError(transcribeMutation.error)} /> : null}
      />
    );
  }

  const { transcript, segments } = transcriptQuery.data;

  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">Review transcript</h1>
        <p className="screen-body">Check the text from your recording before confirming the case details.</p>
      </header>

      <section className="settings-card">
        <h2>Full text</h2>
        <p className="transcript-fulltext">{transcript.full_text}</p>
      </section>

      <section className="settings-card">
        <div className="section-heading">
          <h2>Segments</h2>
          <span className="status-chip">{segments.length} entries</span>
        </div>
        <ol className="transcript-segment-list">
          {segments.map((segment) => (
            <li className="transcript-segment" key={segment.id}>
              <div className="transcript-segment__meta">
                <span>{formatTimestampMs(segment.start_ms)}</span>
                <span>{segment.speaker_label ?? "Speaker"}</span>
              </div>
              <p>{segment.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="settings-card">
        <h2>Source</h2>
        <dl className="detail-list">
          <div>
            <dt>Model</dt>
            <dd>{String(transcript.model_metadata_json.model ?? "Unknown")}</dd>
          </div>
          <div>
            <dt>Language</dt>
            <dd>{transcript.language ?? "Not set"}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatLocalDateTime(transcript.created_at)}</dd>
          </div>
        </dl>
      </section>

      <div className="button-row">
        <PrimaryButton className={walkthroughEnabled ? "walkthrough-target" : undefined} icon={ScanSearch} onClick={() => { navigate(`/cases/${incidentId}/facts`); }}>
          {factSetQuery.data?.fact_set ? "Check details" : "Review details"}
        </PrimaryButton>
        <LinkButton icon={ArrowLeft} to={`/cases/${incidentId}/capture-saved`}>Back</LinkButton>
      </div>
    </main>
  );
}

export function FactsScreen({
  db,
  services,
  walkthroughEnabled,
}: {
  db: DossierDatabase;
  services: AppServices;
  walkthroughEnabled: boolean;
}) {
  const queryClient = useQueryClient();
  const { incidentId = "" } = useParams();
  const captureQuery = useQuery({
    queryKey: ["capture-context", incidentId],
    queryFn: () => getCaptureContext(db, incidentId),
    enabled: Boolean(incidentId),
  });
  const transcriptQuery = useQuery({
    queryKey: ["transcript-summary", incidentId],
    queryFn: () => getTranscriptSummary(db, incidentId),
    enabled: Boolean(incidentId),
  });
  const factSetQuery = useQuery({
    queryKey: ["fact-set-summary", incidentId],
    queryFn: () => getFactSetSummary(db, incidentId),
    enabled: Boolean(incidentId),
  });
  const routeSummaryQuery = useQuery({
    queryKey: ["route-recommendation-summary", incidentId],
    queryFn: () => getRouteRecommendationSummary(db, incidentId),
    enabled: Boolean(incidentId),
  });
  const [formState, setFormState] = useState<FactsFormState | null>(null);
  const [activeFactSet, setActiveFactSet] = useState<FactSetRecord | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const autoBuildStartedRef = useRef(false);

  useEffect(() => {
    if (!factSetQuery.data?.fact_set) {
      return;
    }

    setActiveFactSet(factSetQuery.data.fact_set);
    setFormState(factSetToForm(factSetQuery.data.fact_set));
    setEditing(false);
  }, [factSetQuery.data]);

  const extractMutation = useMutation({
    mutationFn: async () => {
      if (!transcriptQuery.data?.transcript) {
        throw new Error("transcript_missing");
      }

      const transcript = transcriptQuery.data.transcript;
      const capture = captureQuery.data;
      const result = await services.api.extract({
        incident_id: incidentId,
        transcript_evidence_id: transcript.id,
        transcript: {
          full_text: transcript.full_text,
          language: transcript.language,
          segment_count: transcript.segment_count,
          segments: transcriptQuery.data.segments.map((segment) => ({
            start_ms: segment.start_ms,
            end_ms: segment.end_ms,
            speaker_label: segment.speaker_label,
            text: segment.text,
            confidence: segment.confidence,
          })),
        },
        context: {
          location_address: capture?.incident.location_address ?? null,
          confirmed_place_id: capture?.incident.place_id ?? null,
          confirmed_place_name: capture?.incident.place_name ?? null,
          confirmed_place_phone: capture?.incident.place_phone ?? null,
        },
      });

      const saved = await saveFactSet(db, {
        incident_id: result.incident_id,
        transcript_evidence_id: result.transcript_evidence_id,
        fact_set_id: result.fact_set.fact_set_id,
        incident_type: result.fact_set.incident_type,
        people: result.fact_set.people,
        places: result.fact_set.places,
        businesses: result.fact_set.businesses,
        phones: result.fact_set.phones,
        dates: result.fact_set.dates,
        amounts: result.fact_set.amounts,
        timeline: result.fact_set.timeline,
        key_facts: result.fact_set.key_facts,
        reviewed_by_user: result.fact_set.reviewed_by_user,
        confirmed_fields: [],
        edited_fields: [],
        model_metadata_json: result.model_metadata as unknown as Record<string, unknown>,
        warnings_json: result.warnings,
      });

      queryClient.setQueryData<FactSetSummary | null>(["fact-set-summary", incidentId], {
        fact_set: saved,
      });
      await queryClient.invalidateQueries({ queryKey: ["fact-set-summary", incidentId] });
      return saved;
    },
    onSuccess: (saved) => {
      setActiveFactSet(saved);
      setFormState(factSetToForm(saved));
      setConfirmError(null);
      setEditing(false);
    },
  });

  useEffect(() => {
    if (!transcriptQuery.data?.transcript || factSetQuery.data?.fact_set || autoBuildStartedRef.current) {
      return;
    }

    autoBuildStartedRef.current = true;
    void extractMutation.mutateAsync().catch(() => undefined);
  }, [extractMutation, factSetQuery.data?.fact_set, transcriptQuery.data?.transcript]);

  const confirmMutation = useMutation({
    mutationFn: async () => {
      const currentFactSet = activeFactSet ?? factSetQuery.data?.fact_set ?? null;

      if (!currentFactSet || !formState) {
        throw new Error("fact_set_missing");
      }

      const editedFields = computeEditedFields(currentFactSet, formState);
      const confirmedFields = ["incident_type", "people", "places", "businesses", "phones", "dates", "amounts", "timeline", "key_facts"];

      const updated = await confirmFactSet(db, {
        incident_id: incidentId,
        fact_set_id: currentFactSet.id,
        incident_type: normalizeOptionalText(formState.incident_type),
        people: splitLines(formState.people),
        places: splitLines(formState.places),
        businesses: splitLines(formState.businesses),
        phones: splitLines(formState.phones),
        dates: splitLines(formState.dates),
        amounts: splitLines(formState.amounts),
        timeline: parseTimeline(formState.timeline),
        key_facts: splitLines(formState.key_facts),
        confirmed_fields: confirmedFields,
        edited_fields: editedFields,
      });

      if (!updated) {
        throw new Error("fact_set_missing");
      }

      queryClient.setQueryData<FactSetSummary | null>(["fact-set-summary", incidentId], {
        fact_set: updated,
      });
      await queryClient.invalidateQueries({ queryKey: ["fact-set-summary", incidentId] });
      return updated;
    },
    onSuccess: (updated) => {
      setActiveFactSet(updated);
      setFormState(factSetToForm(updated));
      setConfirmError(null);
      setEditing(false);
    },
    onError: () => {
      setConfirmError("The case details were not saved. Review any edits and try again.");
    },
  });

  if (captureQuery.isLoading || transcriptQuery.isLoading || factSetQuery.isLoading) {
    return <LoadingScreen title="Review details" body="Loading the extracted details for this case." />;
  }

  if (captureQuery.isError || !captureQuery.data || transcriptQuery.isError) {
    return <ScreenMessage title="Check case details" body="The saved case details could not be opened from local storage on this device." action={<LinkButton icon={ArrowLeft} to="/cases">Back to cases</LinkButton>} />;
  }

  if (!transcriptQuery.data?.transcript) {
    return <ScreenMessage title="Check case details" body="You need a transcript before Dossier can prepare the case details." action={<LinkButton icon={ScrollText} to={`/cases/${incidentId}/transcript`}>Review transcript</LinkButton>} />;
  }

  if (!factSetQuery.data?.fact_set && !formState && extractMutation.isPending) {
    return <LoadingScreen title="Check case details" body="Pulling names, places, dates, amounts, businesses, and timeline details from the transcript." />;
  }

  if (!factSetQuery.data?.fact_set && !formState) {
    return (
      <ScreenMessage
        title="Check case details"
        body="Dossier could not turn this transcript into case details yet."
        action={<PrimaryButton disabled={extractMutation.isPending} icon={RefreshCw} onClick={() => { void extractMutation.mutate(); }}>{extractMutation.isPending ? "Checking details" : "Try again"}</PrimaryButton>}
        footer={extractMutation.error ? <InlineError message={resolveExtractError(extractMutation.error)} /> : null}
      />
    );
  }

  if (!formState) {
    return <LoadingScreen title="Check case details" body="Loading the prepared details." />;
  }

  const reviewed = activeFactSet?.reviewed_by_user ?? factSetQuery.data?.fact_set.reviewed_by_user ?? false;
  const activeValues = activeFactSet ?? factSetQuery.data?.fact_set ?? null;
  const editedFields = activeValues ? computeEditedFields(activeValues, formState) : [];

  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">Check case details</h1>
        <p className="screen-body">Review what Dossier pulled from the transcript, fix anything wrong, then save.</p>
      </header>
      <section className="settings-card">
        <div className="section-heading">
          <h2>Review status</h2>
          <span className="status-chip">{reviewed ? "Saved" : "Needs review"}</span>
        </div>
        <p>{reviewed ? "These details were saved and added to the case history." : "These details were pulled from the transcript. Edit only if something is wrong or missing."}</p>
        {editedFields.length > 0 ? <InlineNote message={`Edited fields: ${editedFields.join(", ")}`} /> : <InlineNote message="No manual changes yet." />}
      </section>

      {editing ? (
        <>
          <section className="settings-card">
            <label className="field">
              <span>Case type</span>
              <select onChange={(event) => updateFactsField(setFormState, "incident_type", event.target.value)} value={CASE_TYPE_LABELS.has(formState.incident_type) ? formState.incident_type : ""}>
                <option value="">Not set</option>
                {CASE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <InlineNote message="Choose the closest case type. You can still edit details below." />
          </section>

          <section className="settings-card">
            <FactsTextarea label="Key facts" rows={4} value={formState.key_facts} onChange={(value) => updateFactsField(setFormState, "key_facts", value)} />
            <InlineNote message="Keep one clear fact per line." />
          </section>

          <section className="settings-card">
            <FactsTextarea label="Timeline" rows={4} value={formState.timeline} onChange={(value) => updateFactsField(setFormState, "timeline", value)} placeholder="One item per line. Use Time | Description" />
          </section>

          <section className="settings-card">
            <details>
              <summary>More extracted fields</summary>
              <div className="facts-grid">
                <FactsTextarea label="People named" rows={2} value={formState.people} onChange={(value) => updateFactsField(setFormState, "people", value)} />
                <FactsTextarea label="Place" rows={2} value={formState.places} onChange={(value) => updateFactsField(setFormState, "places", value)} />
                <FactsTextarea label="Business" rows={2} value={formState.businesses} onChange={(value) => updateFactsField(setFormState, "businesses", value)} />
                <FactsTextarea label="Phone numbers" rows={2} value={formState.phones} onChange={(value) => updateFactsField(setFormState, "phones", value)} />
                <FactsTextarea label="Dates" rows={2} value={formState.dates} onChange={(value) => updateFactsField(setFormState, "dates", value)} />
                <FactsTextarea label="Amounts" rows={2} value={formState.amounts} onChange={(value) => updateFactsField(setFormState, "amounts", value)} />
              </div>
            </details>
          </section>
        </>
      ) : (
        <>
          <section className="settings-card summary-grid">
            {buildFactSummaryCards(formState).map((card) => (
              <FactSummaryCard key={card.label} label={card.label} {...(card.value !== undefined ? { value: card.value } : {})} {...(card.values !== undefined ? { values: card.values } : {})} />
            ))}
          </section>

          <section className="settings-card">
            <h2>Timeline</h2>
            <FactTimelinePreview timeline={parseTimeline(formState.timeline)} />
          </section>

          <section className="settings-card">
            <h2>Key facts</h2>
            <FactPillList items={splitLines(formState.key_facts)} emptyLabel="No key facts were pulled from this capture." />
          </section>
        </>
      )}

      <div className="button-row">
        <PrimaryButton className={walkthroughEnabled ? "walkthrough-target" : undefined} disabled={confirmMutation.isPending} onClick={() => { void confirmMutation.mutate(); }}>
          {confirmMutation.isPending ? "Saving details" : "Save details"}
        </PrimaryButton>
        {editing ? (
          <button className="secondary-button" onClick={() => { if (activeValues) { setFormState(factSetToForm(activeValues)); } setEditing(false); }} type="button">
            Cancel changes
          </button>
        ) : (
          <button className="secondary-button" onClick={() => setEditing(true)} type="button">
            Edit
          </button>
        )}
        <LinkButton icon={MapPinned} to={`/cases/${incidentId}/routes`}>{routeSummaryQuery.data?.recommendations?.length ? "Choose where to report" : "Find reporting options"}</LinkButton>
        <LinkButton icon={Mic} to="/capture">New recording</LinkButton>
        {confirmError ? <InlineError message={confirmError} /> : null}
        {extractMutation.error ? <InlineError message={resolveExtractError(extractMutation.error)} /> : null}
      </div>
    </main>
  );
}

export function CasesScreen({
  db,
  demoCaseId,
}: {
  db: DossierDatabase;
  demoCaseId: string | null;
}) {
  const queryClient = useQueryClient();
  const [cases, setCases] = useState<IncidentRecord[]>([]);

  const loadCases = async () => {
    const records = await listRecentIncidents(db);
    setCases(records);
  };

  useEffect(() => {
    let active = true;
    void loadCases().then(() => {
      if (!active) {
        return;
      }
    });
    return () => {
      active = false;
    };
  }, [db]);

  const deleteMutation = useMutation({
    mutationFn: async (incidentId: string) => {
      await deleteIncidentCase(db, incidentId);
    },
    onSuccess: async () => {
      await Promise.all([loadCases(), queryClient.invalidateQueries({ queryKey: ["cases"] })]);
    },
  });

  const activeCase = cases[0] ?? null;
  const activeSummaryQuery = useQuery({
    queryKey: ["case-home-summary", activeCase?.id ?? ""],
    queryFn: () => getCaseFileSummary(db, activeCase?.id ?? ""),
    enabled: Boolean(activeCase?.id),
  });

  const activeSummary = activeSummaryQuery.data;
  const activeSelectedRoute = activeSummary?.routes.find((route) => route.selected) ?? null;
  const activeChecklist = activeSummary
    ? [
        Boolean(activeSummary.source_evidence),
        Boolean(activeSummary.transcript),
        Boolean(activeSummary.fact_set),
        Boolean(activeSelectedRoute),
        Boolean(activeSummary.draft_packet?.approved),
        Boolean(activeSummary.submission_proof),
      ]
    : [];
  const activeChecklistCount = activeChecklist.filter(Boolean).length;
  const activeProgress = activeChecklist.length > 0 ? Math.round((activeChecklistCount / activeChecklist.length) * 100) : 0;
  const activeNextHref =
    !activeSummary?.source_evidence
      ? "/capture"
      : !activeSummary.transcript
        ? `/cases/${activeCase?.id}/transcript`
        : !activeSummary.fact_set
          ? `/cases/${activeCase?.id}/facts`
          : !activeSelectedRoute
            ? `/cases/${activeCase?.id}/routes`
            : !activeSummary.draft_packet?.approved
              ? `/cases/${activeCase?.id}/draft`
              : !activeSummary.submission_proof
                ? `/cases/${activeCase?.id}/proof`
                : `/cases/${activeCase?.id}`;
  const activeNextLabel =
    !activeSummary?.source_evidence
      ? "Start first case"
      : !activeSummary.transcript
        ? "Create transcript"
        : !activeSummary.fact_set
          ? "Confirm details"
          : !activeSelectedRoute
            ? "Choose destination"
            : !activeSummary.draft_packet?.approved
              ? "Review report"
              : !activeSummary.submission_proof
                ? "Save filing receipt"
                : "Open dossier";

  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">Cases</h1>
        <p className="screen-body">Open a saved dossier, start a new case, or move the current one forward.</p>
      </header>
      {cases.length === 0 ? (
        <EmptyState title="No cases yet" detail="Start a recording to create your first case." />
      ) : (
        <>
          {activeCase ? (
            <section className="case-home-hero">
              <div className="case-home-hero__header">
                <div className="case-home-hero__eyebrow">
                  <span className="status-chip status-chip--selected">Active dossier</span>
                  <span className="status-chip">Case {activeCase.id}</span>
                </div>
                <h2>{formatCaseTypeLabel(activeSummary?.fact_set?.incident_type ?? activeCase.category) || "Case in progress"}</h2>
                <p>{activeCase.location_address ?? "Location not saved yet"}</p>
              </div>
              <div className="case-home-hero__stats">
                <article className="case-home-stat">
                  <span className="case-home-stat__label">Progress</span>
                  <strong>{activeProgress}%</strong>
                  <p>{activeChecklistCount} of 6 core steps complete.</p>
                </article>
                <article className="case-home-stat">
                  <span className="case-home-stat__label">Destination</span>
                  <strong>{activeSelectedRoute?.destination_name_snapshot ?? "Not selected"}</strong>
                  <p>{activeSelectedRoute?.source_label ?? "Choose a reporting path when you are ready."}</p>
                </article>
                <article className="case-home-stat">
                  <span className="case-home-stat__label">Report status</span>
                  <strong>{activeSummary?.draft_packet?.approved ? "Approved" : activeSummary?.draft_packet ? "Draft ready" : "Not started"}</strong>
                  <p>{activeSummary?.submission_proof ? "Filing receipt saved." : "Submission record not saved yet."}</p>
                </article>
              </div>
              <div className="case-home-hero__actions">
                <LinkButton icon={FolderOpen} to={activeNextHref}>
                  {activeNextLabel}
                </LinkButton>
                <LinkButton icon={MapPinned} to={`/cases/${activeCase.id}/routes`}>Open destinations</LinkButton>
                <LinkButton icon={Package} to={`/cases/${activeCase.id}/export`}>Open case packet</LinkButton>
              </div>
            </section>
          ) : null}

          <section className="case-home-section">
            <div className="section-heading">
              <h2>Recent dossiers</h2>
              <span className="status-chip">{cases.length} saved</span>
            </div>
            <ul className="case-list case-list--luxury">
              {cases.map((record, index) => (
                <li className={buildChipClassName("case-card", index === 0 && "case-card--active")} key={record.id}>
                  <div className="case-card__hero">
                    <div>
                      <p className="summary-stat-card__eyebrow">{index === 0 ? "Current focus" : "Saved dossier"}</p>
                      <h2>{formatCaseTypeLabel(record.category) || "Case"}</h2>
                      <p>{record.location_address ?? "Location unavailable"}</p>
                    </div>
                    <div className="route-card__chips">
                      <span className="status-chip">Case {record.id}</span>
                      {demoCaseId === record.id ? <span className="status-chip status-chip--selected">Demo</span> : null}
                    </div>
                  </div>
                  <div className="button-row">
                    <LinkButton icon={FolderOpen} to={`/cases/${record.id}`}>
                      Open dossier
                    </LinkButton>
                    <LinkButton icon={MapPinned} to={`/cases/${record.id}/routes`}>Destinations</LinkButton>
                    <button
                      className="secondary-button danger-button"
                      disabled={deleteMutation.isPending}
                      onClick={() => {
                        const confirmed = window.confirm("Delete this case and all saved items on this device?");
                        if (!confirmed) {
                          return;
                        }
                        void deleteMutation.mutate(record.id);
                      }}
                      type="button"
                    >
                      Delete case
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      {deleteMutation.error ? <InlineError message="Case delete did not finish. Try again." /> : null}
    </main>
  );
}

export function RoutesIndexScreen({
  db,
  demoCaseId,
  walkthroughEnabled,
}: {
  db: DossierDatabase;
  demoCaseId: string | null;
  walkthroughEnabled: boolean;
}) {
  const [cases, setCases] = useState<IncidentRecord[]>([]);

  useEffect(() => {
    let active = true;
    void listRecentIncidents(db).then((records) => {
      if (active) {
        setCases(records.filter((record) => Boolean(record.current_route_snapshot_id)));
      }
    });

    return () => {
      active = false;
    };
  }, [db]);

  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">Destinations</h1>
        <p className="screen-body">Review saved filing destinations for each case on this device.</p>
      </header>

      {cases.length === 0 ? (
        <EmptyState title="No destinations yet" detail="Check the case details first, then open destinations." />
      ) : (
        <ul className="case-list">
          {cases.map((record) => (
            <li className="case-card" key={record.id}>
              <h2>{record.title}</h2>
              <p>{formatCaseTypeLabel(record.category) || "No case type set"}</p>
              <LinkButton icon={MapPinned} to={`/cases/${record.id}/routes`}>
                Open destinations
              </LinkButton>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

export function CaseRoutesScreen({
  db,
  services,
}: {
  db: DossierDatabase;
  services: AppServices;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expandedRouteId, setExpandedRouteId] = useState<string | null>(null);
  const { incidentId = "" } = useParams();
  const captureQuery = useQuery({
    queryKey: ["capture-context", incidentId],
    queryFn: () => getCaptureContext(db, incidentId),
    enabled: Boolean(incidentId),
  });
  const factSetQuery = useQuery({
    queryKey: ["fact-set-summary", incidentId],
    queryFn: () => getFactSetSummary(db, incidentId),
    enabled: Boolean(incidentId),
  });
  const routesQuery = useQuery({
    queryKey: ["route-recommendation-summary", incidentId],
    queryFn: () => getRouteRecommendationSummary(db, incidentId),
    enabled: Boolean(incidentId),
  });
  const draftSummaryQuery = useQuery({
    queryKey: ["draft-packet-summary", incidentId],
    queryFn: () => getDraftPacketSummary(db, incidentId),
    enabled: Boolean(incidentId),
  });
  const autoRefreshRoutesRef = useRef(false);

  const recommendMutation = useMutation({
    mutationFn: async () => {
      if (!factSetQuery.data?.fact_set) {
        throw new Error("fact_set_missing");
      }

      const result = await services.api.recommendRoutes({
        incident_id: incidentId,
        fact_set: {
          fact_set_id: factSetQuery.data.fact_set.id,
          incident_type: factSetQuery.data.fact_set.incident_type,
          people: factSetQuery.data.fact_set.people,
          places: factSetQuery.data.fact_set.places,
          businesses: factSetQuery.data.fact_set.businesses,
          phones: factSetQuery.data.fact_set.phones,
          dates: factSetQuery.data.fact_set.dates,
          amounts: factSetQuery.data.fact_set.amounts,
          timeline: factSetQuery.data.fact_set.timeline,
          key_facts: factSetQuery.data.fact_set.key_facts,
          reviewed_by_user: factSetQuery.data.fact_set.reviewed_by_user,
        },
        context: {
          location_address: captureQuery.data?.incident.location_address ?? null,
          location_lat: captureQuery.data?.incident.location_lat ?? null,
          location_lng: captureQuery.data?.incident.location_lng ?? null,
          confirmed_place_name: captureQuery.data?.incident.place_name ?? null,
          confirmed_place_phone: captureQuery.data?.incident.place_phone ?? null,
          transcript_excerpt: factSetQuery.data.fact_set.key_facts.join(" "),
        },
      });

      await saveRouteRecommendations(db, {
        incident_id: incidentId,
        recommendations: result.recommendations.map((recommendation) => ({
          ...recommendation,
          incident_id: incidentId,
        })),
      });

      await queryClient.invalidateQueries({ queryKey: ["route-recommendation-summary", incidentId] });
      await queryClient.invalidateQueries({ queryKey: ["cases"] });
      return result;
    },
  });

  const selectMutation = useMutation({
    mutationFn: async (input: { routeRecommendationId: string; selected: boolean }) => {
      const selected = await selectRouteRecommendation(db, {
        incident_id: incidentId,
        route_recommendation_id: input.routeRecommendationId,
        selected: input.selected,
      });

      if (!selected) {
        throw new Error("route_missing");
      }

      await queryClient.invalidateQueries({ queryKey: ["route-recommendation-summary", incidentId] });
      await queryClient.invalidateQueries({ queryKey: ["cases"] });
      return selected;
    },
  });

  async function selectRouteForCase(routeRecommendationId: string) {
    await selectMutation.mutateAsync({
      routeRecommendationId,
      selected: true,
    });
  }

  async function beginReportForRoute(routeRecommendationId: string) {
    await selectRouteForCase(routeRecommendationId);
    navigate(`/cases/${incidentId}/draft`);
  }

  useEffect(() => {
    const savedRouteCount = routesQuery.data?.recommendations?.length ?? 0;
    if (savedRouteCount === 0 || savedRouteCount >= 4) {
      return;
    }
    if (recommendMutation.isPending || autoRefreshRoutesRef.current || !factSetQuery.data?.fact_set) {
      return;
    }

    autoRefreshRoutesRef.current = true;
    void recommendMutation.mutate();
  }, [factSetQuery.data?.fact_set, recommendMutation, routesQuery.data?.recommendations?.length]);

  useEffect(() => {
    const primaryRoute = routesQuery.data?.recommendations.find((route) => route.selected) ?? routesQuery.data?.recommendations[0] ?? null;
    if (!primaryRoute) {
      return;
    }
    setExpandedRouteId((current) => current ?? primaryRoute.id);
  }, [routesQuery.data?.recommendations]);

  if (captureQuery.isLoading || factSetQuery.isLoading || routesQuery.isLoading) {
    return <LoadingScreen title="Choose where to report" body="Loading reporting options for this case." />;
  }

  if (captureQuery.isError || !captureQuery.data || factSetQuery.isError) {
    return <ScreenMessage title="Choose where to report" body="The saved case details could not be opened from local storage on this device." action={<LinkButton icon={ArrowLeft} to="/cases">Back to cases</LinkButton>} />;
  }

  if (!factSetQuery.data?.fact_set) {
    return <ScreenMessage title="Choose where to report" body="Save the case details before Dossier can suggest where to report." action={<LinkButton icon={ScanSearch} to={`/cases/${incidentId}/facts`}>Check details</LinkButton>} />;
  }

  if (!routesQuery.data?.recommendations?.length) {
    return (
      <ScreenMessage
        title="Choose where to report"
        body="There are no saved reporting options for this case yet."
        action={<PrimaryButton disabled={recommendMutation.isPending} icon={MapPinned} onClick={() => { void recommendMutation.mutate(); }}>{recommendMutation.isPending ? "Finding options" : "Find reporting options"}</PrimaryButton>}
        footer={recommendMutation.error ? <InlineError message={resolveRouteRecommendationError(recommendMutation.error)} /> : null}
      />
    );
  }

  const selectedRoute = routesQuery.data.recommendations.find((route) => route.selected) ?? null;
  const primaryRoute = selectedRoute ?? routesQuery.data.recommendations[0] ?? null;
  const approvedDraft = draftSummaryQuery.data?.draft_packet && draftSummaryQuery.data.draft_packet.approved
    ? { subject: draftSummaryQuery.data.draft_packet.subject, body: draftSummaryQuery.data.draft_packet.body }
    : null;

  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">Choose where to report</h1>
        <p className="screen-body">Pick one active destination for this dossier. That route drives the brief, filing receipt, and export packet.</p>
      </header>
      <section className="settings-card settings-card--subtle">
        <div className="section-heading">
          <h2>How this works</h2>
          <span className="status-chip">{selectedRoute ? "One route active" : "No route active yet"}</span>
        </div>
        <p>Use <strong>Write report</strong> to make any destination current and open the brief immediately.</p>
        <p>Use <strong>Make current</strong> only when you want to switch the active destination without leaving this screen.</p>
      </section>

      {primaryRoute ? (
        <section className="destination-hero">
          <div className="destination-hero__header">
            <div>
              <p className="summary-stat-card__eyebrow">{selectedRoute ? "Current filing path" : "Recommended filing path"}</p>
              <h2>{primaryRoute.destination_name_snapshot}</h2>
              <p>{primaryRoute.reason}</p>
            </div>
            <div className="route-card__chips">
              <span className={routeGroupChipClass(primaryRoute.route_group)}>{primaryRoute.route_group}</span>
              <span className={trustChipClass(primaryRoute.trust_level)}>{primaryRoute.trust_level}</span>
              <span className={destinationTypeChipClass(primaryRoute.destination_type_snapshot)}>{primaryRoute.destination_type_snapshot.replaceAll("_", " ")}</span>
            </div>
          </div>
          <div className="destination-hero__meta">
            <article>
              <span>Source</span>
              <strong>{primaryRoute.source_label}</strong>
            </article>
            <article>
              <span>How to send</span>
              <strong>{primaryRoute.intake_methods_snapshot.join(", ")}</strong>
            </article>
            <article>
              <span>Registry status</span>
              <strong>{primaryRoute.last_verified_date ?? "Current route registry"}</strong>
            </article>
          </div>
          <div className="destination-hero__actions">
            <PrimaryButton
              disabled={selectMutation.isPending}
              icon={NotebookPen}
              onClick={() => {
                void beginReportForRoute(primaryRoute.id);
              }}
            >
              {primaryRoute.selected ? "Open brief" : "Write report"}
            </PrimaryButton>
            <button
              className="secondary-button"
              disabled={primaryRoute.selected || selectMutation.isPending}
              onClick={() => {
                void selectRouteForCase(primaryRoute.id);
              }}
              type="button"
            >
              <MapPinned aria-hidden="true" />
              {primaryRoute.selected ? "Current destination" : "Make current"}
            </button>
            <button
              className="secondary-button"
              disabled={recommendMutation.isPending}
              onClick={() => {
                autoRefreshRoutesRef.current = true;
                void recommendMutation.mutate();
              }}
              type="button"
            >
              <RefreshCw aria-hidden="true" />
              {recommendMutation.isPending ? "Refreshing" : "Refresh options"}
            </button>
          </div>
        </section>
      ) : null}

      <div className="destination-picker">
        {routesQuery.data.recommendations.map((recommendation) => (
          <section className={buildChipClassName("route-option-card", recommendation.selected && "route-option-card--selected")} key={recommendation.id}>
            <div className="route-option-card__summary">
              <div className="route-option-card__copy">
                <div className="section-heading">
                  <h2>{recommendation.destination_name_snapshot}</h2>
                  <span className="status-chip">{routePriorityLabel(recommendation.rank)}</span>
                </div>
                <p>{recommendation.reason}</p>
              </div>
              <div className="route-card__chips">
                <span className={routeGroupChipClass(recommendation.route_group)}>{recommendation.route_group}</span>
                <span className={trustChipClass(recommendation.trust_level)}>{recommendation.trust_level}</span>
                {recommendation.selected ? <span className="status-chip status-chip--selected">Active route</span> : null}
              </div>
            </div>
            <div className="route-card__chips">
              <span className={destinationTypeChipClass(recommendation.destination_type_snapshot)}>{recommendation.destination_type_snapshot.replaceAll("_", " ")}</span>
              <span className="status-chip">{recommendation.source_label}</span>
            </div>
            <div className="button-row">
              <PrimaryButton
                disabled={selectMutation.isPending}
                icon={NotebookPen}
                onClick={() => {
                  void beginReportForRoute(recommendation.id);
                }}
              >
                {recommendation.selected ? "Open brief" : "Write report"}
              </PrimaryButton>
              <button
                className="secondary-button"
                disabled={recommendation.selected || selectMutation.isPending}
                onClick={() => {
                  void selectRouteForCase(recommendation.id);
                }}
                type="button"
              >
                <MapPinned aria-hidden="true" />
                {recommendation.selected ? "Current destination" : "Make current"}
              </button>
              <button
                className="secondary-button"
                onClick={() => {
                  setExpandedRouteId((current) => (current === recommendation.id ? null : recommendation.id));
                }}
                type="button"
              >
                <SlidersHorizontal aria-hidden="true" />
                {expandedRouteId === recommendation.id ? "Hide details" : "Details"}
              </button>
            </div>
            {expandedRouteId === recommendation.id ? (
              <div className={buildChipClassName("route-card__selected-panel", recommendation.selected && "route-card__selected-panel--active")}>
                <dl className="detail-list">
                  <div>
                    <dt>Source</dt>
                    <dd>{recommendation.source_label}</dd>
                  </div>
                  <div>
                    <dt>Last verified</dt>
                    <dd>{recommendation.last_verified_date ?? "Not set"}</dd>
                  </div>
                  <div>
                    <dt>How to send</dt>
                    <dd>{recommendation.intake_methods_snapshot.join(", ")}</dd>
                  </div>
                  {recommendation.phone ? (
                    <div>
                      <dt>Phone</dt>
                      <dd>{recommendation.phone}</dd>
                    </div>
                  ) : null}
                  {recommendation.email ? (
                    <div>
                      <dt>Email</dt>
                      <dd>{recommendation.email}</dd>
                    </div>
                  ) : null}
                  {recommendation.mailing_address ? (
                    <div>
                      <dt>Mailing address</dt>
                      <dd>{recommendation.mailing_address}</dd>
                    </div>
                  ) : null}
                </dl>
                {recommendation.required_documents_snapshot.length > 0 ? <p>Likely needed: {recommendation.required_documents_snapshot.join(", ")}</p> : null}
                <div className="button-row">
                  {recommendation.source_url ? (
                    <a className="secondary-button" href={recommendation.source_url} rel="noreferrer" target="_blank">
                      <ExternalLink aria-hidden="true" />
                      Source
                    </a>
                  ) : null}
                  {recommendation.complaint_url ? (
                    <a className="secondary-button" href={recommendation.complaint_url} rel="noreferrer" target="_blank">
                      <ExternalLink aria-hidden="true" />
                      Official form
                    </a>
                  ) : null}
                  {recommendation.phone ? (
                    <a className="secondary-button" href={`tel:${recommendation.phone}`}>
                      <Phone aria-hidden="true" />
                      Call
                    </a>
                  ) : null}
                  {recommendation.email ? (
                    <a className="secondary-button" href={`mailto:${recommendation.email}`}>
                      <Mail aria-hidden="true" />
                      Email
                    </a>
                  ) : null}
                  {recommendation.selected && approvedDraft ? (
                    <button
                      className="secondary-button"
                      onClick={() => {
                        navigate(`/cases/${incidentId}/send`);
                      }}
                      type="button"
                    >
                      <Send aria-hidden="true" />
                      Send report
                    </button>
                  ) : null}
                </div>
                {recommendation.selected ? (
                  approvedDraft ? (
                    <SendActionPanel approvedDraft={approvedDraft} db={db} incidentId={incidentId} selectedRoute={recommendation} services={services} />
                  ) : (
                    <InlineNote message="Approve the report draft first, then the send actions will appear here for the active route." />
                  )
                ) : null}
              </div>
            ) : null}
          </section>
        ))}
      </div>

      <div className="button-row">
        <LinkButton icon={ArrowLeft} to={`/cases/${incidentId}/facts`}>Back to details</LinkButton>
        <LinkButton icon={FolderOpen} to={`/cases/${incidentId}`}>Open dossier</LinkButton>
        <LinkButton icon={MapPinned} to="/routes">All routes</LinkButton>
      </div>
    </main>
  );
}

export function DraftReportScreen({
  db,
  services,
}: {
  db: DossierDatabase;
  services: AppServices;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { incidentId = "" } = useParams();
  const factSetQuery = useQuery({
    queryKey: ["fact-set-summary", incidentId],
    queryFn: () => getFactSetSummary(db, incidentId),
    enabled: Boolean(incidentId),
  });
  const routeSummaryQuery = useQuery({
    queryKey: ["route-recommendation-summary", incidentId],
    queryFn: () => getRouteRecommendationSummary(db, incidentId),
    enabled: Boolean(incidentId),
  });
  const draftQuery = useQuery({
    queryKey: ["draft-packet-summary", incidentId],
    queryFn: () => getDraftPacketSummary(db, incidentId),
    enabled: Boolean(incidentId),
  });
  const [formState, setFormState] = useState<DraftFormState | null>(null);
  const autoDraftRequestedRef = useRef(false);

  const selectedRoute = routeSummaryQuery.data?.recommendations.find((route) => route.selected) ?? null;

  function buildDraftClipboardText(input: DraftFormState, route: RouteRecommendationRecord) {
    return [
      `Subject: ${input.subject.trim()}`,
      "",
      input.body.trim(),
      "",
      `Destination: ${route.destination_name_snapshot}`,
      `Source: ${route.source_label}`,
      route.complaint_url ? `Official form: ${route.complaint_url}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  useEffect(() => {
    if (!draftQuery.data?.draft_packet) {
      return;
    }

    setFormState({
      subject: draftQuery.data.draft_packet.subject,
      body: draftQuery.data.draft_packet.body,
    });
  }, [draftQuery.data]);

  const buildDraftMutation = useMutation({
    mutationFn: async () => {
      const factSet = factSetQuery.data?.fact_set;
      if (!factSet || !selectedRoute) {
        throw new Error("draft_prerequisites_missing");
      }

      const result = await services.api.draft({
        incident_id: incidentId,
        route_recommendation_id: selectedRoute.id,
        route: {
          destination_id: selectedRoute.destination_id,
          destination_name_snapshot: selectedRoute.destination_name_snapshot,
          destination_type_snapshot: selectedRoute.destination_type_snapshot,
          route_group: selectedRoute.route_group,
          rank: selectedRoute.rank,
          reason: selectedRoute.reason,
          source_label: selectedRoute.source_label,
          source_url: selectedRoute.source_url,
          trust_level: selectedRoute.trust_level,
          last_verified_date: selectedRoute.last_verified_date,
          intake_methods_snapshot: selectedRoute.intake_methods_snapshot,
          required_documents_snapshot: selectedRoute.required_documents_snapshot,
          available_actions: selectedRoute.available_actions,
        },
        fact_set: factSetRecordToDto(factSet),
      });

      const saved = await saveDraftPacket(db, {
        incident_id: result.incident_id,
        route_recommendation_id: result.route_recommendation_id,
        draft_packet_id: result.draft_packet.draft_packet_id,
        subject: result.draft_packet.subject,
        body: result.draft_packet.body,
        attachment_labels: result.draft_packet.attachment_labels,
        approved: result.draft_packet.approved,
        model_metadata_json: result.model_metadata as unknown as Record<string, unknown>,
        warnings_json: result.warnings,
      });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["draft-packet-summary", incidentId] }),
        queryClient.invalidateQueries({ queryKey: ["case-file-summary", incidentId] }),
        queryClient.invalidateQueries({ queryKey: ["cases"] }),
      ]);

      return saved;
    },
    onSuccess: (saved) => {
      setFormState({
        subject: saved.subject,
        body: saved.body,
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      const currentDraft = draftQuery.data?.draft_packet;
      if (!currentDraft || !formState) {
        throw new Error("draft_missing");
      }

      const updated = await approveDraftPacket(db, {
        incident_id: incidentId,
        draft_packet_id: currentDraft.id,
        subject: formState.subject.trim(),
        body: formState.body.trim(),
        attachment_labels: currentDraft.attachment_labels,
      });

      if (!updated) {
        throw new Error("draft_missing");
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["draft-packet-summary", incidentId] }),
        queryClient.invalidateQueries({ queryKey: ["case-file-summary", incidentId] }),
        queryClient.invalidateQueries({ queryKey: ["cases"] }),
      ]);

      return updated;
    },
    onSuccess: async () => {
      if (formState && selectedRoute) {
        await copyTextToClipboard(buildDraftClipboardText(formState, selectedRoute));
      }
      void navigate(`/cases/${incidentId}/send`);
    },
  });

  useEffect(() => {
    if (!factSetQuery.data?.fact_set || !selectedRoute) {
      return;
    }
    if (formState || buildDraftMutation.isPending || draftQuery.data?.draft_packet || autoDraftRequestedRef.current) {
      return;
    }
    autoDraftRequestedRef.current = true;
    void buildDraftMutation.mutate();
  }, [buildDraftMutation, draftQuery.data?.draft_packet, factSetQuery.data?.fact_set, formState, selectedRoute]);

  if (factSetQuery.isLoading || routeSummaryQuery.isLoading || draftQuery.isLoading) {
    return <LoadingScreen title="Write report" body="Preparing the report draft for this case." />;
  }

  if (!factSetQuery.data?.fact_set) {
    return <ScreenMessage title="Write report" body="You need saved case details before Dossier can draft the report." action={<LinkButton icon={ScanSearch} to={`/cases/${incidentId}/facts`}>Check details</LinkButton>} />;
  }

  if (!selectedRoute) {
    return <ScreenMessage title="Write report" body="Choose where to report before Dossier drafts the report." action={<LinkButton icon={MapPinned} to={`/cases/${incidentId}/routes`}>Choose where to report</LinkButton>} />;
  }

  if (!formState) {
    return (
      <ScreenMessage
        title="Write report"
        body={buildDraftMutation.error ? "Dossier could not build the brief from the saved facts and selected destination. Retry to continue." : "Creating your report from the saved facts and selected destination."}
        action={buildDraftMutation.error ? <PrimaryButton icon={RefreshCw} onClick={() => void buildDraftMutation.mutate()}>Retry draft</PrimaryButton> : null}
        footer={buildDraftMutation.error ? <InlineError message={resolveDraftError(buildDraftMutation.error)} /> : null}
      />
    );
  }

  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">Write report</h1>
        <p className="screen-body">Shape the official brief for this dossier. Once approved, this becomes the report you send, share, archive, and prove.</p>
      </header>

      <section className="document-hero">
        <div className="document-hero__header">
          <div>
            <p className="summary-stat-card__eyebrow">Prepared brief</p>
            <h2>{formState.subject || "Untitled report"}</h2>
            <p>{selectedRoute.destination_name_snapshot}</p>
          </div>
          <div className="route-card__chips">
            <span className="status-chip status-chip--selected">Built locally</span>
            <span className={trustChipClass(selectedRoute.trust_level)}>{selectedRoute.trust_level}</span>
            <span className={routeGroupChipClass(selectedRoute.route_group)}>{selectedRoute.route_group}</span>
          </div>
        </div>
        <div className="document-hero__meta">
          <article>
            <span>Destination</span>
            <strong>{selectedRoute.destination_name_snapshot}</strong>
          </article>
          <article>
            <span>Delivery path</span>
            <strong>{selectedRoute.intake_methods_snapshot.join(", ")}</strong>
          </article>
          <article>
            <span>Case route</span>
            <strong>{selectedRoute.source_label}</strong>
          </article>
        </div>
      </section>

      <section className="settings-card settings-card--editor">
        <div className="section-heading">
          <h2>Refine the brief</h2>
          <span className="status-chip">Preview updates live</span>
        </div>
        <label className="field">
          <span>Subject</span>
          <input
            onChange={(event) =>
              setFormState((current) =>
                current
                  ? {
                      ...current,
                      subject: event.target.value,
                    }
                  : current,
              )
            }
            type="text"
            value={formState.subject}
          />
        </label>
        <FactsTextarea
          label="Report text"
          value={formState.body}
          onChange={(value) =>
            setFormState((current) =>
              current
                ? {
                    ...current,
                    body: value,
                  }
                : current,
            )
          }
        />
        <InlineNote message="Keep it direct: what happened, who is involved, what proof is attached, and what action you want from the recipient." />
      </section>

      <section className="report-preview-card">
        <div className="report-preview-card__header">
          <div className="report-preview-card__badge">
            <FileText aria-hidden="true" />
            <span>Official brief preview</span>
          </div>
          <span className="status-chip">Case {incidentId}</span>
        </div>
        <article className="report-document">
          <header className="report-document__header report-document__header--luxury">
            <div className="report-document__seal">
              <span>Dossier</span>
              <strong>Prepared locally</strong>
            </div>
            <div>
              <p className="report-document__eyebrow">Prepared brief</p>
              <h2>{formState.subject || "Untitled report"}</h2>
            </div>
            <dl className="report-document__meta">
              <div>
                <dt>Destination</dt>
                <dd>{selectedRoute.destination_name_snapshot}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{selectedRoute.source_label}</dd>
              </div>
              <div>
                <dt>Delivery</dt>
                <dd>{selectedRoute.intake_methods_snapshot.join(", ")}</dd>
              </div>
              <div>
                <dt>Case</dt>
                <dd>{incidentId}</dd>
              </div>
            </dl>
          </header>
          <section className="report-document__section">
            <h3>Statement</h3>
            <div className="report-document__body">
              {(formState.body.trim().length > 0 ? formState.body : "Add the report text above to preview the document.")
                .split(/\n{2,}/)
                .map((paragraph, index) => (
                  <p key={`${paragraph}:${index}`}>{paragraph}</p>
                ))}
            </div>
          </section>
          <section className="report-document__section">
            <h3>Provenance</h3>
            <div className="report-document__provenance">
              <div>
                <span>Preparation mode</span>
                <strong>Local-first</strong>
              </div>
              <div>
                <span>Routing source</span>
                <strong>{selectedRoute.source_label}</strong>
              </div>
              <div>
                <span>Trust level</span>
                <strong>{selectedRoute.trust_level}</strong>
              </div>
            </div>
          </section>
          <section className="report-document__section">
            <h3>Included with this report</h3>
            <ul className="report-document__attachments">
              {(draftQuery.data?.draft_packet.attachment_labels ?? []).map((label) => (
                <li key={label}>
                  <CheckCircle2 aria-hidden="true" />
                  <span>{label}</span>
                </li>
              ))}
            </ul>
          </section>
        </article>
      </section>

      <section className="settings-card">
        <div className="section-heading">
          <h2>Evidence packet</h2>
          <span className="status-chip">{(draftQuery.data?.draft_packet.attachment_labels ?? []).length} attachments</span>
        </div>
        <ul className="inline-list">
          {(draftQuery.data?.draft_packet.attachment_labels ?? []).map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </section>

      <section className="settings-card settings-card--subtle">
        <h2>Send actions</h2>
        <p>These actions stay tied to the approved brief and the active route.</p>
        <SendActionPanel
          approvedDraft={draftQuery.data?.draft_packet ? { subject: formState.subject, body: formState.body } : null}
          db={db}
          incidentId={incidentId}
          selectedRoute={selectedRoute}
          services={services}
        />
      </section>

      <div className="button-row">
        <PrimaryButton disabled={approveMutation.isPending} icon={ClipboardCheck} onClick={() => { void approveMutation.mutate(); }}>
          {approveMutation.isPending ? "Approving brief" : "Approve brief"}
        </PrimaryButton>
        <LinkButton icon={ArrowLeft} to={`/cases/${incidentId}/routes`}>Back to destinations</LinkButton>
        {approveMutation.error ? <InlineError message="Brief approval did not finish. Try again." /> : null}
      </div>
    </main>
  );
}

export function SendHandoffScreen({
  db,
  services,
}: {
  db: DossierDatabase;
  services: AppServices;
}) {
  const { incidentId = "" } = useParams();
  const caseSummaryQuery = useQuery({
    queryKey: ["case-file-summary", incidentId],
    queryFn: () => getCaseFileSummary(db, incidentId),
    enabled: Boolean(incidentId),
  });

  const selectedRoute = caseSummaryQuery.data?.routes.find((route) => route.selected) ?? null;
  const approvedDraft = caseSummaryQuery.data?.draft_packet?.approved ? caseSummaryQuery.data.draft_packet : null;

  if (caseSummaryQuery.isLoading) {
    return <LoadingScreen title="Send report" body="Preparing the report actions for this case." />;
  }

  if (!caseSummaryQuery.data) {
    return <ScreenMessage title="Send report" body="This case could not be opened from local storage on this device." action={<LinkButton icon={ArrowLeft} to="/cases">Back to cases</LinkButton>} />;
  }

  if (!selectedRoute) {
    return <ScreenMessage title="Send report" body="Choose where to report before sending anything." action={<LinkButton icon={MapPinned} to={`/cases/${incidentId}/routes`}>Choose where to report</LinkButton>} />;
  }

  if (!approvedDraft) {
    return <ScreenMessage title="Send report" body="Approve the report draft before sending or sharing it." action={<LinkButton icon={NotebookPen} to={`/cases/${incidentId}/draft`}>Open report draft</LinkButton>} />;
  }

  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">Send report</h1>
        <p className="screen-body">Choose the handoff path that fits this destination, then return here to save the filing receipt.</p>
      </header>

      <section className="settings-card">
        <div className="section-heading">
          <h2>Before you send</h2>
          <span className="status-chip">{selectedRoute.destination_name_snapshot}</span>
        </div>
        <ul className="inline-list">
          <li>Business or agency name confirmed</li>
          <li>Date and amount confirmed</li>
          <li>Outcome request is clear</li>
          <li>Proof packet attached</li>
        </ul>
      </section>

      <section className="settings-card settings-card--subtle">
        <dl className="detail-list">
          <div>
            <dt>Selected option</dt>
            <dd>{selectedRoute.destination_name_snapshot}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>{selectedRoute.source_label}</dd>
          </div>
          <div>
            <dt>Trust</dt>
            <dd>{selectedRoute.trust_level}</dd>
          </div>
        </dl>
        <InlineNote message="Official sites open outside Dossier. The case stays saved locally so you can come back and record what happened after the handoff." />
      </section>

      <SendActionPanel approvedDraft={{ subject: approvedDraft.subject, body: approvedDraft.body }} db={db} incidentId={incidentId} selectedRoute={selectedRoute} services={services} />

      <div className="button-row">
        <LinkButton icon={Shield} to={`/cases/${incidentId}/proof`}>Save confirmation</LinkButton>
        <LinkButton icon={FolderOpen} to={`/cases/${incidentId}`}>Open dossier</LinkButton>
        <LinkButton icon={ArrowLeft} to={`/cases/${incidentId}/draft`}>Back to brief draft</LinkButton>
      </div>
    </main>
  );
}

export function SendActionPanel({
  approvedDraft,
  db,
  incidentId,
  selectedRoute,
  services,
}: {
  approvedDraft: { subject: string; body: string } | null;
  db: DossierDatabase;
  incidentId: string;
  selectedRoute: RouteRecommendationRecord;
  services: AppServices;
}) {
  const queryClient = useQueryClient();
  const [actionNote, setActionNote] = useState<string | null>(null);
  const hasManualFallbackDetails = Boolean(selectedRoute.complaint_url || selectedRoute.email || selectedRoute.phone);

  function buildClipboardReportText() {
    if (!approvedDraft) {
      return null;
    }

    return [
      `Subject: ${approvedDraft.subject}`,
      "",
      approvedDraft.body,
      "",
      `Destination: ${selectedRoute.destination_name_snapshot}`,
      `Source: ${selectedRoute.source_label}`,
      selectedRoute.complaint_url ? `Official form: ${selectedRoute.complaint_url}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  async function recordAction(input: {
    method: "web_form" | "email" | "phone" | "mail" | "share";
    status: "attempted" | "sent" | "submitted" | "shared" | "called" | "saved";
    externalReferenceUrl: string | null;
  }) {
    await recordSendAction(db, {
      incident_id: incidentId,
      route_recommendation_id: selectedRoute.id,
      method: input.method,
      status: input.status,
      destination_name_snapshot: selectedRoute.destination_name_snapshot,
      source_label: selectedRoute.source_label,
      trust_level: selectedRoute.trust_level,
      external_reference_url: input.externalReferenceUrl,
    });

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["case-file-summary", incidentId] }),
      queryClient.invalidateQueries({ queryKey: ["cases"] }),
    ]);
  }

  async function createPacketExport(format: "pdf" | "zip") {
    const summary = await getCaseFileSummary(db, incidentId);
    if (!summary) {
      return null;
    }

    if (format === "pdf") {
      const { buildCasePdf } = await loadCaseExportTools();
      const pdfBytes = await buildCasePdf(summary);
      const pdfBuffer = copyBuffer(pdfBytes);
      await createExportEvidence(db, {
        incident_id: incidentId,
        filename: `dossier-case-${incidentId}.pdf`,
        mime_type: "application/pdf",
        bytes: pdfBuffer,
        route_recommendation_id: selectedRoute.id,
        format: "pdf",
      });

      return {
        filename: `dossier-case-${incidentId}.pdf`,
        blob: new Blob([pdfBuffer], { type: "application/pdf" }),
      };
    }

    const { buildCaseZip } = await loadCaseExportTools();
    const zipBytes = await buildCaseZip(summary);
    const zipBuffer = copyBuffer(zipBytes);
    await createExportEvidence(db, {
      incident_id: incidentId,
      filename: `dossier-case-${incidentId}.zip`,
      mime_type: "application/zip",
      bytes: zipBuffer,
      route_recommendation_id: selectedRoute.id,
      format: "zip",
    });

    return {
      filename: `dossier-case-${incidentId}.zip`,
      blob: new Blob([zipBuffer], { type: "application/zip" }),
    };
  }

  async function copyApprovedDraftToClipboard() {
    const clipboardText = buildClipboardReportText();
    if (!clipboardText) {
      setActionNote("Approve the draft report first, then copy the report text.");
      return false;
    }

    const copied = await copyTextToClipboard(clipboardText);
    setActionNote(copied ? "The report text was copied to your clipboard." : "Clipboard access is not available in this browser right now.");
    return copied;
  }

  async function copyManualValue(value: string | null, successMessage: string, fallbackMessage: string) {
    if (!value) {
      setActionNote(fallbackMessage);
      return false;
    }

    const copied = await copyTextToClipboard(value);
    setActionNote(copied ? successMessage : "Clipboard access is not available in this browser right now.");
    return copied;
  }

  return (
    <>
      {!approvedDraft ? <InlineNote message="Approve the report draft to unlock email and share actions." /> : null}
      <section className="action-grid">
        <button
          className="action-card"
          disabled={!selectedRoute.complaint_url}
          onClick={() => {
            const complaintUrl = selectedRoute.complaint_url;
            if (!complaintUrl) {
              return;
            }

            void (async () => {
              const copied = approvedDraft ? await copyApprovedDraftToClipboard() : false;
              await services.openExternal(complaintUrl);
              await recordAction({
                method: "web_form",
                status: "attempted",
                externalReferenceUrl: complaintUrl,
              });
              setActionNote(
                copied
                  ? "The official site opened outside Dossier and the report text was copied to your clipboard."
                  : "The official site opened outside Dossier. Use the manual handoff details below if you need to copy the route information first.",
              );
            })();
          }}
          type="button"
        >
          <span className="action-card__icon"><ExternalLink aria-hidden="true" /></span>
          <strong className="action-card__title">Open official form</strong>
          <span>{selectedRoute.complaint_url ? "Open the official website for this agency or business." : "No official form is listed for this option."}</span>
        </button>

        <button
          className="action-card"
          disabled={!approvedDraft}
          onClick={() => {
            if (!approvedDraft) {
              return;
            }
            const target = buildMailtoUrl(selectedRoute.email, approvedDraft.subject, approvedDraft.body);
            void (async () => {
              const copied = await copyApprovedDraftToClipboard();
              await services.openExternal(target);
              await recordAction({
                method: "email",
                status: "attempted",
                externalReferenceUrl: selectedRoute.email ? `mailto:${selectedRoute.email}` : null,
              });
              setActionNote(
                copied
                  ? "Your email app was opened and the report text was copied to your clipboard."
                  : "Your email app was opened. Use the manual handoff details below if you need to copy the report or destination details first.",
              );
            })();
          }}
          type="button"
        >
          <span className="action-card__icon"><Mail aria-hidden="true" /></span>
          <strong className="action-card__title">Open in email</strong>
          <span>{selectedRoute.email ?? "Prepare an email with the report text and proof packet."}</span>
        </button>

        <button
          className="action-card"
          disabled={!selectedRoute.phone}
          onClick={() => {
            if (!selectedRoute.phone) {
              return;
            }

            void services.openExternal(`tel:${selectedRoute.phone}`).then(async () => {
              await recordAction({
                method: "phone",
                status: "called",
                externalReferenceUrl: null,
              });
              setActionNote("The call action opened outside Dossier. Return here after the call to save proof.");
            });
          }}
          type="button"
        >
          <span className="action-card__icon"><Phone aria-hidden="true" /></span>
          <strong className="action-card__title">Call now</strong>
          <span>{selectedRoute.phone ?? "No phone number is listed for this option."}</span>
        </button>

        <button
          className="action-card"
          disabled={!approvedDraft}
          onClick={() => {
            if (!approvedDraft) {
              return;
            }
            void (async () => {
              const packet = await createPacketExport("pdf");
              if (!packet) {
                return;
              }

              const file = new File([packet.blob], packet.filename, { type: packet.blob.type });
              const shared = await services.share({
                title: approvedDraft.subject,
                text: approvedDraft.body,
                files: [file],
              });

              if (shared) {
                await recordShareCompleted(db, {
                  incident_id: incidentId,
                  route_recommendation_id: selectedRoute.id,
                  destination_name_snapshot: selectedRoute.destination_name_snapshot,
                  shared_items: [packet.filename],
                });
                await recordAction({
                  method: "share",
                  status: "shared",
                  externalReferenceUrl: null,
                });
                setActionNote("The packet was shared. Save proof when you are ready.");
                return;
              }

              await services.downloadFile(packet);
              await queryClient.invalidateQueries({ queryKey: ["case-file-summary", incidentId] });
              const copied = await copyApprovedDraftToClipboard();
              setActionNote(
                copied
                  ? "Share is not available in this browser. The PDF packet was downloaded and the report text was copied to your clipboard."
                  : "Share is not available in this browser. The PDF packet was downloaded instead. Use the manual handoff details below if you need to copy the report text.",
              );
            })();
          }}
          type="button"
        >
          <span className="action-card__icon"><Share2 aria-hidden="true" /></span>
          <strong className="action-card__title">Share packet</strong>
          <span>Use the device share sheet when available. On the web, Dossier falls back to download and manual handoff.</span>
        </button>

        <button
          className="action-card"
          disabled={!approvedDraft}
          onClick={() => {
            void copyApprovedDraftToClipboard();
          }}
          type="button"
        >
          <span className="action-card__icon"><Copy aria-hidden="true" /></span>
          <strong className="action-card__title">Copy report text</strong>
          <span>{approvedDraft ? "Copy the subject, report body, and destination details." : "Approve the report draft first."}</span>
        </button>

        <button
          className="action-card"
          onClick={() => {
            void (async () => {
              const packet = await createPacketExport("pdf");
              if (!packet) {
                return;
              }
              await services.downloadFile(packet);
              await queryClient.invalidateQueries({ queryKey: ["case-file-summary", incidentId] });
              setActionNote("PDF packet created on this device.");
            })();
          }}
          type="button"
        >
          <span className="action-card__icon"><FileDown aria-hidden="true" /></span>
          <strong className="action-card__title">Export PDF</strong>
          <span>Create a report packet for download.</span>
        </button>

        <button
          className="action-card"
          onClick={() => {
            void (async () => {
              const packet = await createPacketExport("zip");
              if (!packet) {
                return;
              }
              await services.downloadFile(packet);
              await queryClient.invalidateQueries({ queryKey: ["case-file-summary", incidentId] });
              setActionNote("ZIP packet created on this device.");
            })();
          }}
          type="button"
        >
          <span className="action-card__icon"><FileArchive aria-hidden="true" /></span>
          <strong className="action-card__title">Export ZIP</strong>
          <span>Create a portable case packet with source files.</span>
        </button>
      </section>
      {hasManualFallbackDetails ? (
        <section className="settings-card settings-card--subtle">
          <div className="section-heading">
            <h2>Manual handoff</h2>
            <span className="status-chip">Web fallback</span>
          </div>
          <p>Use these details if the browser blocks share, clipboard, or external handoff. The case stays saved locally while you finish outside Dossier.</p>
          <dl className="detail-list">
            {selectedRoute.complaint_url ? (
              <div>
                <dt>Official form</dt>
                <dd>{selectedRoute.complaint_url}</dd>
              </div>
            ) : null}
            {selectedRoute.email ? (
              <div>
                <dt>Email</dt>
                <dd>{selectedRoute.email}</dd>
              </div>
            ) : null}
            {selectedRoute.phone ? (
              <div>
                <dt>Phone</dt>
                <dd>{selectedRoute.phone}</dd>
              </div>
            ) : null}
          </dl>
          <div className="button-row">
            {selectedRoute.complaint_url ? (
              <PrimaryButton icon={Copy} onClick={() => { void copyManualValue(selectedRoute.complaint_url, "The official form link was copied to your clipboard.", "No official form is listed for this route."); }}>
                Copy official link
              </PrimaryButton>
            ) : null}
            {selectedRoute.email ? (
              <PrimaryButton icon={Copy} onClick={() => { void copyManualValue(selectedRoute.email, "The destination email was copied to your clipboard.", "No email address is listed for this route."); }}>
                Copy email
              </PrimaryButton>
            ) : null}
            {selectedRoute.phone ? (
              <PrimaryButton icon={Copy} onClick={() => { void copyManualValue(selectedRoute.phone, "The destination phone number was copied to your clipboard.", "No phone number is listed for this route."); }}>
                Copy phone
              </PrimaryButton>
            ) : null}
          </div>
        </section>
      ) : null}
      {actionNote ? <InlineNote message={actionNote} /> : null}
    </>
  );
}

export function ProofActionScreen({ db }: { db: DossierDatabase }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { incidentId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const caseSummaryQuery = useQuery({
    queryKey: ["case-file-summary", incidentId],
    queryFn: () => getCaseFileSummary(db, incidentId),
    enabled: Boolean(incidentId),
  });
  const proofQuery = useQuery({
    queryKey: ["submission-proof-summary", incidentId],
    queryFn: () => getSubmissionProofSummary(db, incidentId),
    enabled: Boolean(incidentId),
  });
  const [method, setMethod] = useState<SubmissionProofRecord["method"]>("share");
  const [status, setStatus] = useState<SubmissionProofRecord["status"]>("saved");
  const [confirmationNumber, setConfirmationNumber] = useState("");
  const [externalReferenceUrl, setExternalReferenceUrl] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    const savedProof = proofQuery.data?.submission_proof;
    if (savedProof) {
      setMethod(savedProof.method);
      setStatus(savedProof.status);
      setConfirmationNumber(savedProof.confirmation_number ?? "");
      setExternalReferenceUrl(savedProof.external_reference_url ?? "");
      setNotes(savedProof.notes ?? "");
      return;
    }

    const nextMethod = searchParams.get("method");
    const nextStatus = searchParams.get("status");
    if (nextMethod && isSubmissionMethod(nextMethod)) {
      setMethod(nextMethod);
    }
    if (nextStatus && isSubmissionStatus(nextStatus)) {
      setStatus(nextStatus);
    }
  }, [proofQuery.data, searchParams]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const selectedRoute = caseSummaryQuery.data?.routes.find((route) => route.selected) ?? null;
      if (!selectedRoute) {
        throw new Error("route_missing");
      }

      return saveSubmissionProof(db, {
        incident_id: incidentId,
        route_recommendation_id: selectedRoute.id,
        submission_proof_id: proofQuery.data?.submission_proof.id ?? crypto.randomUUID(),
        method,
        status,
        confirmation_number: normalizeOptionalText(confirmationNumber),
        notes: normalizeOptionalText(notes),
        external_reference_url: normalizeOptionalText(externalReferenceUrl),
        attachment_labels: ["Draft report", "Proof packet"],
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["submission-proof-summary", incidentId] }),
        queryClient.invalidateQueries({ queryKey: ["case-file-summary", incidentId] }),
        queryClient.invalidateQueries({ queryKey: ["cases"] }),
      ]);
      navigate(`/cases/${incidentId}`);
    },
  });

  if (caseSummaryQuery.isLoading || proofQuery.isLoading) {
    return <LoadingScreen title="Save confirmation" body="Loading the saved confirmation for this case." />;
  }

  if (!caseSummaryQuery.data) {
    return <ScreenMessage title="Save confirmation" body="This case could not be opened from local storage on this device." action={<LinkButton icon={ArrowLeft} to="/cases">Back to cases</LinkButton>} />;
  }

  const selectedRoute = caseSummaryQuery.data.routes.find((route) => route.selected) ?? null;

  if (!selectedRoute) {
    return <ScreenMessage title="Save confirmation" body="Choose where to report before saving confirmation details." action={<LinkButton icon={MapPinned} to={`/cases/${incidentId}/routes`}>Choose where to report</LinkButton>} />;
  }

  const receiptDetails = [
    {
      label: "Destination",
      value: selectedRoute.destination_name_snapshot,
    },
    {
      label: "Action taken",
      value: formatSubmissionMethodLabel(method),
    },
    {
      label: "Status",
      value: formatSubmissionStatusLabel(status),
    },
    {
      label: "Confirmation",
      value: confirmationNumber.trim() || "Not saved yet",
    },
    {
      label: "Reference link",
      value: externalReferenceUrl.trim() || "Not saved yet",
    },
    {
      label: "Updated",
      value: proofQuery.data?.submission_proof?.updated_at ? formatLocalDateTime(proofQuery.data.submission_proof.updated_at) : "Will be added when saved",
    },
  ];

  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">Save confirmation</h1>
        <p className="screen-body">Save what happened after the handoff so the dossier keeps a clear filing trail, even if no formal receipt was returned.</p>
      </header>

      <section className="receipt-card receipt-card--ledger">
        <div className="receipt-card__header">
          <div>
            <p className="receipt-card__eyebrow">Filing receipt</p>
            <h2>{selectedRoute.destination_name_snapshot}</h2>
            <p>{selectedRoute.reason}</p>
          </div>
          <div className="route-card__chips">
            <span className={routeGroupChipClass(selectedRoute.route_group)}>{selectedRoute.route_group}</span>
            <span className={trustChipClass(selectedRoute.trust_level)}>{selectedRoute.trust_level}</span>
            <span className={buildChipClassName("status-chip", confirmationNumber.trim() && "status-chip--selected")}>
              {confirmationNumber.trim() ? "Reference added" : "Awaiting reference"}
            </span>
          </div>
        </div>
        <div className="receipt-card__banner">
          <strong>{formatSubmissionStatusLabel(status)}</strong>
          <span>{formatSubmissionMethodLabel(method)}</span>
        </div>
        <dl className="receipt-card__grid">
          {receiptDetails.map((item) => (
            <div key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
        {notes.trim() ? (
          <div className="receipt-card__note">
            <span>Note</span>
            <p>{notes}</p>
          </div>
        ) : null}
      </section>

      <section className="settings-card">
        <div className="section-heading">
          <h2>Receipt details</h2>
          <span className="status-chip">{selectedRoute.destination_name_snapshot}</span>
        </div>
        <p>Save the exact action you took, any reference returned, and the note you would want to read months later.</p>
        <label className="field">
          <span>Action taken</span>
          <select value={method} onChange={(event) => setMethod(event.target.value as SubmissionProofRecord["method"])}>
            <option value="web_form">Open official form</option>
            <option value="email">Email</option>
            <option value="phone">Phone call</option>
            <option value="mail">Mail</option>
            <option value="share">Share packet</option>
          </select>
        </label>
        <label className="field">
          <span>Status</span>
          <select value={status} onChange={(event) => setStatus(event.target.value as SubmissionProofRecord["status"])}>
            <option value="attempted">Attempted</option>
            <option value="sent">Sent</option>
            <option value="submitted">Submitted</option>
            <option value="shared">Shared</option>
            <option value="called">Called</option>
            <option value="saved">Saved</option>
          </select>
        </label>
        <label className="field">
          <span>Confirmation number</span>
          <input onChange={(event) => setConfirmationNumber(event.target.value)} type="text" value={confirmationNumber} />
        </label>
        <label className="field">
          <span>Reference link</span>
          <input onChange={(event) => setExternalReferenceUrl(event.target.value)} placeholder="https://" type="url" value={externalReferenceUrl} />
        </label>
        <FactsTextarea label="Proof note" value={notes} onChange={setNotes} />
      </section>

      <section className="settings-card settings-card--subtle">
        <div className="section-heading">
          <h2>Receipt quality</h2>
          <span className="status-chip">{confirmationNumber.trim() ? "Traceable" : "Incomplete"}</span>
        </div>
        <p>If no confirmation number or reference link was returned, save the method and a short note anyway. That still makes the case history more useful later.</p>
        <ul className="summary-checklist">
          <li className={buildChipClassName("summary-checklist__item", method !== "web_form" && "summary-checklist__item--done")}>
            <span className="summary-checklist__icon">{method !== "web_form" ? <CheckCircle2 aria-hidden="true" /> : <Square aria-hidden="true" />}</span>
            <span>Submission method selected</span>
          </li>
          <li className={buildChipClassName("summary-checklist__item", confirmationNumber.trim() && "summary-checklist__item--done")}>
            <span className="summary-checklist__icon">{confirmationNumber.trim() ? <CheckCircle2 aria-hidden="true" /> : <Square aria-hidden="true" />}</span>
            <span>Reference number saved</span>
          </li>
          <li className={buildChipClassName("summary-checklist__item", notes.trim() && "summary-checklist__item--done")}>
            <span className="summary-checklist__icon">{notes.trim() ? <CheckCircle2 aria-hidden="true" /> : <Square aria-hidden="true" />}</span>
            <span>Context note saved</span>
          </li>
        </ul>
      </section>

      <div className="button-row">
        <PrimaryButton disabled={saveMutation.isPending} icon={Shield} onClick={() => { void saveMutation.mutate(); }}>{saveMutation.isPending ? "Saving receipt" : "Save receipt"}</PrimaryButton>
        <LinkButton icon={ArrowLeft} to={`/cases/${incidentId}/send`}>Back to send report</LinkButton>
        {saveMutation.error ? <InlineError message="The filing receipt was not saved. Try again." /> : null}
      </div>
    </main>
  );
}

export function ExportCaseFileScreen({
  db,
  services,
  walkthroughEnabled,
}: {
  db: DossierDatabase;
  services: AppServices;
  walkthroughEnabled: boolean;
}) {
  const queryClient = useQueryClient();
  const { incidentId = "" } = useParams();
  const caseSummaryQuery = useQuery({
    queryKey: ["case-file-summary", incidentId],
    queryFn: () => getCaseFileSummary(db, incidentId),
    enabled: Boolean(incidentId),
  });
  const [note, setNote] = useState<string | null>(null);

  async function exportPacket(format: "pdf" | "zip") {
    const summary = caseSummaryQuery.data;
    if (!summary) {
      return;
    }

    if (format === "pdf") {
      const { buildCasePdf } = await loadCaseExportTools();
      const bytes = await buildCasePdf(summary);
      const pdfBuffer = copyBuffer(bytes);
      await createExportEvidence(db, {
        incident_id: incidentId,
        filename: `dossier-case-${incidentId}.pdf`,
        mime_type: "application/pdf",
        bytes: pdfBuffer,
        route_recommendation_id: summary.routes.find((route) => route.selected)?.id ?? null,
        format: "pdf",
      });
      await services.downloadFile({
        filename: `dossier-case-${incidentId}.pdf`,
        blob: new Blob([pdfBuffer], { type: "application/pdf" }),
      });
      setNote("PDF packet created on this device.");
    } else {
      const { buildCaseZip } = await loadCaseExportTools();
      const bytes = await buildCaseZip(summary);
      const zipBuffer = copyBuffer(bytes);
      await createExportEvidence(db, {
        incident_id: incidentId,
        filename: `dossier-case-${incidentId}.zip`,
        mime_type: "application/zip",
        bytes: zipBuffer,
        route_recommendation_id: summary.routes.find((route) => route.selected)?.id ?? null,
        format: "zip",
      });
      await services.downloadFile({
        filename: `dossier-case-${incidentId}.zip`,
        blob: new Blob([zipBuffer], { type: "application/zip" }),
      });
      setNote("ZIP packet created on this device.");
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["case-file-summary", incidentId] }),
      queryClient.invalidateQueries({ queryKey: ["cases"] }),
    ]);
  }

  if (caseSummaryQuery.isLoading) {
    return <LoadingScreen title="Download case packet" body="Preparing the export options for this case." />;
  }

  if (!caseSummaryQuery.data) {
    return <ScreenMessage title="Download case packet" body="This case could not be opened from local storage on this device." action={<LinkButton icon={ArrowLeft} to="/cases">Back to cases</LinkButton>} />;
  }

  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">Download case packet</h1>
        <p className="screen-body">Download a packet with the evidence, transcript, reporting options, report draft, and activity history.</p>
      </header>
      <section className="action-grid">
        <button className={walkthroughEnabled ? "action-card walkthrough-target" : "action-card"} onClick={() => { void exportPacket("pdf"); }} type="button">
          <span className="action-card__icon"><FileDown aria-hidden="true" /></span>
          <strong className="action-card__title">Download PDF</strong>
          <span>Build a report packet for review or filing.</span>
        </button>
        <button className="action-card" onClick={() => { void exportPacket("zip"); }} type="button">
          <span className="action-card__icon"><Archive aria-hidden="true" /></span>
          <strong className="action-card__title">Download ZIP</strong>
          <span>Build a portable case packet with source files.</span>
        </button>
      </section>

      {note ? <InlineNote message={note} /> : null}

      <div className="button-row">
        <LinkButton icon={ArrowLeft} to={`/cases/${incidentId}`}>Back to case summary</LinkButton>
      </div>
    </main>
  );
}

export function CaseFileScreen({
  db,
  demoCaseId,
  walkthroughEnabled,
}: {
  db: DossierDatabase;
  demoCaseId: string | null;
  walkthroughEnabled: boolean;
}) {
  const { incidentId = "" } = useParams();
  const [showFullLog, setShowFullLog] = useState(false);
  const caseSummaryQuery = useQuery({
    queryKey: ["case-file-summary", incidentId],
    queryFn: () => getCaseFileSummary(db, incidentId),
    enabled: Boolean(incidentId),
  });

  if (caseSummaryQuery.isLoading) {
    return <LoadingScreen title="Dossier" body="Loading the full case record." />;
  }

  if (!caseSummaryQuery.data) {
    return <ScreenMessage title="Dossier" body="This case could not be opened from local storage on this device." action={<LinkButton icon={ArrowLeft} to="/cases">Back to cases</LinkButton>} />;
  }

  const summary = caseSummaryQuery.data;
  const selectedRoute = summary.routes.find((route) => route.selected) ?? null;
  const isDemoCase = Boolean(demoCaseId) && summary.incident.id === demoCaseId;
  const evidenceLabels = [
    summary.source_evidence ? `Original evidence (${summary.source_evidence.mime_type})` : null,
    summary.transcript ? "Transcript" : null,
    ...summary.derived_evidence.map((item) => `${item.type.replaceAll("_", " ")} (${item.mime_type})`),
  ].filter((value): value is string => Boolean(value));
  const checklist = [
    { label: "Recording saved", done: Boolean(summary.source_evidence) },
    { label: "Transcript ready", done: Boolean(summary.transcript) },
    { label: "Details confirmed", done: Boolean(summary.fact_set) },
    { label: "Report option chosen", done: Boolean(selectedRoute) },
    { label: "Draft approved", done: Boolean(summary.draft_packet?.approved) },
    { label: "Confirmation saved", done: Boolean(summary.submission_proof) },
  ];
  const completedChecklistCount = checklist.filter((item) => item.done).length;
  const completionPercent = Math.round((completedChecklistCount / checklist.length) * 100);
  const recentLogEntries = summary.custody_log.slice().reverse();
  const nextActionHref =
    !summary.source_evidence
      ? "/capture"
      : !summary.transcript
        ? `/cases/${incidentId}/transcript`
        : !summary.fact_set
          ? `/cases/${incidentId}/facts`
          : !selectedRoute
            ? `/cases/${incidentId}/routes`
            : !summary.draft_packet?.approved
              ? `/cases/${incidentId}/draft`
              : !summary.submission_proof
                ? `/cases/${incidentId}/proof`
                : `/cases/${incidentId}/export`;
  const nextActionLabel =
    !summary.source_evidence
      ? "Save recording"
      : !summary.transcript
        ? "Create transcript"
        : !summary.fact_set
          ? "Confirm details"
          : !selectedRoute
            ? "Choose destination"
            : !summary.draft_packet?.approved
              ? "Approve brief"
              : !summary.submission_proof
                ? "Save receipt"
                : "Export packet";

  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">Dossier</h1>
        <p className="screen-body">Everything important about this case lives here: evidence, route, brief, filing record, and chain of activity.</p>
      </header>
      <section className="dossier-hero">
        <div className="dossier-hero__header">
          <div>
            <p className="summary-stat-card__eyebrow">Case record</p>
            <h2>{formatCaseTypeLabel(summary.fact_set?.incident_type ?? summary.incident.category) || "Case"}</h2>
            <p>{summary.incident.location_address ?? "Location not saved yet"}</p>
          </div>
          <div className="route-card__chips">
            <span className="status-chip status-chip--selected">{completionPercent}% complete</span>
            <span className="status-chip">Case {summary.incident.id}</span>
            {selectedRoute ? <span className={trustChipClass(selectedRoute.trust_level)}>{selectedRoute.trust_level}</span> : null}
          </div>
        </div>
        <div className="dossier-hero__stats">
          <article className="case-home-stat">
            <span className="case-home-stat__label">Next move</span>
            <strong>{nextActionLabel}</strong>
            <p>{completedChecklistCount} of {checklist.length} dossier milestones are complete.</p>
          </article>
          <article className="case-home-stat">
            <span className="case-home-stat__label">Destination</span>
            <strong>{selectedRoute?.destination_name_snapshot ?? "Not chosen yet"}</strong>
            <p>{selectedRoute?.source_label ?? "Pick a filing path to lock the brief and receipt to one destination."}</p>
          </article>
          <article className="case-home-stat">
            <span className="case-home-stat__label">Evidence vault</span>
            <strong>{evidenceLabels.length} preserved items</strong>
            <p>{summary.submission_proof ? "Receipt included in the dossier." : "Submission receipt not saved yet."}</p>
          </article>
        </div>
        <div className="dossier-hero__actions">
          <LinkButton className={walkthroughEnabled && isDemoCase ? "walkthrough-target" : undefined} icon={FolderOpen} to={nextActionHref}>
            {nextActionLabel}
          </LinkButton>
          <LinkButton icon={MapPinned} to={`/cases/${incidentId}/routes`}>Open destinations</LinkButton>
          <LinkButton icon={Package} to={`/cases/${incidentId}/export`}>Open packet</LinkButton>
        </div>
      </section>

      <section className="settings-card summary-progress-card">
        <div className="section-heading">
          <h2>Dossier progress</h2>
          <span className="status-chip">{completionPercent}% complete</span>
        </div>
        <div className="progress-track" aria-hidden="true">
          <div className="progress-track__value" style={{ width: `${completionPercent}%` }} />
        </div>
        <ul className="summary-checklist">
          {checklist.map((item) => (
            <li className={buildChipClassName("summary-checklist__item", item.done && "summary-checklist__item--done")} key={item.label}>
              <span className="summary-checklist__icon">{item.done ? <CheckCircle2 aria-hidden="true" /> : <Square aria-hidden="true" />}</span>
              <span>{item.label}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="settings-card">
        <div className="section-heading">
          <h2>Verified details</h2>
          <LinkButton icon={ScanSearch} to={`/cases/${incidentId}/facts`}>Open details</LinkButton>
        </div>
        {summary.fact_set ? (
          <ul className="inline-list">
            {summary.fact_set.key_facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        ) : (
          <p>No details saved yet.</p>
        )}
      </section>

      <section className="settings-card">
        <div className="section-heading">
          <h2>Destination</h2>
          <LinkButton icon={MapPinned} to={`/cases/${incidentId}/routes`}>Open destinations</LinkButton>
        </div>
        {selectedRoute ? (
          <div className="summary-panel">
            <div className="route-card__chips">
              <span className={routeGroupChipClass(selectedRoute.route_group)}>{selectedRoute.route_group}</span>
              <span className={trustChipClass(selectedRoute.trust_level)}>{selectedRoute.trust_level}</span>
              <span className={destinationTypeChipClass(selectedRoute.destination_type_snapshot)}>{selectedRoute.destination_type_snapshot.replaceAll("_", " ")}</span>
            </div>
            <dl className="detail-list">
              <div>
                <dt>Selected option</dt>
                <dd>{selectedRoute.destination_name_snapshot}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{selectedRoute.source_label}</dd>
              </div>
              <div>
                <dt>How to send</dt>
                <dd>{selectedRoute.intake_methods_snapshot.join(", ")}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p>No report option selected yet.</p>
        )}
      </section>

      <section className="settings-card">
        <div className="section-heading">
          <h2>Official brief</h2>
          <LinkButton icon={NotebookPen} to={`/cases/${incidentId}/draft`}>Open brief</LinkButton>
        </div>
        {summary.draft_packet ? (
          <div className="report-preview-card report-preview-card--compact">
            <div className="report-preview-card__header">
              <span className="report-preview-card__badge">
                <FileText aria-hidden="true" />
                {summary.draft_packet.approved ? "Approved brief" : "Brief draft"}
              </span>
              {selectedRoute ? <span className="status-chip">{selectedRoute.destination_name_snapshot}</span> : null}
            </div>
            <div className="report-document">
              <div className="report-document__header">
                <p className="report-document__eyebrow">Brief subject</p>
                <h2>{summary.draft_packet.subject}</h2>
              </div>
              <div className="report-document__body">
                {splitLines(summary.draft_packet.body).slice(0, 2).map((paragraph, index) => (
                  <p key={`${index}-${paragraph}`}>{paragraph}</p>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <p>No draft saved yet.</p>
        )}
      </section>

      <section className="settings-card">
        <div className="section-heading">
          <h2>Filing receipt</h2>
          <LinkButton icon={Shield} to={`/cases/${incidentId}/proof`}>Open receipt</LinkButton>
        </div>
        {summary.submission_proof ? (
          <div className="receipt-card receipt-card--compact">
            <div className="receipt-card__header">
              <div>
                <p className="receipt-card__eyebrow">Saved receipt</p>
                <h2>{selectedRoute?.destination_name_snapshot ?? "Selected route"}</h2>
              </div>
              <div className="route-card__chips">
                <span className="status-chip status-chip--selected">{formatSubmissionStatusLabel(summary.submission_proof.status)}</span>
                <span className="status-chip">{formatSubmissionMethodLabel(summary.submission_proof.method)}</span>
              </div>
            </div>
            <dl className="receipt-card__grid">
              <div>
                <dt>Confirmation</dt>
                <dd>{summary.submission_proof.confirmation_number ?? "Not saved"}</dd>
              </div>
              <div>
                <dt>Reference link</dt>
                <dd>{summary.submission_proof.external_reference_url ?? "Not saved"}</dd>
              </div>
              <div>
                <dt>Saved</dt>
                <dd>{formatLocalDateTime(summary.submission_proof.updated_at)}</dd>
              </div>
              <div>
                <dt>Notes</dt>
                <dd>{summary.submission_proof.notes ?? "No notes saved"}</dd>
              </div>
            </dl>
          </div>
        ) : (
          <p>No proof saved yet.</p>
        )}
      </section>

      <section className="settings-card">
        <div className="section-heading">
          <h2>Evidence vault</h2>
          <LinkButton icon={Package} to={`/cases/${incidentId}/export`}>Open packet</LinkButton>
        </div>
        <ul className="pill-list">
          {evidenceLabels.map((value) => (
            <li className="pill-list__item" key={value}>{value}</li>
          ))}
        </ul>
      </section>

      <section className="settings-card">
        <div className="section-heading">
          <h2>Chain of activity</h2>
          <span className="status-chip">{summary.custody_log.length} entries</span>
        </div>
        <ol className="log-list">
          {recentLogEntries.slice(0, showFullLog ? recentLogEntries.length : 4).map((entry) => (
            <li key={entry.id}>
              <strong>{entry.action}</strong>
              <span>{formatLocalDateTime(entry.created_at)}</span>
              {formatCustodyLogDetail(entry.details_json) ? <p>{formatCustodyLogDetail(entry.details_json)}</p> : null}
            </li>
          ))}
        </ol>
        <button className="secondary-button" onClick={() => setShowFullLog((current) => !current)} type="button">
          {showFullLog ? "Hide full log" : "View full activity"}
        </button>
        {!showFullLog ? <InlineNote message="The activity list is collapsed to the most recent entries until you expand it." /> : null}
      </section>
    </main>
  );
}

export function SettingsScreen({
  biometricEnabled,
  lockConfigured,
  onLockNow,
  onQuickGuideEnabledChange,
  onQuickGuideSeenChange,
  onRequireUnlockOnOpenChange,
  quickGuideEnabled,
  quickGuideSeen,
  requireUnlockOnOpen,
}: {
  biometricEnabled: boolean;
  lockConfigured: boolean;
  onLockNow: () => Promise<void>;
  onQuickGuideEnabledChange: (enabled: boolean) => Promise<void>;
  onQuickGuideSeenChange: (quickGuideSeen: boolean) => Promise<void>;
  onRequireUnlockOnOpenChange: (requireUnlockOnOpen: boolean) => Promise<void>;
  quickGuideEnabled: boolean;
  quickGuideSeen: boolean;
  requireUnlockOnOpen: boolean;
}) {
  const frontendConfig = getFrontendConfig();

  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">Settings</h1>
        <p className="screen-body">Manage privacy, the quickstart guide, and device access.</p>
      </header>
      <section className="settings-card">
        <h2>Device</h2>
        <p>This MVP keeps captures and case files private to this device.</p>
      </section>
      <section className="settings-card settings-card--subtle">
        <div className="section-heading">
          <h2>Build</h2>
          <span className="status-chip">{appVersion()}</span>
        </div>
        <dl className="detail-list">
          <div>
            <dt>Platform</dt>
            <dd>{detectPlatform()}</dd>
          </div>
          <div>
            <dt>Runtime mode</dt>
            <dd>{frontendConfig.apiMode}</dd>
          </div>
          <div>
            <dt>Backend</dt>
            <dd>{frontendConfig.apiMode === "backend" ? frontendConfig.backendUrl : "Optional in local mode"}</dd>
          </div>
        </dl>
      </section>
      <section className="settings-card">
        <h2>Quickstart guide</h2>
        <p>{quickGuideSeen ? "The guide is currently hidden across the app." : "The guide is currently visible across the app."}</p>
        <div className="button-row">
          <PrimaryButton
            icon={NotebookPen}
            onClick={() => {
              void onQuickGuideEnabledChange(true);
              void onQuickGuideSeenChange(false);
            }}
          >
            Show guide on all pages
          </PrimaryButton>
          {!quickGuideSeen ? (
            <button
              className="secondary-button"
              onClick={() => {
                void onQuickGuideSeenChange(true);
              }}
              type="button"
            >
              <Shield aria-hidden="true" />
              Hide guide on all pages
            </button>
          ) : null}
        </div>
        {!quickGuideEnabled ? <InlineNote message="Guide visibility is controlled locally on this device." /> : null}
      </section>
      <section className="settings-card">
        <h2>Roadmap and FAQ</h2>
        <details>
          <summary>What is planned next?</summary>
          <p>Dossier is currently local-first and voice-first. Planned options include camera evidence capture support, external device camera workflows, and stronger evidence packaging controls for investigative use.</p>
        </details>
        <details>
          <summary>Will camera support be optional?</summary>
          <p>Yes. Camera support is planned as an option so the core capture flow can remain simple for users who only need voice capture.</p>
        </details>
        <details>
          <summary>Is AR/XR part of the plan?</summary>
          <p>Yes. AR/XR is a future direction. The app is being structured so case data, location context, and evidence history can be extended for spatial review later.</p>
        </details>
      </section>
      <section className="settings-card">
        <h2>Access</h2>
        <p>{lockConfigured ? "A device code is set on this device." : "No device code is set on this device yet."}</p>
        <p>Unlock on open: {lockConfigured && requireUnlockOnOpen ? "On" : "Off"}</p>
        <p>Device unlock: {biometricEnabled ? "Enabled when available" : "Off"}</p>
        <label className="field-checkbox">
          <input checked={requireUnlockOnOpen} disabled={!lockConfigured} onChange={(event) => { void onRequireUnlockOnOpenChange(event.target.checked); }} type="checkbox" />
          <span>Require unlock on open</span>
        </label>
        {!lockConfigured ? <InlineNote message="Set a device code before turning on unlock on open." /> : null}
        <div className="button-row">
          <LinkButton icon={Shield} to="/settings/access">{lockConfigured ? "Change device code" : "Set device code"}</LinkButton>
          {lockConfigured ? <PrimaryButton icon={Shield} onClick={() => { void onLockNow(); }}>Lock now</PrimaryButton> : null}
        </div>
      </section>
    </main>
  );
}

export function SecureDeviceScreen({
  biometricAvailable,
  errorMessage,
  onSave,
}: {
  biometricAvailable: boolean;
  errorMessage: string | null;
  onSave: (input: { pin: string; biometricEnabled: boolean }) => Promise<void>;
}) {
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [biometricEnabled, setBiometricEnabled] = useState(biometricAvailable);
  const [localError, setLocalError] = useState<string | null>(null);

  async function handleContinue() {
    if (!/^\d{4,8}$/.test(pin)) {
      setLocalError("Use a 4 to 8 digit code on this device.");
      return;
    }
    if (pin !== confirmPin) {
      setLocalError("The two codes did not match.");
      return;
    }

    await onSave({
      pin,
      biometricEnabled,
    });
  }

  return (
    <FullScreenShell
      title="Secure this device"
      body="Set the code that protects Dossier on this device."
      detail="You can change privacy and walkthrough settings later."
      actionSlot={
        <>
          <label className="field">
            <span>Device code</span>
            <input autoComplete="one-time-code" inputMode="numeric" maxLength={8} onChange={(event) => setPin(event.target.value)} type="password" value={pin} />
          </label>
          <label className="field">
            <span>Confirm code</span>
            <input autoComplete="one-time-code" inputMode="numeric" maxLength={8} onChange={(event) => setConfirmPin(event.target.value)} type="password" value={confirmPin} />
          </label>
          {biometricAvailable ? (
            <label className="field-checkbox">
              <input checked={biometricEnabled} onChange={(event) => setBiometricEnabled(event.target.checked)} type="checkbox" />
              <span>Use device unlock when available</span>
            </label>
          ) : (
            <InlineNote message="Device unlock is not available in this browser right now." />
          )}
          <PrimaryButton icon={Shield} onClick={() => void handleContinue()}>Save device code</PrimaryButton>
          {localError ? <InlineError message={localError} /> : null}
          {errorMessage ? <InlineError message={errorMessage} /> : null}
        </>
      }
    />
  );
}

export function UnlockScreen({
  biometricEnabled,
  errorMessage,
  onDeviceUnlock,
  onUnlock,
}: {
  biometricEnabled: boolean;
  errorMessage: string | null;
  onDeviceUnlock: () => Promise<void>;
  onUnlock: (pin: string) => Promise<void>;
}) {
  const [pin, setPin] = useState("");

  return (
    <FullScreenShell
      title="Unlock case access"
      body="Enter your device code to open Dossier."
      actionSlot={
        <>
          <label className="field">
            <span>Device code</span>
            <input autoComplete="one-time-code" inputMode="numeric" maxLength={8} onChange={(event) => setPin(event.target.value)} type="password" value={pin} />
          </label>
          <PrimaryButton icon={Shield} onClick={() => void onUnlock(pin)}>Unlock</PrimaryButton>
          {biometricEnabled ? (
            <button className="secondary-button" onClick={() => { void onDeviceUnlock(); }} type="button">
              <Shield aria-hidden="true" />
              Use device unlock
            </button>
          ) : null}
          {errorMessage ? <InlineError message={errorMessage} /> : null}
        </>
      }
    />
  );
}
