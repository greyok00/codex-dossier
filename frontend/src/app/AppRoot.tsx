import { useEffect, useMemo, useState } from "react";
import { BrowserRouter } from "react-router-dom";

import { sha256Hex } from "@/lib/crypto";
import {
  ensureDemoWalkthroughCase,
  loadBootstrapState,
  setBiometricCredentialId,
  setBiometricPreference,
  setCaptureBriefSeen,
  setDeviceLockHash,
  setFullAppWalkthroughEnabled,
  setLocalAiPrepared,
  setRequireUnlockOnOpen,
} from "@/lib/db";
import { createDefaultAppServices, type AppServices } from "@/lib/runtime";

import { resolveDeviceUnlockError } from "./helpers";
import { ReadmePreview } from "./ReadmePreview";
import { AuthenticatedShell, PrepareLocalAiScreen, UnlockScreen } from "./shell";
import type { AppProps, BootstrapViewState } from "./types";
import { FullScreenShell } from "./ui";

export function App({ services = createDefaultAppServices() }: AppProps) {
  if (typeof window !== "undefined" && window.location.pathname === "/preview/readme") {
    return <ReadmePreview />;
  }

  const [bootstrap, setBootstrap] = useState<BootstrapViewState>({
    ready: false,
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
      setUnlocked(!nextState.lock_hash || !nextState.require_unlock_on_open);
    })();

    void services.deviceUnlock
      .isAvailable()
      .catch(() => false)
      .then((biometricAvailable) => {
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
    let active = true;

    if (!bootstrap.ready || !bootstrap.localAiPreparedAt || !bootstrap.fullAppWalkthroughEnabled) {
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
  }, [bootstrap.fullAppWalkthroughEnabled, bootstrap.localAiPreparedAt, bootstrap.ready, services.db]);

  async function handleLocalAiPrepared(input: { prepared_at: string; model: string }) {
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

  async function handleSecureDevice(input: { pin: string; biometricEnabled: boolean }) {
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

  const runtimeServices = useMemo<AppServices>(() => ({
    ...services,
  }), [services]);

  if (!bootstrap.ready) {
    return <FullScreenShell title="Loading Dossier" body="Preparing this device." actionSlot={null} />;
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

  if (!bootstrap.localAiPreparedAt) {
    return <PrepareLocalAiScreen model={bootstrap.localAiModel} onPrepared={handleLocalAiPrepared} services={services} />;
  }

  return (
    <BrowserRouter>
      <AuthenticatedShell
        biometricAvailable={bootstrap.biometricAvailable}
        biometricEnabled={bootstrap.biometricEnabled}
        captureBriefSeen={bootstrap.captureBriefSeen}
        db={runtimeServices.db}
        demoCaseId={demoCaseId}
        fullAppWalkthroughEnabled={bootstrap.fullAppWalkthroughEnabled}
        lastOpenPath={bootstrap.lastOpenPath}
        lockConfigured={Boolean(bootstrap.lockHash)}
        onCaptureBriefSeen={handleCaptureBriefSeen}
        onLockNow={handleLockNow}
        onRequireUnlockOnOpenChange={handleRequireUnlockOnOpenChange}
        onSaveAccessSettings={handleSecureDevice}
        requireUnlockOnOpen={bootstrap.requireUnlockOnOpen}
        services={runtimeServices}
      />
    </BrowserRouter>
  );
}
