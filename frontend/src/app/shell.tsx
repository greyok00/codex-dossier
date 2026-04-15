import { useCallback, useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { FolderOpen, Mic, RefreshCw, Send, Settings2 } from "lucide-react";

import { GlassButton } from "@/components/ui/glass-button";
import { GlassBadge } from "@/components/ui/glass-badge";
import { buildBackendHealthUrl, getFrontendConfig } from "@/lib/config";
import { setLastOpenPath, type DossierDatabase } from "@/lib/db";
import type { AppServices } from "@/lib/runtime";

import {
  CaptureSavedScreen,
  CaptureScreen,
  CaseFileScreen,
  CaseRoutesScreen,
  CasesScreen,
  DraftReportScreen,
  ExportCaseFileScreen,
  FactsScreen,
  PrepareLocalAiScreen,
  ProofActionScreen,
  RoutesIndexScreen,
  SecureDeviceScreen,
  SendHandoffScreen,
  SettingsScreen,
  TranscriptScreen,
  UnlockScreen,
} from "./screens";
import { normalizeAppPath } from "./helpers";
import { TabLink } from "./ui";

export { PrepareLocalAiScreen, SecureDeviceScreen, UnlockScreen };

type BackendHealthState = "idle" | "checking" | "healthy" | "degraded";
const frontendConfig = getFrontendConfig();
const runtimeStatusTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
});
const BACKEND_HEALTH_INTERVAL_MS = 15_000;

function RuntimeStatusPanel() {
  const config = frontendConfig;
  const [healthState, setHealthState] = useState<BackendHealthState>(config.apiMode === "backend" ? "checking" : "idle");
  const [statusMessage, setStatusMessage] = useState(
    config.apiMode === "backend"
      ? "Checking the backend connection."
      : "Local mode is active. The frontend stays usable without the backend process.",
  );
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const refreshBackendHealth = useCallback(async () => {
    if (config.apiMode !== "backend") {
      return;
    }

    setHealthState("checking");
    setStatusMessage("Checking the backend connection.");

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, 4000);

    try {
      const response = await fetch(buildBackendHealthUrl(config), {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as
        | { ok?: boolean; data?: { status?: string; timestamp?: string } }
        | null;

      if (response.ok && payload?.ok && payload.data?.status === "up") {
        setHealthState("healthy");
        setStatusMessage("Backend is online. AI and reporting actions are available.");
        setCheckedAt(payload.data.timestamp ?? new Date().toISOString());
        return;
      }

      setHealthState("degraded");
      setStatusMessage("Backend health did not return a usable response. Retry after the process restarts.");
      setCheckedAt(new Date().toISOString());
    } catch {
      setHealthState("degraded");
      setStatusMessage("Backend is offline. Saved local case data is still available. AI and reporting actions will reconnect after the backend returns.");
      setCheckedAt(new Date().toISOString());
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, [config]);

  useEffect(() => {
    if (config.apiMode !== "backend") {
      return;
    }

    void refreshBackendHealth();
    const intervalId = window.setInterval(() => {
      void refreshBackendHealth();
    }, BACKEND_HEALTH_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [config.apiMode, refreshBackendHealth]);

  const healthVariant =
    config.apiMode === "local"
      ? "success"
      : healthState === "healthy"
        ? "success"
        : healthState === "degraded"
          ? "destructive"
          : "warning";

  const modeLabel = config.apiMode === "backend" ? "Backend mode" : "Local mode";
  const runtimeLabel = `${config.runtimeMode.charAt(0).toUpperCase()}${config.runtimeMode.slice(1)} runtime`;
  const checkedLabel =
    checkedAt === null
      ? "Waiting for first health check."
      : `Last checked ${runtimeStatusTimeFormatter.format(new Date(checkedAt))}.`;

  const isCompact = config.apiMode !== "backend" || healthState === "healthy" || healthState === "checking";

  if (isCompact) {
    return (
      <section aria-live="polite" className="runtime-panel runtime-panel--compact">
        <div className="runtime-panel__badges">
          <GlassBadge variant="outline">{runtimeLabel}</GlassBadge>
          <GlassBadge variant="default">{modeLabel}</GlassBadge>
          <GlassBadge variant={healthVariant}>{config.apiMode === "backend" ? healthState : "local-first ready"}</GlassBadge>
        </div>
        <p>{config.apiMode === "backend" ? statusMessage : "Everything important stays on this device. The backend is optional unless you explicitly enable it."}</p>
      </section>
    );
  }

  return (
    <section aria-live="polite" className="runtime-panel">
      <div className="runtime-panel__summary">
        <div className="runtime-panel__badges">
          <GlassBadge variant="outline">{runtimeLabel}</GlassBadge>
          <GlassBadge variant="default">{modeLabel}</GlassBadge>
          <GlassBadge variant={healthVariant}>{config.apiMode === "backend" ? healthState : "frontend only"}</GlassBadge>
        </div>
        <div>
          <h2>Runtime status</h2>
          <p>{statusMessage}</p>
        </div>
      </div>
      <div className="runtime-panel__meta">
        <p>{config.apiMode === "backend" ? `Backend: ${config.backendUrl}` : "Backend: optional while local mode is active."}</p>
        <p>{checkedLabel}</p>
      </div>
      {config.apiMode === "backend" ? (
        <div className="runtime-panel__actions">
          <GlassButton onClick={() => void refreshBackendHealth()} size="sm" variant="outline">
            <RefreshCw aria-hidden="true" />
            Retry backend
          </GlassButton>
        </div>
      ) : null}
    </section>
  );
}

function QuickGuideBanner({
  onHide,
}: {
  onHide: () => Promise<void>;
}) {
  return (
    <section aria-live="polite" className="quick-guide-card quick-guide-card--global">
      <h2>Quickstart guide</h2>
      <p>Start a case once to create a dossier with the original audio and its verified hash.</p>
      <p>Then confirm the details, open Destinations, choose where the case should go, approve the brief, and save the filing receipt after you send or export it.</p>
      <div className="button-row">
        <button
          className="secondary-button"
          onClick={() => {
            void onHide();
          }}
          type="button"
        >
          Hide guide
        </button>
      </div>
    </section>
  );
}

export function AuthenticatedShell({
  biometricAvailable,
  biometricEnabled,
  demoCaseId,
  db,
  fullAppWalkthroughEnabled,
  lastOpenPath,
  lockConfigured,
  onLockNow,
  onQuickGuideEnabledChange,
  onQuickGuideSeenChange,
  onRequireUnlockOnOpenChange,
  onSaveAccessSettings,
  quickGuideSeen,
  requireUnlockOnOpen,
  services,
}: {
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  db: DossierDatabase;
  fullAppWalkthroughEnabled: boolean;
  lastOpenPath: string | null;
  lockConfigured: boolean;
  demoCaseId: string | null;
  onLockNow: () => Promise<void>;
  onQuickGuideEnabledChange: (enabled: boolean) => Promise<void>;
  onQuickGuideSeenChange: (quickGuideSeen: boolean) => Promise<void>;
  onRequireUnlockOnOpenChange: (requireUnlockOnOpen: boolean) => Promise<void>;
  onSaveAccessSettings: (input: { pin: string; biometricEnabled: boolean }) => Promise<void>;
  quickGuideSeen: boolean;
  requireUnlockOnOpen: boolean;
  services: AppServices;
}) {
  const defaultPath = normalizeAppPath(lastOpenPath) ?? "/cases";

  return (
    <div className="app-shell">
      <PersistLastOpenPath db={db} />
      <RuntimeStatusPanel />
      {!quickGuideSeen ? <QuickGuideBanner onHide={() => onQuickGuideSeenChange(true)} /> : null}
      <div className="app-shell__content">
        <Routes>
          <Route path="/" element={<Navigate replace to={defaultPath} />} />
          <Route
            path="/capture"
            element={
              <CaptureScreen
                services={services}
              />
            }
          />
          <Route
            path="/cases/:incidentId/capture-saved"
            element={<CaptureSavedScreen db={db} services={services} walkthroughEnabled={false} />}
          />
          <Route
            path="/cases/:incidentId/transcript"
            element={<TranscriptScreen db={db} services={services} walkthroughEnabled={false} />}
          />
          <Route
            path="/cases/:incidentId/facts"
            element={<FactsScreen db={db} services={services} walkthroughEnabled={false} />}
          />
          <Route
            path="/cases/:incidentId/routes"
            element={<CaseRoutesScreen db={db} services={services} />}
          />
          <Route
            path="/cases/:incidentId/draft"
            element={<DraftReportScreen db={db} services={services} />}
          />
          <Route
            path="/cases/:incidentId/send"
            element={<SendHandoffScreen db={db} services={services} />}
          />
          <Route path="/cases/:incidentId/proof" element={<ProofActionScreen db={db} />} />
          <Route
            path="/cases/:incidentId/export"
            element={<ExportCaseFileScreen db={db} services={services} walkthroughEnabled={false} />}
          />
          <Route
            path="/cases/:incidentId"
            element={<CaseFileScreen db={db} demoCaseId={demoCaseId} walkthroughEnabled={false} />}
          />
          <Route
            path="/cases"
            element={
              <CasesScreen
                db={db}
                demoCaseId={demoCaseId}
              />
            }
          />
          <Route path="/routes" element={<RoutesIndexScreen db={db} demoCaseId={demoCaseId} walkthroughEnabled={false} />} />
          <Route
            path="/settings/access"
            element={<AccessSettingsRoute biometricAvailable={biometricAvailable} onSaveAccessSettings={onSaveAccessSettings} />}
          />
          <Route
            path="/settings"
            element={
              <SettingsScreen
                biometricEnabled={biometricEnabled}
                lockConfigured={lockConfigured}
                onLockNow={onLockNow}
                onQuickGuideEnabledChange={onQuickGuideEnabledChange}
                onQuickGuideSeenChange={onQuickGuideSeenChange}
                onRequireUnlockOnOpenChange={onRequireUnlockOnOpenChange}
                quickGuideEnabled={fullAppWalkthroughEnabled}
                quickGuideSeen={quickGuideSeen}
                requireUnlockOnOpen={requireUnlockOnOpen}
              />
            }
          />
        </Routes>
      </div>
      <nav aria-label="Primary" className="bottom-nav">
        <TabLink icon={Mic} to="/capture">Record</TabLink>
        <TabLink icon={FolderOpen} to="/cases">Cases</TabLink>
        <TabLink icon={Send} to="/routes">Report</TabLink>
        <TabLink icon={Settings2} to="/settings">Settings</TabLink>
      </nav>
    </div>
  );
}

export function PersistLastOpenPath({ db }: { db: DossierDatabase }) {
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

export function AccessSettingsRoute({
  biometricAvailable,
  onSaveAccessSettings,
}: {
  biometricAvailable: boolean;
  onSaveAccessSettings: (input: { pin: string; biometricEnabled: boolean }) => Promise<void>;
}) {
  const navigate = useNavigate();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSave(input: { pin: string; biometricEnabled: boolean }) {
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

  return <SecureDeviceScreen biometricAvailable={biometricAvailable} errorMessage={errorMessage} onSave={handleSave} />;
}
