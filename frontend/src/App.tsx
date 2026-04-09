import { useEffect, useMemo, useRef, useState, type ReactNode, type Dispatch, type SetStateAction } from "react";
import { BrowserRouter, Link, Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { sha256Hex } from "./lib/crypto";
import {
  confirmFactSet,
  createExportEvidence,
  ensureDemoWalkthroughCase,
  getCaseFileSummary,
  getCaptureContext,
  deleteIncidentCase,
  getDraftPacketSummary,
  getFactSetSummary,
  getRouteRecommendationSummary,
  getSubmissionProofSummary,
  getTranscriptSummary,
  listRecentIncidents,
  loadBootstrapState,
  persistCapture,
  recordSendAction,
  recordShareCompleted,
  approveDraftPacket,
  saveRouteRecommendations,
  saveDraftPacket,
  saveFactSet,
  setLocalAiPrepared,
  setCaptureBriefSeen,
  setFullAppWalkthroughEnabled,
  saveSubmissionProof,
  saveTranscript,
  selectRouteRecommendation,
  setLastOpenPath,
  setBiometricCredentialId,
  setBiometricPreference,
  setDeviceLockHash,
  setRequireUnlockOnOpen,
  setTheme,
  type CaptureContext,
  type DossierDatabase,
  type RouteRecommendationRecord,
  type FactSetRecord,
  type FactSetSummary,
  type IncidentRecord,
  type DraftPacketSummary,
  type SubmissionProofRecord,
  type SubmissionProofSummary,
  type ThemeMode,
} from "./lib/db";
import {
  appVersion,
  createDefaultAppServices,
  detectPlatform,
  FrontendRuntimeError,
  type FactSetDto,
  type LocalAiProgressEvent,
  type RouteRecommendationDto,
  type AppServices,
} from "./lib/runtime";
import { buildCasePdf, buildCaseZip } from "./lib/export";

interface AppProps {
  services?: AppServices;
}

interface BootstrapViewState {
  ready: boolean;
  theme: ThemeMode;
  lockHash: string | null;
  requireUnlockOnOpen: boolean;
  installId: string;
  biometricEnabled: boolean;
  biometricCredentialId: string | null;
  biometricAvailable: boolean;
  localAiPreparedAt: string | null;
  localAiModel: string | null;
  lastOpenPath: string | null;
  quickGuideSeen: boolean;
  captureBriefSeen: boolean;
  draftWalkthroughSeen: boolean;
  fullAppWalkthroughEnabled: boolean;
}

interface ActiveCapture {
  recorder: MediaRecorder;
  stream: MediaStream;
  stopPromise: Promise<Blob>;
  stopResolver: (blob: Blob) => void;
  stopRejector: (reason?: unknown) => void;
  startTimeMs: number;
  mimeType: string;
  chunks: Blob[];
}

interface FactsFormState {
  incident_type: string;
  people: string;
  places: string;
  businesses: string;
  phones: string;
  dates: string;
  amounts: string;
  timeline: string;
  key_facts: string;
}

interface DraftFormState {
  subject: string;
  body: string;
}

const CASE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "consumer_issue", label: "Consumer issue" },
  { value: "consumer_billing", label: "Billing or charge problem" },
  { value: "retail_transaction", label: "Retail or purchase issue" },
  { value: "service_quality", label: "Service quality issue" },
  { value: "fraud_or_deception", label: "Fraud or theft" },
  { value: "tenant_issue", label: "Housing or tenant issue" },
  { value: "workplace_wages", label: "Workplace wage issue" },
  { value: "civil_rights", label: "Civil rights issue" },
  { value: "emergency_safety", label: "Emergency or public safety" },
];

const CASE_TYPE_LABELS = new Map(CASE_TYPE_OPTIONS.map((option) => [option.value, option.label]));

export function App({ services = createDefaultAppServices() }: AppProps) {
  const [bootstrap, setBootstrap] = useState<BootstrapViewState>({
    ready: false,
    theme: "slate",
    lockHash: null,
    requireUnlockOnOpen: false,
    installId: "",
    biometricEnabled: false,
    biometricCredentialId: null,
    biometricAvailable: false,
    localAiPreparedAt: null,
    localAiModel: null,
    lastOpenPath: null,
    quickGuideSeen: false,
    captureBriefSeen: false,
    draftWalkthroughSeen: false,
    fullAppWalkthroughEnabled: true,
  });
  const [openedApp, setOpenedApp] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [demoCaseId, setDemoCaseId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      const nextState = await loadBootstrapState(services.db);
      if (!active) {
        return;
      }

      setBootstrap({
        ready: true,
        theme: nextState.theme,
        lockHash: nextState.lock_hash,
        requireUnlockOnOpen: nextState.require_unlock_on_open,
        installId: nextState.install_id,
        biometricEnabled: nextState.biometric_enabled,
        biometricCredentialId: nextState.biometric_credential_id,
        biometricAvailable: false,
        localAiPreparedAt: nextState.local_ai_prepared_at,
        localAiModel: nextState.local_ai_model,
        lastOpenPath: nextState.last_open_path,
        quickGuideSeen: nextState.quick_guide_seen,
        captureBriefSeen: nextState.capture_brief_seen,
        draftWalkthroughSeen: nextState.draft_walkthrough_seen,
        fullAppWalkthroughEnabled: nextState.full_app_walkthrough_enabled,
      });
      setOpenedApp(Boolean(nextState.local_ai_prepared_at));
      setUnlocked(!nextState.lock_hash || !nextState.require_unlock_on_open);
    })();
    void services.deviceUnlock.isAvailable().catch(() => false).then((biometricAvailable) => {
      if (!active) {
        return;
      }
      setBootstrap((current) => ({
        ...current,
        biometricAvailable,
      }));
    });

    return () => {
      active = false;
    };
  }, [services.db, services.deviceUnlock]);

  useEffect(() => {
    if (!bootstrap.ready) {
      return;
    }
    document.documentElement.dataset.theme = bootstrap.theme;
  }, [bootstrap.ready, bootstrap.theme]);

  useEffect(() => {
    let active = true;

    if (!bootstrap.ready || !bootstrap.localAiPreparedAt || !openedApp || !bootstrap.fullAppWalkthroughEnabled) {
      return () => {
        active = false;
      };
    }

    if (import.meta.env.MODE === "test") {
      return () => {
        active = false;
      };
    }

    void ensureDemoWalkthroughCase(services.db)
      .then((id) => {
        if (!active) {
          return;
        }
        setDemoCaseId(id);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setDemoCaseId(null);
      });

    return () => {
      active = false;
    };
  }, [bootstrap.fullAppWalkthroughEnabled, bootstrap.localAiPreparedAt, bootstrap.ready, openedApp, services.db]);

  async function handleThemeChange(theme: ThemeMode) {
    await setTheme(services.db, theme);
    setBootstrap((current) => ({
      ...current,
      theme,
    }));
  }

  async function handleLocalAiPrepared(input: {
    prepared_at: string;
    model: string;
  }) {
    await setLocalAiPrepared(services.db, input);
    setBootstrap((current) => ({
      ...current,
      localAiPreparedAt: input.prepared_at,
      localAiModel: input.model,
    }));
    setGlobalError(null);
  }

  async function handleCaptureBriefSeen() {
    await setCaptureBriefSeen(services.db, true);
    setBootstrap((current) => ({
      ...current,
      captureBriefSeen: true,
    }));
    setGlobalError(null);
  }

  async function handleResetCaptureBrief() {
    await setCaptureBriefSeen(services.db, false);
    setBootstrap((current) => ({
      ...current,
      captureBriefSeen: false,
    }));
    setGlobalError(null);
  }

  async function handleFullAppWalkthroughEnabled(fullAppWalkthroughEnabled: boolean) {
    await setFullAppWalkthroughEnabled(services.db, fullAppWalkthroughEnabled);
    setBootstrap((current) => ({
      ...current,
      fullAppWalkthroughEnabled,
    }));
    setGlobalError(null);
  }

  async function handleSecureDevice(input: {
    pin: string;
    biometricEnabled: boolean;
  }) {
    const lockHash = await sha256Hex(input.pin);
    let biometricCredentialId: string | null = null;
    const biometricAvailable = input.biometricEnabled
      ? await services.deviceUnlock.isAvailable().catch(() => false)
      : false;

    if (input.biometricEnabled && biometricAvailable) {
      biometricCredentialId = await services.deviceUnlock.createCredential({
        install_id: bootstrap.installId,
      });
    }

    await Promise.all([
      setDeviceLockHash(services.db, lockHash),
      setBiometricPreference(services.db, input.biometricEnabled && Boolean(biometricCredentialId)),
      setBiometricCredentialId(services.db, biometricCredentialId),
    ]);
    setBootstrap((current) => ({
      ...current,
      lockHash,
      biometricEnabled: input.biometricEnabled && Boolean(biometricCredentialId),
      biometricCredentialId,
      biometricAvailable: current.biometricAvailable || biometricAvailable,
    }));
    setUnlocked(true);
    setOpenedApp(true);
    setGlobalError(null);
  }

  async function handleRequireUnlockOnOpenChange(requireUnlockOnOpen: boolean) {
    await setRequireUnlockOnOpen(services.db, requireUnlockOnOpen);
    setBootstrap((current) => ({
      ...current,
      requireUnlockOnOpen,
    }));
    setGlobalError(null);
  }

  async function handleUnlock(pin: string) {
    if (!bootstrap.lockHash) {
      return;
    }
    const enteredHash = await sha256Hex(pin);
    if (enteredHash !== bootstrap.lockHash) {
      setGlobalError("That code did not match this device.");
      return;
    }
    setUnlocked(true);
    setOpenedApp(true);
    setGlobalError(null);
  }

  async function handleDeviceUnlock() {
    if (!bootstrap.biometricCredentialId) {
      setGlobalError("Device unlock is not enabled on this device.");
      return;
    }

    try {
      await services.deviceUnlock.authenticate({
        credential_id: bootstrap.biometricCredentialId,
      });
      setUnlocked(true);
      setOpenedApp(true);
      setGlobalError(null);
    } catch (error) {
      setGlobalError(resolveDeviceUnlockError(error));
    }
  }

  async function handleLockNow() {
    if (!bootstrap.lockHash) {
      return;
    }
    setUnlocked(false);
    setGlobalError(null);
  }

  const runtimeServices = useMemo<AppServices>(() => {
    return {
      ...services,
    };
  }, [services]);

  if (!bootstrap.ready) {
    return <FullScreenShell title="Open Dossier" body="Loading this device." actionSlot={null} />;
  }

  if (bootstrap.lockHash && !unlocked) {
    return (
      <UnlockScreen
        biometricEnabled={bootstrap.biometricEnabled}
        errorMessage={globalError}
        onDeviceUnlock={handleDeviceUnlock}
        onUnlock={handleUnlock}
      />
    );
  }

  if (!openedApp) {
    return (
      <FullScreenShell
        title="Open Dossier"
        body="Capture once. Build the case. Send it with proof."
        detail="Private to this device. Built for complaint prep with source-backed reporting options."
        actionSlot={<PrimaryButton onClick={() => setOpenedApp(true)}>Continue</PrimaryButton>}
      />
    );
  }

  if (!bootstrap.localAiPreparedAt) {
    return (
      <PrepareLocalAiScreen
        model={bootstrap.localAiModel}
        onPrepared={handleLocalAiPrepared}
        services={services}
      />
    );
  }

  return (
    <BrowserRouter>
      <AuthenticatedShell
        biometricAvailable={bootstrap.biometricAvailable}
        biometricEnabled={bootstrap.biometricEnabled}
        db={runtimeServices.db}
        lockConfigured={Boolean(bootstrap.lockHash)}
        lastOpenPath={bootstrap.lastOpenPath}
        onLockNow={handleLockNow}
        onRequireUnlockOnOpenChange={handleRequireUnlockOnOpenChange}
        onResetCaptureBrief={handleResetCaptureBrief}
        onSaveAccessSettings={handleSecureDevice}
        onThemeChange={handleThemeChange}
        requireUnlockOnOpen={bootstrap.requireUnlockOnOpen}
        services={runtimeServices}
        theme={bootstrap.theme}
        captureBriefSeen={bootstrap.captureBriefSeen}
        fullAppWalkthroughEnabled={bootstrap.fullAppWalkthroughEnabled}
        demoCaseId={demoCaseId}
        onCaptureBriefSeen={handleCaptureBriefSeen}
        onFullAppWalkthroughEnabled={handleFullAppWalkthroughEnabled}
      />
    </BrowserRouter>
  );
}

function PrepareLocalAiScreen({
  model,
  onPrepared,
  services,
}: {
  model: string | null;
  onPrepared: (input: { prepared_at: string; model: string }) => Promise<void>;
  services: AppServices;
}) {
  const [progress, setProgress] = useState<LocalAiProgressEvent | null>(null);
  const [speechModelProgress, setSpeechModelProgress] = useState<LocalAiProgressEvent | null>(null);
  const [writingModelProgress, setWritingModelProgress] = useState<LocalAiProgressEvent | null>(null);
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const autoStartedRef = useRef(false);

  async function handlePrepare() {
    setPending(true);
    setErrorMessage(null);
    setProgress({
      stage: "load",
      label: "Loading built-in speech tools on this device.",
      progress: 0,
      loaded_bytes: null,
      total_bytes: null,
      file: null,
      model: model ?? "Xenova/whisper-base.en",
    });
    setSpeechModelProgress({
      stage: "load",
      label: "Preparing local speech model.",
      progress: 0,
      loaded_bytes: null,
      total_bytes: null,
      file: null,
      model: model ?? "Xenova/whisper-base.en",
    });
    setWritingModelProgress({
      stage: "load",
      label: "Preparing local writing model.",
      progress: 0,
      loaded_bytes: null,
      total_bytes: null,
      file: null,
      model: "Qwen/Qwen2.5-0.5B-Instruct",
    });

    try {
      const result = await services.api.prepareLocalAi({
        on_progress: (next) => {
          setProgress(next);
          const modelName = (next.model ?? "").toLowerCase();
          if (modelName.includes("whisper")) {
            setSpeechModelProgress(next);
            return;
          }
          if (modelName.includes("qwen") || modelName.includes("draft")) {
            setWritingModelProgress(next);
          }
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

  return (
    <FullScreenShell
      title="Prepare this device"
      body="Dossier is preparing local speech and writing tools on this device."
      detail="First setup downloads offline models (Whisper + Qwen 0.5B) and caches them for local use."
      actionSlot={
        <>
          <ProgressPanel
            progress={progress}
            title="Setup progress"
            emptyMessage="Local setup has not started."
          />
          <ProgressPanel
            progress={speechModelProgress}
            title="Speech model download"
            emptyMessage="Speech model is waiting to start."
          />
          <ProgressPanel
            progress={writingModelProgress}
            title="Writing model download"
            emptyMessage="Writing model is waiting to start."
          />
          <section className="settings-card">
            <h2>How local AI is used</h2>
            <ul className="inline-list">
              <li>Speech model: turns your audio capture into transcript text on-device.</li>
              <li>Writing model: improves draft complaint wording from your saved facts.</li>
              <li>No cloud calls for AI in this mode. Models stay cached for offline reuse.</li>
            </ul>
          </section>
          <PrimaryButton disabled={pending} onClick={() => void handlePrepare()}>
            {pending ? "Downloading models" : "Retry setup"}
          </PrimaryButton>
          {errorMessage ? <InlineError message={errorMessage} /> : null}
        </>
      }
    />
  );
}

function AuthenticatedShell({
  biometricAvailable,
  biometricEnabled,
  db,
  lastOpenPath,
  lockConfigured,
  onLockNow,
  onRequireUnlockOnOpenChange,
  onResetCaptureBrief,
  onSaveAccessSettings,
  onThemeChange,
  requireUnlockOnOpen,
  services,
  theme,
  captureBriefSeen,
  fullAppWalkthroughEnabled,
  demoCaseId,
  onCaptureBriefSeen,
  onFullAppWalkthroughEnabled,
}: {
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  db: DossierDatabase;
  lastOpenPath: string | null;
  lockConfigured: boolean;
  onLockNow: () => Promise<void>;
  onRequireUnlockOnOpenChange: (requireUnlockOnOpen: boolean) => Promise<void>;
  onResetCaptureBrief: () => Promise<void>;
  onSaveAccessSettings: (input: {
    pin: string;
    biometricEnabled: boolean;
  }) => Promise<void>;
  onThemeChange: (theme: ThemeMode) => Promise<void>;
  requireUnlockOnOpen: boolean;
  services: AppServices;
  theme: ThemeMode;
  captureBriefSeen: boolean;
  fullAppWalkthroughEnabled: boolean;
  demoCaseId: string | null;
  onCaptureBriefSeen: () => Promise<void>;
  onFullAppWalkthroughEnabled: (enabled: boolean) => Promise<void>;
}) {
  const defaultPath = normalizeAppPath(lastOpenPath) ?? (fullAppWalkthroughEnabled ? "/cases" : "/capture");

  return (
    <div className="app-shell">
      <PersistLastOpenPath db={db} />
      <div className="app-shell__content">
        <Routes>
          <Route path="/" element={<Navigate replace to={defaultPath} />} />
          <Route
            path="/capture"
            element={
              <CaptureScreen
                captureBriefSeen={captureBriefSeen}
                onCaptureBriefSeen={onCaptureBriefSeen}
                services={services}
                walkthroughEnabled={fullAppWalkthroughEnabled}
              />
            }
          />
          <Route
            path="/cases/:incidentId/capture-saved"
            element={<CaptureSavedScreen db={db} services={services} walkthroughEnabled={fullAppWalkthroughEnabled} />}
          />
          <Route
            path="/cases/:incidentId/transcript"
            element={<TranscriptScreen db={db} services={services} walkthroughEnabled={fullAppWalkthroughEnabled} />}
          />
          <Route
            path="/cases/:incidentId/facts"
            element={<FactsScreen db={db} services={services} walkthroughEnabled={fullAppWalkthroughEnabled} />}
          />
          <Route
            path="/cases/:incidentId/routes"
            element={<CaseRoutesScreen db={db} services={services} walkthroughEnabled={fullAppWalkthroughEnabled} />}
          />
          <Route
            path="/cases/:incidentId/draft"
            element={
              <DraftReportScreen
                db={db}
                walkthroughEnabled={fullAppWalkthroughEnabled}
                services={services}
              />
            }
          />
          <Route
            path="/cases/:incidentId/send"
            element={<SendHandoffScreen db={db} services={services} walkthroughEnabled={fullAppWalkthroughEnabled} />}
          />
          <Route path="/cases/:incidentId/proof" element={<ProofActionScreen db={db} />} />
          <Route
            path="/cases/:incidentId/export"
            element={<ExportCaseFileScreen db={db} services={services} walkthroughEnabled={fullAppWalkthroughEnabled} />}
          />
          <Route
            path="/cases/:incidentId"
            element={<CaseFileScreen db={db} demoCaseId={demoCaseId} walkthroughEnabled={fullAppWalkthroughEnabled} />}
          />
          <Route path="/cases" element={<CasesScreen db={db} demoCaseId={demoCaseId} walkthroughEnabled={fullAppWalkthroughEnabled} />} />
          <Route path="/routes" element={<RoutesIndexScreen db={db} demoCaseId={demoCaseId} walkthroughEnabled={fullAppWalkthroughEnabled} />} />
          <Route
            path="/settings/access"
            element={
              <AccessSettingsRoute
                biometricAvailable={biometricAvailable}
                onSaveAccessSettings={onSaveAccessSettings}
              />
            }
          />
          <Route
            path="/settings"
            element={
              <SettingsScreen
                biometricEnabled={biometricEnabled}
                captureBriefSeen={captureBriefSeen}
                currentTheme={theme}
                fullAppWalkthroughEnabled={fullAppWalkthroughEnabled}
                lockConfigured={lockConfigured}
                onLockNow={onLockNow}
                onRequireUnlockOnOpenChange={onRequireUnlockOnOpenChange}
                onResetCaptureBrief={onResetCaptureBrief}
                onThemeChange={onThemeChange}
                requireUnlockOnOpen={requireUnlockOnOpen}
                onFullAppWalkthroughEnabled={onFullAppWalkthroughEnabled}
              />
            }
          />
        </Routes>
      </div>
      <nav aria-label="Primary" className="bottom-nav">
        <TabLink to="/capture">Capture</TabLink>
        <TabLink to="/cases">Cases</TabLink>
        <TabLink to="/routes">Report</TabLink>
        <TabLink to="/settings">Settings</TabLink>
      </nav>
    </div>
  );
}

function PersistLastOpenPath({ db }: { db: DossierDatabase }) {
  const location = useLocation();

  useEffect(() => {
    const nextPath = `${location.pathname}${location.search}`;
    if (nextPath === "/" || nextPath.length === 0) {
      return;
    }
    void setLastOpenPath(db, nextPath);
  }, [db, location.pathname, location.search]);

  return null;
}

function AccessSettingsRoute({
  biometricAvailable,
  onSaveAccessSettings,
}: {
  biometricAvailable: boolean;
  onSaveAccessSettings: (input: {
    pin: string;
    biometricEnabled: boolean;
  }) => Promise<void>;
}) {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSave(input: {
    pin: string;
    biometricEnabled: boolean;
  }) {
    try {
      await onSaveAccessSettings(input);
      setErrorMessage(null);
      navigate("/settings");
    } catch (error) {
      if (error instanceof Error && error.message) {
        setErrorMessage(error.message);
        return;
      }
      setErrorMessage("Device access settings could not be saved.");
    }
  }

  return (
    <SecureDeviceScreen
      biometricAvailable={biometricAvailable}
      errorMessage={errorMessage}
      onSave={handleSave}
    />
  );
}

function CaptureScreen({
  captureBriefSeen,
  onCaptureBriefSeen,
  services,
  walkthroughEnabled,
}: {
  captureBriefSeen: boolean;
  onCaptureBriefSeen: () => Promise<void>;
  services: AppServices;
  walkthroughEnabled: boolean;
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
  const [captureBriefVisible, setCaptureBriefVisible] = useState(!captureBriefSeen);
  const activeCaptureRef = useRef<ActiveCapture | null>(null);

  useEffect(() => {
    setCaptureBriefVisible(!captureBriefSeen);
  }, [captureBriefSeen]);

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
    if (!captureBriefSeen) {
      await onCaptureBriefSeen().catch(() => undefined);
      setCaptureBriefVisible(false);
    }

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
      setErrorMessage("This device could not start audio capture.");
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
      setErrorMessage("This capture could not be saved.");
      setStatus("Ready to capture");
    }
  }

  return (
    <main className="screen screen--capture">
      <header className="capture-header">
        <div>
          <h1 className="screen-title">Capture</h1>
          <p className="screen-body">Each capture creates a new case. Record once, then review details and choose where to report.</p>
        </div>
        <div className="capture-status-group">
          <span className="status-chip">{status}</span>
          <span className="status-chip">{locationState.label}</span>
        </div>
      </header>

      <section className="capture-stage">
        {walkthroughEnabled ? (
          <WalkthroughHint
            step={1}
            title="Start here"
            body='Press "Record" to begin. Press "Stop capture" when done.'
          />
        ) : null}
        <p className="capture-timer">{formatDuration(elapsedMs)}</p>
        <button
          aria-label={recording ? "Stop capture" : "Start capture"}
          className={`capture-orb ${recording ? "capture-orb--recording" : ""}`}
          onClick={() => {
            void handleToggleCapture();
          }}
          type="button"
        >
          <span className="capture-orb__core" />
          <span className="capture-orb__ring" />
          <span className="capture-orb__label">{recording ? "Stop capture" : "Record"}</span>
        </button>
        <PrimaryButton
          className={walkthroughEnabled ? "walkthrough-target" : undefined}
          onClick={() => {
            void handleToggleCapture();
          }}
        >
          {recording ? "Stop capture" : "Record"}
        </PrimaryButton>
        <p className="capture-note">The original capture stays local on this device with a verified hash and log entry.</p>
        {captureBriefVisible ? (
          <section className="quick-guide-card" aria-live="polite">
            <h2>Quick guide</h2>
            <p>Start capture, then review details and choose where to report.</p>
            <p>Each capture creates a new case.</p>
            <p>The app keeps the original audio, hash, and case log together as proof.</p>
            <button
              className="secondary-button"
              onClick={() => {
                setCaptureBriefVisible(false);
                if (!captureBriefSeen) {
                  void onCaptureBriefSeen();
                }
              }}
              type="button"
            >
              Got it
            </button>
          </section>
        ) : null}
      </section>

      {errorMessage ? <InlineError message={errorMessage} /> : null}
    </main>
  );
}

function CaptureSavedScreen({
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
      const result = await services.api.transcribe(
        {
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
        },
      );

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
    return <LoadingScreen title="Capture saved" body="Loading the saved capture." />;
  }

  if (captureQuery.isError || !captureQuery.data) {
    return (
      <ScreenMessage
        title="Capture saved"
        body="The saved capture could not be loaded on this device."
        action={<LinkButton to="/capture">Back to capture</LinkButton>}
      />
    );
  }

  const { incident, source_evidence: sourceEvidence } = captureQuery.data;
  const transcriptExists = Boolean(transcriptQuery.data?.transcript);

  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">Capture saved</h1>
        <p className="screen-body">The original capture is stored on this device. A hash and case log entry are saved.</p>
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
          <h2>Transcript</h2>
          <p>Transcript ready. Open the saved transcript to review the full text and timestamps.</p>
          <PrimaryButton
            onClick={() => {
              navigate(`/cases/${incidentId}/transcript`);
            }}
          >
            Open transcript
          </PrimaryButton>
        </section>
      ) : (
        <section className="settings-card">
          {walkthroughEnabled ? (
            <WalkthroughHint
              step={2}
              title="Create transcript"
              body='Press "Build transcript" to convert this capture into text.'
            />
          ) : null}
          <h2>Next step</h2>
          <p>Create the transcript from this capture before reviewing details or where to report.</p>
          <ProgressPanel
            progress={transcribeProgress}
            title="Transcript progress"
            emptyMessage="The first transcript may take longer while this device loads its built-in speech tools."
          />
          <PrimaryButton
            className={walkthroughEnabled ? "walkthrough-target" : undefined}
            disabled={transcribeMutation.isPending}
            onClick={() => {
              if (captureQuery.data) {
                void transcribeMutation.mutate(captureQuery.data);
              }
            }}
          >
            {transcribeMutation.isPending ? "Building transcript" : "Build transcript"}
          </PrimaryButton>
          {transcribeMutation.error ? <InlineError message={resolveTranscribeError(transcribeMutation.error)} /> : null}
        </section>
      )}

      {transcriptExists ? null : (
        <section className="case-card case-card--subtle">
          <p className="screen-body">Transcript creation uses the saved evidence file. The original capture remains unchanged.</p>
        </section>
      )}
    </main>
  );
}

function TranscriptScreen({
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
  const routeSummaryQuery = useQuery({
    queryKey: ["route-recommendation-summary", incidentId],
    queryFn: () => getRouteRecommendationSummary(db, incidentId),
    enabled: Boolean(incidentId),
  });

  const transcribeMutation = useMutation({
    mutationFn: async (context: CaptureContext) => {
      const contentBase64 = arrayBufferToBase64(context.source_evidence.original_bytes ?? new ArrayBuffer(0));
      const result = await services.api.transcribe(
        {
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
        },
      );

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
    return <LoadingScreen title="Transcript" body="Loading the transcript for this case." />;
  }

  if (captureQuery.isError || !captureQuery.data) {
    return (
      <ScreenMessage
        title="Transcript"
        body="The source capture could not be loaded for this case."
        action={<LinkButton to="/capture">Back to capture</LinkButton>}
      />
    );
  }

  if (!transcriptQuery.data?.transcript) {
    return (
      <ScreenMessage
        title="Transcript"
        body="No transcript has been created for this case yet."
        action={
          <>
            <ProgressPanel
              progress={transcribeProgress}
              title="Transcript progress"
              emptyMessage="Transcript work runs on this device and may take longer on the first run."
            />
            <PrimaryButton
              disabled={transcribeMutation.isPending}
              onClick={() => {
                if (captureQuery.data) {
                  void transcribeMutation.mutate(captureQuery.data);
                }
              }}
            >
              {transcribeMutation.isPending ? "Building transcript" : "Build transcript"}
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
        <h1 className="screen-title">Transcript</h1>
        <p className="screen-body">Review the captured audio as text.</p>
      </header>

      <section className="settings-card">
        {walkthroughEnabled ? (
          <WalkthroughHint
            step={3}
            title="Review transcript"
            body='Check the transcript text, then press "Review details".'
          />
        ) : null}
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
        <PrimaryButton
          className={walkthroughEnabled ? "walkthrough-target" : undefined}
          onClick={() => {
            navigate(`/cases/${incidentId}/facts`);
          }}
        >
          {factSetQuery.data?.fact_set ? "Open details" : "Review details"}
        </PrimaryButton>
        <LinkButton to={`/cases/${incidentId}/capture-saved`}>Back</LinkButton>
      </div>
    </main>
  );
}

function FactsScreen({
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
      const result = await services.api.extract(
        {
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
        },
      );

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
      const currentFactSet =
        activeFactSet ??
        factSetQuery.data?.fact_set ??
        null;

      if (!currentFactSet || !formState) {
        throw new Error("fact_set_missing");
      }

      const editedFields = computeEditedFields(currentFactSet, formState);
      const confirmedFields = [
        "incident_type",
        "people",
        "places",
        "businesses",
        "phones",
        "dates",
        "amounts",
        "timeline",
        "key_facts",
      ];

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
      setConfirmError("Facts could not be confirmed right now.");
    },
  });

  if (captureQuery.isLoading || transcriptQuery.isLoading || factSetQuery.isLoading) {
    return <LoadingScreen title="Review details" body="Loading the extracted details for this case." />;
  }

  if (captureQuery.isError || !captureQuery.data || transcriptQuery.isError) {
    return (
      <ScreenMessage
        title="Review details"
        body="The case details could not be loaded on this device."
        action={<LinkButton to="/cases">Back to cases</LinkButton>}
      />
    );
  }

  if (!transcriptQuery.data?.transcript) {
    return (
      <ScreenMessage
        title="Review details"
        body="Transcript is required before details can be prepared."
        action={<LinkButton to={`/cases/${incidentId}/transcript`}>Open transcript</LinkButton>}
      />
    );
  }

  if (!factSetQuery.data?.fact_set && !formState && extractMutation.isPending) {
    return <LoadingScreen title="Review details" body="Checking names, places, dates, amounts, business details, and timeline from this capture." />;
  }

  if (!factSetQuery.data?.fact_set && !formState) {
    return (
      <ScreenMessage
        title="Review details"
        body="The case details could not be prepared from this transcript."
        action={
          <PrimaryButton
            disabled={extractMutation.isPending}
            onClick={() => {
              void extractMutation.mutate();
            }}
          >
            {extractMutation.isPending ? "Checking details" : "Try again"}
          </PrimaryButton>
        }
        footer={extractMutation.error ? <InlineError message={resolveExtractError(extractMutation.error)} /> : null}
      />
    );
  }

  if (!formState) {
    return <LoadingScreen title="Review details" body="Loading the prepared details." />;
  }

  const reviewed = activeFactSet?.reviewed_by_user ?? factSetQuery.data?.fact_set.reviewed_by_user ?? false;
  const activeValues = activeFactSet ?? factSetQuery.data?.fact_set ?? null;
  const editedFields = activeValues ? computeEditedFields(activeValues, formState) : [];

  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">Review details</h1>
        <p className="screen-body">Check what was pulled from the transcript, edit if needed, then save.</p>
      </header>

      {walkthroughEnabled ? (
        <WalkthroughHint
          step={4}
          title="Confirm details"
          body='Review and edit details, then press "Save details".'
        />
      ) : null}

      <section className="settings-card">
        <div className="section-heading">
          <h2>Review status</h2>
          <span className="status-chip">{reviewed ? "Saved" : "Needs review"}</span>
        </div>
        <p>
          {reviewed
            ? "These details were saved and added to the case log."
            : "These details were pulled from the capture. Edit only if something is incorrect."}
        </p>
        {editedFields.length > 0 ? (
          <InlineNote message={`Edited fields: ${editedFields.join(", ")}`} />
        ) : (
          <InlineNote message="No manual changes yet." />
        )}
      </section>

      {editing ? (
        <>
          <section className="settings-card">
            <label className="field">
              <span>Case type</span>
              <select
                onChange={(event) => updateFactsField(setFormState, "incident_type", event.target.value)}
                value={CASE_TYPE_LABELS.has(formState.incident_type) ? formState.incident_type : ""}
              >
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
            <FactsTextarea
              label="Key facts"
              rows={4}
              value={formState.key_facts}
              onChange={(value) => updateFactsField(setFormState, "key_facts", value)}
            />
            <InlineNote message="Keep one clear fact per line." />
          </section>

          <section className="settings-card">
            <FactsTextarea
              label="Timeline"
              rows={4}
              value={formState.timeline}
              onChange={(value) => updateFactsField(setFormState, "timeline", value)}
              placeholder="One item per line. Use Time | Description"
            />
          </section>

          <section className="settings-card">
            <details>
              <summary>More extracted fields</summary>
              <div className="facts-grid">
                <FactsTextarea
                  label="People named"
                  rows={2}
                  value={formState.people}
                  onChange={(value) => updateFactsField(setFormState, "people", value)}
                />
                <FactsTextarea
                  label="Place"
                  rows={2}
                  value={formState.places}
                  onChange={(value) => updateFactsField(setFormState, "places", value)}
                />
                <FactsTextarea
                  label="Business"
                  rows={2}
                  value={formState.businesses}
                  onChange={(value) => updateFactsField(setFormState, "businesses", value)}
                />
                <FactsTextarea
                  label="Phone numbers"
                  rows={2}
                  value={formState.phones}
                  onChange={(value) => updateFactsField(setFormState, "phones", value)}
                />
                <FactsTextarea
                  label="Dates"
                  rows={2}
                  value={formState.dates}
                  onChange={(value) => updateFactsField(setFormState, "dates", value)}
                />
                <FactsTextarea
                  label="Amounts"
                  rows={2}
                  value={formState.amounts}
                  onChange={(value) => updateFactsField(setFormState, "amounts", value)}
                />
              </div>
            </details>
          </section>
        </>
      ) : (
        <>
          <section className="settings-card summary-grid">
            {buildFactSummaryCards(formState).map((card) => (
              <FactSummaryCard
                key={card.label}
                label={card.label}
                {...(card.value !== undefined ? { value: card.value } : {})}
                {...(card.values !== undefined ? { values: card.values } : {})}
              />
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
        <PrimaryButton
          className={walkthroughEnabled ? "walkthrough-target" : undefined}
          disabled={confirmMutation.isPending}
          onClick={() => {
            void confirmMutation.mutate();
          }}
        >
          {confirmMutation.isPending ? "Saving details" : "Save details"}
        </PrimaryButton>
        {editing ? (
          <button
            className="secondary-button"
            onClick={() => {
              if (activeValues) {
                setFormState(factSetToForm(activeValues));
              }
              setEditing(false);
            }}
            type="button"
          >
            Cancel changes
          </button>
        ) : (
          <button
            className="secondary-button"
            onClick={() => setEditing(true)}
            type="button"
          >
            Edit
          </button>
        )}
        <LinkButton to={`/cases/${incidentId}/routes`}>
          {routeSummaryQuery.data?.recommendations?.length ? "Where to report" : "Find where to report"}
        </LinkButton>
        <LinkButton to="/capture">New capture</LinkButton>
        {confirmError ? <InlineError message={confirmError} /> : null}
        {extractMutation.error ? <InlineError message={resolveExtractError(extractMutation.error)} /> : null}
      </div>
    </main>
  );
}

function CasesScreen({
  db,
  demoCaseId,
  walkthroughEnabled,
}: {
  db: DossierDatabase;
  demoCaseId: string | null;
  walkthroughEnabled: boolean;
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
      await Promise.all([
        loadCases(),
        queryClient.invalidateQueries({ queryKey: ["cases"] }),
      ]);
    },
  });

  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">Cases</h1>
        <p className="screen-body">Manage case files created from your captures on this device.</p>
      </header>
      {walkthroughEnabled ? (
        <WalkthroughHint
          step={1}
          title="Start with the sample case"
          body='Open the demo case file to see a complete example. At the end, come back here and press "Delete case" to practice cleanup.'
        />
      ) : null}
      {cases.length === 0 ? (
        <EmptyState title="No cases yet" detail="Start capture to create your first case." />
      ) : (
        <ul className="case-list">
          {cases.map((record) => (
            <li className="case-card" key={record.id}>
              <dl className="detail-list">
                <div>
                  <dt>Reference</dt>
                  <dd>{record.id}</dd>
                </div>
                <div>
                  <dt>Case type</dt>
                  <dd>{formatCaseTypeLabel(record.category) || "Not set"}</dd>
                </div>
                <div>
                  <dt>Location</dt>
                  <dd>{record.location_address ?? "Location unavailable"}</dd>
                </div>
              </dl>
              <div className="button-row">
                <LinkButton
                  className={walkthroughEnabled && demoCaseId === record.id ? "walkthrough-target" : undefined}
                  to={`/cases/${record.id}`}
                >
                  Open case file
                </LinkButton>
                <LinkButton to={`/cases/${record.id}/routes`}>Where to report</LinkButton>
                <button
                  className={
                    walkthroughEnabled && demoCaseId === record.id
                      ? "secondary-button danger-button walkthrough-target"
                      : "secondary-button danger-button"
                  }
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
      )}
      {deleteMutation.error ? <InlineError message="Case delete did not complete." /> : null}
    </main>
  );
}

function RoutesIndexScreen({
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
        <h1 className="screen-title">Report options</h1>
        <p className="screen-body">Review saved report options for each case.</p>
      </header>
      {walkthroughEnabled ? (
        <WalkthroughHint
          step={2}
          title="Open saved report options"
          body="Use this tab to review pre-built route options for each case."
        />
      ) : null}

      {cases.length === 0 ? (
        <EmptyState title="No report options yet" detail="Review details for a case, then open report options." />
      ) : (
        <ul className="case-list">
          {cases.map((record) => (
            <li className="case-card" key={record.id}>
              <h2>{record.title}</h2>
              <p>{formatCaseTypeLabel(record.category) || "No case type set"}</p>
              <LinkButton
                className={walkthroughEnabled && demoCaseId === record.id ? "walkthrough-target" : undefined}
                to={`/cases/${record.id}/routes`}
              >
                Open report options
              </LinkButton>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function CaseRoutesScreen({
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

  if (captureQuery.isLoading || factSetQuery.isLoading || routesQuery.isLoading) {
    return <LoadingScreen title="Report options" body="Loading options for this case." />;
  }

  if (captureQuery.isError || !captureQuery.data || factSetQuery.isError) {
    return (
      <ScreenMessage
        title="Report options"
        body="The case details could not be loaded on this device."
        action={<LinkButton to="/cases">Back to cases</LinkButton>}
      />
    );
  }

  if (!factSetQuery.data?.fact_set) {
    return (
      <ScreenMessage
        title="Report options"
        body="Confirm the case details before reporting options are prepared."
        action={<LinkButton to={`/cases/${incidentId}/facts`}>Open details</LinkButton>}
      />
    );
  }

  if (!routesQuery.data?.recommendations?.length) {
    return (
      <ScreenMessage
        title="Report options"
        body="No report options are saved for this case yet."
        action={
          <PrimaryButton
            className={walkthroughEnabled ? "walkthrough-target" : undefined}
            disabled={recommendMutation.isPending}
            onClick={() => {
              void recommendMutation.mutate();
            }}
          >
            {recommendMutation.isPending ? "Finding options" : "Find report options"}
          </PrimaryButton>
        }
        footer={recommendMutation.error ? <InlineError message="Report options could not be prepared right now." /> : null}
      />
    );
  }

  const selectedRoute = routesQuery.data.recommendations.find((route) => route.selected) ?? null;
  const approvedDraft =
    draftSummaryQuery.data?.draft_packet && draftSummaryQuery.data.draft_packet.approved
      ? {
          subject: draftSummaryQuery.data.draft_packet.subject,
          body: draftSummaryQuery.data.draft_packet.body,
        }
      : null;

  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">Report options</h1>
        <p className="screen-body">These options match your saved case details and source records.</p>
      </header>

      {walkthroughEnabled ? (
        <WalkthroughHint
          step={5}
          title="Choose where to report"
          body='Select one option with the checkbox, then press "Draft report".'
        />
      ) : null}

      <section className="settings-card">
        <h2>Recommended order</h2>
        <p>Top options are first. Review source and trust before choosing one.</p>
      </section>

      <div className="route-card-list">
        {routesQuery.data.recommendations.map((recommendation) => (
          <section className="settings-card" key={recommendation.id}>
            <div className="section-heading">
              <h2>{recommendation.destination_name_snapshot}</h2>
              <span className="status-chip">
                {routePriorityLabel(recommendation.rank)} · {recommendation.route_group}
              </span>
            </div>
            <p>{recommendation.reason}</p>
            <dl className="detail-list">
              <div>
                <dt>Source</dt>
                <dd>{recommendation.source_label}</dd>
              </div>
              <div>
                <dt>Trust</dt>
                <dd>{recommendation.trust_level}</dd>
              </div>
              <div>
                <dt>Last verified</dt>
                <dd>{recommendation.last_verified_date ?? "Not set"}</dd>
              </div>
              <div>
                <dt>How to send</dt>
                <dd>{recommendation.intake_methods_snapshot.join(", ")}</dd>
              </div>
            </dl>
            {recommendation.required_documents_snapshot.length > 0 ? (
              <p>What you may need: {recommendation.required_documents_snapshot.join(", ")}</p>
            ) : null}
            <div className="button-row">
              <label className="field-checkbox route-select-toggle">
                <input
                  checked={recommendation.selected}
                  disabled={selectMutation.isPending && selectMutation.variables?.routeRecommendationId === recommendation.id}
                  onChange={(event) => {
                    void selectMutation.mutate({
                      routeRecommendationId: recommendation.id,
                      selected: event.target.checked,
                    });
                  }}
                  type="checkbox"
                />
                <span>{recommendation.selected ? "✔️ Selected for this case" : "Use this option"}</span>
              </label>
              {recommendation.complaint_url ? (
                <a className="secondary-button" href={recommendation.complaint_url} rel="noreferrer" target="_blank">
                  Open site 🌐
                </a>
              ) : null}
            </div>
          </section>
        ))}
      </div>

      {selectedRoute ? (
        <section className="settings-card">
          <h2>Send options for selected report</h2>
          <p>These actions are available now. Email and share use the approved draft text.</p>
          <SendActionPanel
            approvedDraft={approvedDraft}
            db={db}
            incidentId={incidentId}
            selectedRoute={selectedRoute}
            services={services}
          />
        </section>
      ) : (
        <InlineNote message="Select one report option to open send actions." />
      )}

      <div className="button-row">
        <LinkButton to={`/cases/${incidentId}/facts`}>Back to details</LinkButton>
        <LinkButton className={walkthroughEnabled ? "walkthrough-target" : undefined} to={`/cases/${incidentId}/draft`}>
          {routesQuery.data.recommendations.some((route) => route.selected) ? "Draft report" : "Choose a destination first"}
        </LinkButton>
        <LinkButton to={`/cases/${incidentId}`}>Case file</LinkButton>
        <LinkButton to="/routes">Report options list</LinkButton>
      </div>
    </main>
  );
}

function DraftReportScreen({
  db,
  walkthroughEnabled,
  services,
}: {
  db: DossierDatabase;
  walkthroughEnabled: boolean;
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
    onSuccess: () => {
      void navigate(`/cases/${incidentId}/send`);
    },
  });

  if (factSetQuery.isLoading || routeSummaryQuery.isLoading || draftQuery.isLoading) {
    return <LoadingScreen title="Draft report" body="Preparing the case draft." />;
  }

  if (!factSetQuery.data?.fact_set) {
    return (
      <ScreenMessage
        title="Draft report"
        body="Confirmed facts are required before a report can be prepared."
        action={<LinkButton to={`/cases/${incidentId}/facts`}>Open details</LinkButton>}
      />
    );
  }

  if (!selectedRoute) {
    return (
      <ScreenMessage
        title="Draft report"
        body="Choose a report option before preparing the draft report."
        action={<LinkButton to={`/cases/${incidentId}/routes`}>Where to report</LinkButton>}
      />
    );
  }

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

  if (!formState) {
    return (
      <ScreenMessage
        title="Draft report"
        body={buildDraftMutation.error ? "Draft generation failed. Retry to continue." : "Creating your report from saved facts and selected route."}
        action={buildDraftMutation.error ? <PrimaryButton onClick={() => void buildDraftMutation.mutate()}>Retry draft</PrimaryButton> : null}
        footer={
          <>
            {buildDraftMutation.error ? <InlineError message="Draft report could not be prepared right now." /> : null}
          </>
        }
      />
    );
  }

  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">Draft report</h1>
        <p className="screen-body">Review and edit the report before sending or handing it off.</p>
      </header>

      {walkthroughEnabled ? (
        <WalkthroughHint
          step={6}
          title="Review report draft"
          body='Edit the text if needed, then press "Save report and continue".'
        />
      ) : null}

      <section className="settings-card">
        <dl className="detail-list">
          <div>
            <dt>Report option</dt>
            <dd>{selectedRoute.destination_name_snapshot}</dd>
          </div>
          <div>
            <dt>How to send</dt>
            <dd>{selectedRoute.intake_methods_snapshot.join(", ")}</dd>
          </div>
          <div>
            <dt>Trust</dt>
            <dd>{selectedRoute.trust_level}</dd>
          </div>
        </dl>
      </section>

      <section className="settings-card">
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
      </section>

      <section className="settings-card">
        <h2>Attached proof</h2>
        <ul className="inline-list">
          {(draftQuery.data?.draft_packet.attachment_labels ?? []).map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      </section>

      <section className="settings-card">
        <h2>Send options</h2>
        <p>Use these actions after you review the route and report text.</p>
        <SendActionPanel
          approvedDraft={
            draftQuery.data?.draft_packet
              ? {
                  subject: formState.subject,
                  body: formState.body,
                }
              : null
          }
          db={db}
          incidentId={incidentId}
          selectedRoute={selectedRoute}
          services={services}
        />
      </section>

      <div className="button-row">
        <PrimaryButton
          className={walkthroughEnabled ? "walkthrough-target" : undefined}
          disabled={approveMutation.isPending}
          onClick={() => {
            void approveMutation.mutate();
          }}
        >
          {approveMutation.isPending ? "Saving report" : "Save report and continue"}
        </PrimaryButton>
        <LinkButton to={`/cases/${incidentId}/routes`}>Back to where to report</LinkButton>
        {approveMutation.error ? <InlineError message="Draft approval did not complete." /> : null}
      </div>
    </main>
  );
}

function SendHandoffScreen({
  db,
  services,
  walkthroughEnabled,
}: {
  db: DossierDatabase;
  services: AppServices;
  walkthroughEnabled: boolean;
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
    return <LoadingScreen title="Send or hand off" body="Preparing the packet for this case." />;
  }

  if (!caseSummaryQuery.data) {
    return (
      <ScreenMessage
        title="Send or hand off"
        body="This case could not be loaded on this device."
        action={<LinkButton to="/cases">Back to cases</LinkButton>}
      />
    );
  }

  if (!selectedRoute) {
    return (
      <ScreenMessage
        title="Send or hand off"
        body="Choose a report option before sending or handing off the packet."
        action={<LinkButton to={`/cases/${incidentId}/routes`}>Where to report</LinkButton>}
      />
    );
  }

  if (!approvedDraft) {
    return (
      <ScreenMessage
        title="Send or hand off"
        body="Approve the draft report before sending or handing off the packet."
        action={<LinkButton to={`/cases/${incidentId}/draft`}>Open draft report</LinkButton>}
      />
    );
  }

  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">Send or hand off</h1>
        <p className="screen-body">Send this report where supported, or hand off the packet with proof.</p>
      </header>

      {walkthroughEnabled ? (
        <WalkthroughHint
          step={7}
          title="Send or share"
          body="Choose an action card to open a site, email, call, share, or export."
        />
      ) : null}

      <section className="settings-card">
        <h2>Before you send</h2>
        <ul className="inline-list">
          <li>Business or agency name confirmed</li>
          <li>Date and amount confirmed</li>
          <li>Outcome request is clear</li>
          <li>Proof packet attached</li>
        </ul>
      </section>

      <section className="settings-card">
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
        <InlineNote message="Official sites open outside Dossier. This case stays saved on this device so you can return and save proof after you finish." />
      </section>

      <SendActionPanel
        approvedDraft={{
          subject: approvedDraft.subject,
          body: approvedDraft.body,
        }}
        db={db}
        incidentId={incidentId}
        selectedRoute={selectedRoute}
        services={services}
        walkthroughEnabled={walkthroughEnabled}
      />

      <div className="button-row">
        <LinkButton to={`/cases/${incidentId}/proof`}>Proof of action</LinkButton>
        <LinkButton to={`/cases/${incidentId}`}>Case file</LinkButton>
        <LinkButton to={`/cases/${incidentId}/draft`}>Back to draft report</LinkButton>
      </div>
    </main>
  );
}

function SendActionPanel({
  approvedDraft,
  db,
  incidentId,
  selectedRoute,
  services,
  walkthroughEnabled = false,
}: {
  approvedDraft: { subject: string; body: string } | null;
  db: DossierDatabase;
  incidentId: string;
  selectedRoute: RouteRecommendationRecord;
  services: AppServices;
  walkthroughEnabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const [actionNote, setActionNote] = useState<string | null>(null);

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

  return (
    <>
      {!approvedDraft ? (
        <InlineNote message="Approve a draft report to enable email and share actions." />
      ) : null}
      <section className="action-grid">
        <button
          className={walkthroughEnabled ? "action-card walkthrough-target" : "action-card"}
          disabled={!selectedRoute.complaint_url}
          onClick={() => {
            if (!selectedRoute.complaint_url) {
              return;
            }

            void services.openExternal(selectedRoute.complaint_url).then(async () => {
              await recordAction({
                method: "web_form",
                status: "attempted",
                externalReferenceUrl: selectedRoute.complaint_url,
              });
              setActionNote("The official site opened outside Dossier. Return here when you are ready to save proof.");
            });
          }}
          type="button"
        >
          <strong>Open official form</strong>
          <span>{selectedRoute.complaint_url ? "Open site 🌐" : "No official form listed for this option."}</span>
        </button>

        <button
          className="action-card"
          disabled={!approvedDraft}
          onClick={() => {
            if (!approvedDraft) {
              return;
            }
            const target = buildMailtoUrl(selectedRoute.email, approvedDraft.subject, approvedDraft.body);
            void services.openExternal(target).then(async () => {
              await recordAction({
                method: "email",
                status: "attempted",
                externalReferenceUrl: selectedRoute.email ? `mailto:${selectedRoute.email}` : null,
              });
              setActionNote("Your email app was opened. Return here after sending to save proof.");
            });
          }}
          type="button"
        >
          <strong>Open in email</strong>
          <span>{selectedRoute.email ?? "Prepare an email draft with the report text and proof packet."}</span>
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
          <strong>Call now</strong>
          <span>{selectedRoute.phone ?? "No phone number listed for this option."}</span>
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
              setActionNote("Share is not available in this browser. The PDF packet was downloaded instead.");
            })();
          }}
          type="button"
        >
          <strong>Share packet</strong>
          <span>Use the device share sheet when available.</span>
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
          <strong>Export PDF</strong>
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
          <strong>Export ZIP</strong>
          <span>Create a portable case packet with source files.</span>
        </button>
      </section>
      {actionNote ? <InlineNote message={actionNote} /> : null}
    </>
  );
}

function ProofActionScreen({ db }: { db: DossierDatabase }) {
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
    return <LoadingScreen title="Proof of action" body="Loading the saved action for this case." />;
  }

  if (!caseSummaryQuery.data) {
    return (
      <ScreenMessage
        title="Proof of action"
        body="This case could not be loaded on this device."
        action={<LinkButton to="/cases">Back to cases</LinkButton>}
      />
    );
  }

  if (!caseSummaryQuery.data.routes.some((route) => route.selected)) {
    return (
      <ScreenMessage
        title="Proof of action"
        body="Choose a report option before saving proof of action."
        action={<LinkButton to={`/cases/${incidentId}/routes`}>Where to report</LinkButton>}
      />
    );
  }

  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">Proof of action</h1>
        <p className="screen-body">Save what you sent, where it went, and any confirmation you received.</p>
      </header>

      <section className="settings-card">
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
          <input
            onChange={(event) => setExternalReferenceUrl(event.target.value)}
            placeholder="https://"
            type="url"
            value={externalReferenceUrl}
          />
        </label>
        <FactsTextarea label="Proof note" value={notes} onChange={setNotes} />
      </section>

      <div className="button-row">
        <PrimaryButton
          disabled={saveMutation.isPending}
          onClick={() => {
            void saveMutation.mutate();
          }}
        >
          {saveMutation.isPending ? "Saving proof" : "Save proof"}
        </PrimaryButton>
        <LinkButton to={`/cases/${incidentId}/send`}>Back to send or hand off</LinkButton>
        {saveMutation.error ? <InlineError message="Proof could not be saved right now." /> : null}
      </div>
    </main>
  );
}

function ExportCaseFileScreen({
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
    return <LoadingScreen title="Export case file" body="Preparing the export options for this case." />;
  }

  if (!caseSummaryQuery.data) {
    return (
      <ScreenMessage
        title="Export case file"
        body="This case could not be loaded on this device."
        action={<LinkButton to="/cases">Back to cases</LinkButton>}
      />
    );
  }

  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">Export case file</h1>
        <p className="screen-body">Create a packet with evidence, transcript, report options, draft, and log.</p>
      </header>

      {walkthroughEnabled ? (
        <WalkthroughHint
          step={8}
          title="Download packet"
          body='Press "Export ZIP" for a full portable case file, or "Export PDF" for a report packet.'
        />
      ) : null}

      <section className="action-grid">
        <button
          className={walkthroughEnabled ? "action-card walkthrough-target" : "action-card"}
          onClick={() => {
            void exportPacket("pdf");
          }}
          type="button"
        >
          <strong>Create PDF</strong>
          <span>Build a report packet for review or filing.</span>
        </button>
        <button
          className="action-card"
          onClick={() => {
            void exportPacket("zip");
          }}
          type="button"
        >
          <strong>Create ZIP</strong>
          <span>Build a portable case packet with source files.</span>
        </button>
      </section>

      {note ? <InlineNote message={note} /> : null}

      <div className="button-row">
        <LinkButton to={`/cases/${incidentId}`}>Back to case file</LinkButton>
      </div>
    </main>
  );
}

function CaseFileScreen({
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
    return <LoadingScreen title="Case file" body="Loading the full case record." />;
  }

  if (!caseSummaryQuery.data) {
    return (
      <ScreenMessage
        title="Case file"
        body="This case file could not be loaded on this device."
        action={<LinkButton to="/cases">Back to cases</LinkButton>}
      />
    );
  }

  const summary = caseSummaryQuery.data;
  const selectedRoute = summary.routes.find((route) => route.selected) ?? null;
  const isDemoCase = Boolean(demoCaseId) && summary.incident.id === demoCaseId;

  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">Case file</h1>
        <p className="screen-body">Review the full case record.</p>
      </header>

      {walkthroughEnabled && isDemoCase ? (
        <section className="settings-card settings-card--walkthrough settings-card--highlight">
          <h2>Demo flow</h2>
          <ol className="walkthrough-list">
            <li>
              <span className="walkthrough-list__number">3</span>
              <span>Review transcript and facts in this sample case.</span>
            </li>
            <li>
              <span className="walkthrough-list__number">4</span>
              <span>Open report options, draft, send, and export to see the full process.</span>
            </li>
            <li>
              <span className="walkthrough-list__number">5</span>
              <span>Return to Cases and delete this demo case when finished.</span>
            </li>
          </ol>
        </section>
      ) : null}

      <section className="case-card">
        <dl className="detail-list">
          <div>
            <dt>Case reference</dt>
            <dd>{summary.incident.id}</dd>
          </div>
          <div>
            <dt>Case type</dt>
            <dd>{formatCaseTypeLabel(summary.fact_set?.incident_type ?? summary.incident.category) || "Not set"}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{summary.incident.location_address ?? "Not saved"}</dd>
          </div>
        </dl>
      </section>

      <section className="settings-card">
        <div className="section-heading">
          <h2>Details</h2>
          <LinkButton to={`/cases/${incidentId}/facts`}>Open details</LinkButton>
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
          <h2>Where to report</h2>
          <LinkButton to={`/cases/${incidentId}/routes`}>Open report options</LinkButton>
        </div>
        {selectedRoute ? (
          <dl className="detail-list">
            <div>
              <dt>Selected option</dt>
              <dd>{selectedRoute.destination_name_snapshot}</dd>
            </div>
            <div>
              <dt>Trust</dt>
              <dd>{selectedRoute.trust_level}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{selectedRoute.source_label}</dd>
            </div>
          </dl>
        ) : (
          <p>No report option selected yet.</p>
        )}
      </section>

      <section className="settings-card">
        <div className="section-heading">
          <h2>Draft report</h2>
          <LinkButton to={`/cases/${incidentId}/draft`}>Open draft</LinkButton>
        </div>
        {summary.draft_packet ? (
          <>
            <p>{summary.draft_packet.subject}</p>
            <span className="status-chip">{summary.draft_packet.approved ? "Approved" : "Ready for review"}</span>
          </>
        ) : (
          <p>No draft saved yet.</p>
        )}
      </section>

      <section className="settings-card">
        <div className="section-heading">
          <h2>Proof of action</h2>
          <LinkButton to={`/cases/${incidentId}/proof`}>Open proof</LinkButton>
        </div>
        {summary.submission_proof ? (
          <dl className="detail-list">
            <div>
              <dt>Status</dt>
              <dd>{summary.submission_proof.status}</dd>
            </div>
            <div>
              <dt>Method</dt>
              <dd>{summary.submission_proof.method}</dd>
            </div>
            <div>
              <dt>Confirmation</dt>
              <dd>{summary.submission_proof.confirmation_number ?? "Not saved"}</dd>
            </div>
          </dl>
        ) : (
          <p>No proof saved yet.</p>
        )}
      </section>

      <section className="settings-card">
        <div className="section-heading">
          <h2>Evidence</h2>
          <LinkButton to={`/cases/${incidentId}/export`}>Export case file</LinkButton>
        </div>
        <ul className="inline-list">
          {[
            summary.source_evidence ? `Original evidence (${summary.source_evidence.mime_type})` : null,
            summary.transcript ? "Transcript" : null,
            ...summary.derived_evidence.map((item) => `${item.type} (${item.mime_type})`),
          ]
            .filter((value): value is string => Boolean(value))
            .map((value) => (
              <li key={value}>{value}</li>
            ))}
        </ul>
      </section>

      <section className="settings-card">
        <div className="section-heading">
          <h2>Log</h2>
          <span className="status-chip">{summary.custody_log.length} entries</span>
        </div>
        <button
          className="secondary-button"
          onClick={() => setShowFullLog((current) => !current)}
          type="button"
        >
          {showFullLog ? "Hide full log" : "View full log"}
        </button>
        {showFullLog ? (
          <ol className="log-list">
            {summary.custody_log
              .slice()
              .reverse()
              .map((entry) => (
                <li key={entry.id}>
                  <strong>{entry.action}</strong>
                  <span>{formatLocalDateTime(entry.created_at)}</span>
                </li>
              ))}
          </ol>
        ) : (
          <InlineNote message="The full log stays collapsed until you choose to review it." />
        )}
      </section>
    </main>
  );
}

function SettingsScreen({
  biometricEnabled,
  captureBriefSeen,
  currentTheme,
  fullAppWalkthroughEnabled,
  lockConfigured,
  onLockNow,
  onFullAppWalkthroughEnabled,
  onRequireUnlockOnOpenChange,
  onResetCaptureBrief,
  onThemeChange,
  requireUnlockOnOpen,
}: {
  biometricEnabled: boolean;
  captureBriefSeen: boolean;
  currentTheme: ThemeMode;
  fullAppWalkthroughEnabled: boolean;
  lockConfigured: boolean;
  onLockNow: () => Promise<void>;
  onFullAppWalkthroughEnabled: (enabled: boolean) => Promise<void>;
  onRequireUnlockOnOpenChange: (requireUnlockOnOpen: boolean) => Promise<void>;
  onResetCaptureBrief: () => Promise<void>;
  onThemeChange: (theme: ThemeMode) => Promise<void>;
  requireUnlockOnOpen: boolean;
}) {
  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">Settings</h1>
        <p className="screen-body">Manage access, theme, and this device.</p>
      </header>
      <section className="settings-card">
        <h2>Device</h2>
        <p>This MVP keeps captures and case files private to this device.</p>
      </section>
      <section className="settings-card">
        <h2>Theme 🎨</h2>
        <div className="segmented-control" role="group" aria-label="Theme">
          <button
            className={currentTheme === "slate" ? "segmented-control__button is-active" : "segmented-control__button"}
            onClick={() => {
              void onThemeChange("slate");
            }}
            type="button"
          >
            Dark
          </button>
          <button
            className={currentTheme === "paper" ? "segmented-control__button is-active" : "segmented-control__button"}
            onClick={() => {
              void onThemeChange("paper");
            }}
            type="button"
          >
            Light
          </button>
        </div>
      </section>
      <section className="settings-card">
        <h2>Quick guide</h2>
        <p>Show reminders that explain each step while you use the app.</p>
        <p>Capture reminder: {captureBriefSeen ? "Hidden after first use" : "Will show on Capture screen"}</p>
        <p>App walkthrough: {fullAppWalkthroughEnabled ? "On" : "Off"}</p>
        <div className="button-row">
          <button
            className="secondary-button"
            onClick={() => {
              void onResetCaptureBrief();
            }}
            type="button"
          >
            Show capture reminder
          </button>
          <label className="field-checkbox">
            <input
              checked={fullAppWalkthroughEnabled}
              onChange={(event) => {
                void onFullAppWalkthroughEnabled(event.target.checked);
              }}
              type="checkbox"
            />
            <span>Show guided walkthrough on every app start</span>
          </label>
        </div>
      </section>
      <section className="settings-card">
        <h2>Roadmap and FAQ</h2>
        <details>
          <summary>What is planned next?</summary>
          <p>
            Dossier is currently local-first and voice-first. Planned options include camera evidence capture support,
            external device camera workflows, and stronger evidence packaging controls for investigative use.
          </p>
        </details>
        <details>
          <summary>Will camera support be optional?</summary>
          <p>
            Yes. Camera support is planned as an option so the core capture flow can remain simple for users who only
            need voice capture.
          </p>
        </details>
        <details>
          <summary>Is AR/XR part of the plan?</summary>
          <p>
            Yes. AR/XR is a future direction. The app is being structured so case data, location context, and evidence
            history can be extended for spatial review later.
          </p>
        </details>
      </section>
      <section className="settings-card">
        <h2>Access</h2>
        <p>{lockConfigured ? "A device code is set on this device." : "No device code is set on this device yet."}</p>
        <p>Unlock on open: {lockConfigured && requireUnlockOnOpen ? "On" : "Off"}</p>
        <p>Device unlock: {biometricEnabled ? "Enabled when available" : "Off"}</p>
        <label className="field-checkbox">
          <input
            checked={requireUnlockOnOpen}
            disabled={!lockConfigured}
            onChange={(event) => {
              void onRequireUnlockOnOpenChange(event.target.checked);
            }}
            type="checkbox"
          />
          <span>Require unlock on open</span>
        </label>
        {!lockConfigured ? <InlineNote message="Set a device code before turning on unlock on open." /> : null}
        <div className="button-row">
          <LinkButton to="/settings/access">{lockConfigured ? "Change device code" : "Set device code"}</LinkButton>
          {lockConfigured ? (
            <PrimaryButton
              onClick={() => {
                void onLockNow();
              }}
            >
              Lock now
            </PrimaryButton>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function SecureDeviceScreen({
  biometricAvailable,
  errorMessage,
  onSave,
}: {
  biometricAvailable: boolean;
  errorMessage: string | null;
  onSave: (input: {
    pin: string;
    biometricEnabled: boolean;
  }) => Promise<void>;
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
      body="Set the local code that protects case access."
      detail="You can change theme later in Settings."
      actionSlot={
        <>
          <label className="field">
            <span>Device code</span>
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={8}
              onChange={(event) => setPin(event.target.value)}
              type="password"
              value={pin}
            />
          </label>
          <label className="field">
            <span>Confirm code</span>
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={8}
              onChange={(event) => setConfirmPin(event.target.value)}
              type="password"
              value={confirmPin}
            />
          </label>
          {biometricAvailable ? (
            <label className="field-checkbox">
              <input
                checked={biometricEnabled}
                onChange={(event) => setBiometricEnabled(event.target.checked)}
                type="checkbox"
              />
              <span>Use device unlock when available</span>
            </label>
          ) : (
            <InlineNote message="Device unlock is not available in this browser right now." />
          )}
          <PrimaryButton onClick={() => void handleContinue()}>Continue</PrimaryButton>
          {localError ? <InlineError message={localError} /> : null}
          {errorMessage ? <InlineError message={errorMessage} /> : null}
        </>
      }
    />
  );
}

function UnlockScreen({
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
      body="Enter your local code to open case files on this device."
      actionSlot={
        <>
          <label className="field">
            <span>Device code</span>
            <input
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={8}
              onChange={(event) => setPin(event.target.value)}
              type="password"
              value={pin}
            />
          </label>
          <PrimaryButton onClick={() => void onUnlock(pin)}>Unlock</PrimaryButton>
          {biometricEnabled ? (
            <button
              className="secondary-button"
              onClick={() => {
                void onDeviceUnlock();
              }}
              type="button"
            >
              Use device unlock
            </button>
          ) : null}
          {errorMessage ? <InlineError message={errorMessage} /> : null}
        </>
      }
    />
  );
}

function FullScreenShell({
  title,
  body,
  detail,
  actionSlot,
}: {
  title: string;
  body: string;
  detail?: string;
  actionSlot: ReactNode;
}) {
  return (
    <main className="shell">
      <section className="shell-card">
        <div aria-label="Dossier brand" className="brand-lockup">
          <img alt="Dossier folder mark" className="brand-mark brand-mark--small" src="/brand/dossier-mark.svg" />
          <span className="brand-lockup__wordmark">DOSSIER</span>
        </div>
        <h1 className="shell-title">{title}</h1>
        <p className="shell-body">{body}</p>
        {detail ? <p className="shell-detail">{detail}</p> : null}
        <div className="shell-actions">{actionSlot}</div>
      </section>
    </main>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <section className="empty-state">
      <h2>{title}</h2>
      <p>{detail}</p>
    </section>
  );
}

function LoadingScreen({ title, body }: { title: string; body: string }) {
  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">{title}</h1>
        <p className="screen-body">{body}</p>
      </header>
    </main>
  );
}

function ProgressPanel({
  progress,
  title,
  emptyMessage,
}: {
  progress: LocalAiProgressEvent | null;
  title: string;
  emptyMessage: string;
}) {
  const determinate = typeof progress?.progress === "number" && Number.isFinite(progress.progress);
  const progressValue = determinate ? Math.max(0, Math.min(100, progress.progress ?? 0)) : undefined;

  return (
    <section className="progress-panel" aria-live="polite">
      <div className="section-heading">
        <h2>{title}</h2>
        {determinate ? <span className="status-chip">{Math.round(progressValue ?? 0)}%</span> : null}
      </div>
      <p>{progress?.label ?? emptyMessage}</p>
      <progress className="progress-bar" max={100} value={progressValue} />
      {progress ? (
        <dl className="detail-list">
          <div>
            <dt>Stage</dt>
            <dd>{formatProgressStage(progress.stage)}</dd>
          </div>
          <div>
            <dt>Model</dt>
            <dd>{progress.model ?? "Local speech tools"}</dd>
          </div>
          <div>
            <dt>File</dt>
            <dd>{progress.file ?? "Current bundle"}</dd>
          </div>
          <div>
            <dt>Progress</dt>
            <dd>{formatProgressBytes(progress.loaded_bytes, progress.total_bytes)}</dd>
          </div>
        </dl>
      ) : null}
    </section>
  );
}

function ScreenMessage({
  title,
  body,
  action,
  footer,
}: {
  title: string;
  body: string;
  action: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">{title}</h1>
        <p className="screen-body">{body}</p>
      </header>
      <section className="settings-card">
        {action}
        {footer}
      </section>
    </main>
  );
}

function WalkthroughHint({
  body,
  step,
  title,
}: {
  body: string;
  step: number;
  title: string;
}) {
  return (
    <section className="settings-card settings-card--walkthrough settings-card--highlight" aria-live="polite">
      <h2>
        Step {step}: {title}
      </h2>
      <p>{body}</p>
    </section>
  );
}

function PrimaryButton({
  className,
  children,
  disabled,
  onClick,
}: {
  className?: string;
  children: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button className={className ? `primary-button ${className}` : "primary-button"} disabled={disabled} onClick={onClick} type="button">
      {children}
    </button>
  );
}

function FactSummaryCard({
  label,
  value,
  values,
}: {
  label: string;
  value?: string;
  values?: string[];
}) {
  const normalizedValues = values?.filter((entry) => entry.trim().length > 0) ?? [];
  const displayValue = value?.trim() ?? "";

  return (
    <section className="fact-summary-card">
      <h2>{label}</h2>
      {displayValue ? <p className="fact-summary-card__value">{displayValue}</p> : null}
      {!displayValue ? (
        <FactPillList items={normalizedValues} emptyLabel={`No ${label.toLowerCase()} found.`} />
      ) : null}
    </section>
  );
}

function FactPillList({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <p className="fact-empty">{emptyLabel}</p>;
  }

  return (
    <ul className="pill-list">
      {items.map((item) => (
        <li className="pill-list__item" key={item}>
          {item}
        </li>
      ))}
    </ul>
  );
}

function FactTimelinePreview({ timeline }: { timeline: Array<{ time_label: string; description: string }> }) {
  if (timeline.length === 0) {
    return <p className="fact-empty">No timeline items were pulled from this capture.</p>;
  }

  return (
    <ol className="timeline-preview">
      {timeline.map((item, index) => (
        <li className="timeline-preview__item" key={`${item.time_label}:${item.description}:${index}`}>
          <strong>{item.time_label || "Time not set"}</strong>
          <span>{item.description}</span>
        </li>
      ))}
    </ol>
  );
}

function FactsTextarea({
  label,
  onChange,
  placeholder,
  rows,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  value: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <textarea
        className="field-textarea"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        rows={rows ?? 4}
        value={value}
      />
    </label>
  );
}

function InlineError({ message }: { message: string }) {
  return <p className="inline-error">{message}</p>;
}

function InlineNote({ message }: { message: string }) {
  return <p className="inline-note">{message}</p>;
}

function LinkButton({ children, className, to }: { children: ReactNode; className?: string; to: string }) {
  return (
    <Link className={className ? `secondary-button ${className}` : "secondary-button"} to={to}>
      {children}
    </Link>
  );
}

function TabLink({ children, to }: { children: ReactNode; to: string }) {
  return (
    <NavLink className={({ isActive }) => (isActive ? "bottom-nav__link is-active" : "bottom-nav__link")} to={to}>
      {children}
    </NavLink>
  );
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `00:${minutes}:${seconds}`;
}


function formatTimestampMs(durationMs: number) {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatProgressStage(stage: LocalAiProgressEvent["stage"]) {
  switch (stage) {
    case "download":
      return "Downloading";
    case "load":
      return "Loading";
    case "transcribe":
      return "Transcribing";
    case "ready":
      return "Ready";
  }
}

function routePriorityLabel(rank: number) {
  if (rank <= 1) {
    return "Best first";
  }
  if (rank <= 3) {
    return "Also useful";
  }
  return "Backup option";
}

function formatProgressBytes(loadedBytes: number | null, totalBytes: number | null) {
  if (typeof loadedBytes !== "number" || typeof totalBytes !== "number" || totalBytes <= 0) {
    return "In progress";
  }

  return `${formatBytes(loadedBytes)} of ${formatBytes(totalBytes)}`;
}

function formatLocalDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    timeZoneName: "short",
  }).format(parsed);
}

function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function resolveLocalAiPreparationError(error: unknown) {
  if (error instanceof FrontendRuntimeError) {
    const detailMessage = extractNestedErrorMessage(error.details);
    return detailMessage ? `${error.message} ${detailMessage}` : error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Built-in speech tools could not be loaded on this device.";
}

function extractNestedErrorMessage(details: unknown) {
  const messages = collectErrorMessages(details);
  return messages.length > 0 ? messages.join(" | ") : null;
}

function collectErrorMessages(value: unknown, seen = new Set<unknown>()): string[] {
  if (!value || seen.has(value)) {
    return [] as string[];
  }

  if (typeof value === "object" || typeof value === "function") {
    seen.add(value);
  }

  if (value instanceof Error) {
    return uniqueMessages([
      value.name && value.message ? `${value.name}: ${value.message}` : value.message,
      ...collectErrorMessages((value as Error & { cause?: unknown }).cause, seen),
    ]);
  }

  if (typeof value === "string") {
    return value.length > 0 ? [value] : [];
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const direct = [
      typeof record.message === "string" ? record.message : null,
      typeof record.ERROR_MESSAGE === "string" ? `ERROR_MESSAGE: ${record.ERROR_MESSAGE}` : null,
      typeof record.ERROR_CODE === "string" || typeof record.ERROR_CODE === "number"
        ? `ERROR_CODE: ${String(record.ERROR_CODE)}`
        : null,
      typeof record.code === "string" || typeof record.code === "number" ? `code: ${String(record.code)}` : null,
      typeof record.name === "string" && typeof record.message === "string"
        ? `${record.name}: ${record.message}`
        : null,
    ].filter((entry): entry is string => Boolean(entry));

    const nested: string[] = [
      ...collectErrorMessages(record.cause, seen),
      ...collectErrorMessages(record.error, seen),
      ...collectErrorMessages(record.details, seen),
    ];

    return uniqueMessages([...direct, ...nested]);
  }

  return [];
}

function uniqueMessages(messages: string[]): string[] {
  return [...new Set(messages.filter((message) => message.trim().length > 0))];
}

function normalizeAppPath(path: string | null) {
  if (!path || !path.startsWith("/")) {
    return null;
  }

  if (path.startsWith("//")) {
    return null;
  }

  return path;
}

async function toArrayBuffer(input: Blob | BlobPart) {
  if (typeof input === "object" && input !== null && "arrayBuffer" in input && typeof input.arrayBuffer === "function") {
    return input.arrayBuffer();
  }

  return new Response(input).arrayBuffer();
}

function arrayBufferToBase64(input: ArrayBuffer) {
  const bytes = new Uint8Array(input);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function copyBuffer(input: Uint8Array) {
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  return copy.buffer;
}

function resolveDeviceUnlockError(error: unknown) {
  if (error instanceof FrontendRuntimeError) {
    if (error.code === "device_unlock_unavailable" || error.code === "device_unlock_failed") {
      return error.message;
    }
  }

  return "Device unlock did not complete.";
}

function resolveTranscribeError(error: unknown) {
  if (error instanceof FrontendRuntimeError) {
    return error.message;
  }

  return "Transcript creation did not complete. Try again.";
}

function resolveExtractError(error: unknown) {
  if (error instanceof FrontendRuntimeError) {
    if (error.code === "backend_unreachable") {
      return "The detail review service is not reachable right now.";
    }

    return error.message;
  }

  return "Details could not be prepared right now.";
}

function factSetToForm(factSet: FactSetRecord): FactsFormState {
  return {
    incident_type: factSet.incident_type ?? "",
    people: factSet.people.join("\n"),
    places: factSet.places.join("\n"),
    businesses: factSet.businesses.join("\n"),
    phones: factSet.phones.join("\n"),
    dates: factSet.dates.join("\n"),
    amounts: factSet.amounts.join("\n"),
    timeline: factSet.timeline.map((item) => `${item.time_label} | ${item.description}`).join("\n"),
    key_facts: factSet.key_facts.join("\n"),
  };
}

function buildFactSummaryCards(form: FactsFormState) {
  const cards: Array<{ label: string; value?: string; values?: string[] }> = [
    {
      label: "Case type",
      value: formatCaseTypeLabel(form.incident_type) || "Not set",
    },
  ];

  const listCards: Array<{ label: string; values: string[] }> = [
    { label: "People named", values: splitLines(form.people) },
    { label: "Place", values: splitLines(form.places) },
    { label: "Business", values: splitLines(form.businesses) },
    { label: "Phone numbers", values: splitLines(form.phones) },
    { label: "Dates", values: splitLines(form.dates) },
    { label: "Amounts", values: splitLines(form.amounts) },
  ];

  for (const card of listCards) {
    if (card.values.length > 0) {
      cards.push(card);
    }
  }

  return cards;
}

function updateFactsField(
  setFormState: Dispatch<SetStateAction<FactsFormState | null>>,
  field: keyof FactsFormState,
  value: string,
) {
  setFormState((current) => {
    if (!current) {
      return current;
    }

    return {
      ...current,
      [field]: value,
    };
  });
}

function splitLines(value: string) {
  return value
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseTimeline(value: string) {
  return splitLines(value).map((entry) => {
    const separatorIndex = entry.indexOf("|");
    if (separatorIndex === -1) {
      return {
        time_label: "",
        description: entry,
      };
    }

    return {
      time_label: entry.slice(0, separatorIndex).trim(),
      description: entry.slice(separatorIndex + 1).trim(),
    };
  });
}

function normalizeOptionalText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatCaseTypeLabel(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const mapped = CASE_TYPE_LABELS.get(value);
  if (mapped) {
    return mapped;
  }

  return value
    .replaceAll("_", " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/\b\w/gu, (char) => char.toUpperCase());
}

function computeEditedFields(original: FactSetRecord, form: FactsFormState) {
  const editedFields: string[] = [];

  const currentValues = {
    incident_type: normalizeOptionalText(form.incident_type),
    people: splitLines(form.people),
    places: splitLines(form.places),
    businesses: splitLines(form.businesses),
    phones: splitLines(form.phones),
    dates: splitLines(form.dates),
    amounts: splitLines(form.amounts),
    timeline: parseTimeline(form.timeline),
    key_facts: splitLines(form.key_facts),
  };

  if (original.incident_type !== currentValues.incident_type) {
    editedFields.push("incident_type");
  }
  if (JSON.stringify(original.people) !== JSON.stringify(currentValues.people)) {
    editedFields.push("people");
  }
  if (JSON.stringify(original.places) !== JSON.stringify(currentValues.places)) {
    editedFields.push("places");
  }
  if (JSON.stringify(original.businesses) !== JSON.stringify(currentValues.businesses)) {
    editedFields.push("businesses");
  }
  if (JSON.stringify(original.phones) !== JSON.stringify(currentValues.phones)) {
    editedFields.push("phones");
  }
  if (JSON.stringify(original.dates) !== JSON.stringify(currentValues.dates)) {
    editedFields.push("dates");
  }
  if (JSON.stringify(original.amounts) !== JSON.stringify(currentValues.amounts)) {
    editedFields.push("amounts");
  }
  if (JSON.stringify(original.timeline) !== JSON.stringify(currentValues.timeline)) {
    editedFields.push("timeline");
  }
  if (JSON.stringify(original.key_facts) !== JSON.stringify(currentValues.key_facts)) {
    editedFields.push("key_facts");
  }

  return editedFields;
}

function factSetRecordToDto(factSet: FactSetRecord): FactSetDto {
  return {
    fact_set_id: factSet.id,
    incident_type: factSet.incident_type,
    people: factSet.people,
    places: factSet.places,
    businesses: factSet.businesses,
    phones: factSet.phones,
    dates: factSet.dates,
    amounts: factSet.amounts,
    timeline: factSet.timeline,
    key_facts: factSet.key_facts,
    reviewed_by_user: factSet.reviewed_by_user,
  };
}

function buildMailtoUrl(email: string | null, subject: string, body: string) {
  const recipient = email ?? "";
  const params = new URLSearchParams({
    subject,
    body,
  });
  return `mailto:${recipient}?${params.toString()}`;
}

function isSubmissionMethod(value: string): value is SubmissionProofRecord["method"] {
  return ["web_form", "email", "phone", "mail", "share"].includes(value);
}

function isSubmissionStatus(value: string): value is SubmissionProofRecord["status"] {
  return ["attempted", "sent", "submitted", "shared", "called", "saved"].includes(value);
}
