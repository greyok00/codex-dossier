import type { AppServices } from "@/lib/runtime";

export interface AppProps {
  services?: AppServices;
}

export interface BootstrapViewState {
  ready: boolean;
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

export interface ActiveCapture {
  recorder: MediaRecorder;
  stream: MediaStream;
  stopPromise: Promise<Blob>;
  stopResolver: (blob: Blob) => void;
  stopRejector: (reason?: unknown) => void;
  startTimeMs: number;
  mimeType: string;
  chunks: Blob[];
}

export interface FactsFormState {
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

export interface DraftFormState {
  subject: string;
  body: string;
}
