import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "../App";
import {
  DossierDatabase,
} from "../lib/db";
import { createLocalApiClient, type LocalTranscriber } from "../lib/local-ai";
import type { AppServices } from "../lib/runtime";

class FakeTrack {
  stop = vi.fn();
}

class FakeMediaStream {
  private readonly tracks = [new FakeTrack()];

  getTracks() {
    return this.tracks;
  }
}

class FakeMediaRecorder extends EventTarget {
  readonly mimeType = "audio/webm";

  start() {
    // No-op for tests.
  }

  stop() {
    const dataEvent = new Event("dataavailable") as Event & { data: Blob };
    dataEvent.data = new Blob(["test audio"], { type: this.mimeType });
    this.dispatchEvent(dataEvent);
    this.dispatchEvent(new Event("stop"));
  }
}

function renderApp(services: AppServices) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
      mutations: {
        retry: false,
      },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <App services={services} />
    </QueryClientProvider>,
  );
}

async function flushUi() {
  await Promise.resolve();
}

async function clickAndSettle(element: Element) {
  await userEvent.click(element as HTMLElement);
  await flushUi();
}

async function typeAndSettle(element: Element, text: string) {
  await userEvent.type(element as HTMLElement, text);
  await flushUi();
}

function createServices(db: DossierDatabase, overrides: Partial<AppServices> = {}): AppServices {
  return {
    db,
    api: createLocalApiClient({
      transcriber: createFakeTranscriber(),
      enableEnhancedDraft: false,
    }),
    deviceUnlock: {
      isAvailable: vi.fn().mockResolvedValue(false),
      createCredential: vi.fn().mockResolvedValue("credential-id"),
      authenticate: vi.fn().mockResolvedValue(undefined),
    },
    share: vi.fn().mockResolvedValue(true),
    openExternal: vi.fn().mockResolvedValue(undefined),
    downloadFile: vi.fn().mockResolvedValue(undefined),
    getUserMedia: vi.fn().mockResolvedValue(new FakeMediaStream() as unknown as MediaStream),
    createMediaRecorder: vi.fn().mockImplementation(() => new FakeMediaRecorder() as unknown as MediaRecorder),
    getCurrentPosition: vi.fn().mockResolvedValue({
      lat: 33.4484,
      lng: -112.074,
      address: "Phoenix, AZ 85004",
    }),
    ...overrides,
  };
}

async function enterApp() {
  let nextHeading = await screen.findByRole("heading", { name: /^(get dossier ready|start a case|cases|choose where to report)$/i });
  if (/^get dossier ready$/i.test(nextHeading.textContent ?? "")) {
    const prepareButton = screen.queryByRole("button", { name: /^(retry setup|downloading models)$/i });
    if (prepareButton) {
      await userEvent.click(prepareButton);
    }
    nextHeading = await screen.findByRole("heading", { name: /^(start a case|cases|choose where to report)$/i });
  }
  if (!/^start a case$/i.test(nextHeading.textContent ?? "")) {
    await screen.findByRole("link", { name: /^record$/i });
    await userEvent.click(screen.getByRole("link", { name: /^record$/i }));
  }
  await screen.findByRole("heading", { name: /^start a case$/i });
}

async function createCapture() {
  const startButtons = screen.getAllByRole("button", { name: /start recording/i });
  const startButton = startButtons[0];
  if (!startButton) {
    throw new Error("Start recording control was not found");
  }
  await clickAndSettle(startButton);
  await waitFor(() => expect(screen.getAllByRole("button", { name: /stop recording/i }).length).toBeGreaterThan(0));
  const stopButtons = screen.getAllByRole("button", { name: /stop recording/i });
  const stopButton = stopButtons[0];
  if (!stopButton) {
    throw new Error("Stop capture control was not found");
  }
  await clickAndSettle(stopButton);
  await screen.findByRole("heading", { name: /recording saved/i });
}

describe("frontend local-first scaffold", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("opens without a startup lock, then enables unlock from settings and unlocks with a PIN", async () => {
    const db = new DossierDatabase(`frontend-local-auth-${crypto.randomUUID()}`);
    const services = createServices(db);

    renderApp(services);
    await enterApp();
    await userEvent.click(screen.getByRole("link", { name: /^settings$/i }));
    await screen.findByRole("heading", { name: /^settings$/i });

    expect(screen.getByText(/unlock on open: off/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("link", { name: /set device code/i }));
    await screen.findByRole("heading", { name: /secure this device/i });
    await userEvent.type(screen.getByLabelText(/device code/i), "2468");
    await userEvent.type(screen.getByLabelText(/confirm code/i), "2468");
    await userEvent.click(screen.getByRole("button", { name: /save device code/i }));

    await screen.findByRole("heading", { name: /^settings$/i });
    await userEvent.click(screen.getByLabelText(/require unlock on open/i));
    expect(await screen.findByText(/unlock on open: on/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /lock now/i }));

    await screen.findByRole("heading", { name: /unlock case access/i });
    await userEvent.type(screen.getByLabelText(/device code/i), "2468");
    await userEvent.click(screen.getByRole("button", { name: /unlock/i }));
    await screen.findByRole("heading", { name: /^settings$/i });

    expect(await db.settings.get("device_lock_hash")).toBeTruthy();
    expect((await db.settings.get("require_unlock_on_open"))?.value).toBe(true);
    await db.delete();
  });

  it("uses optional device unlock when it is enabled on the device", async () => {
    const db = new DossierDatabase(`frontend-device-unlock-${crypto.randomUUID()}`);
    const deviceUnlock = {
      isAvailable: vi.fn().mockResolvedValue(true),
      createCredential: vi.fn().mockResolvedValue("device-credential"),
      authenticate: vi.fn().mockResolvedValue(undefined),
    };
    const services = createServices(db, {
      deviceUnlock,
    });

    renderApp(services);
    await enterApp();
    await userEvent.click(screen.getByRole("link", { name: /^settings$/i }));
    await screen.findByRole("heading", { name: /^settings$/i });
    await userEvent.click(screen.getByRole("link", { name: /set device code/i }));

    await screen.findByRole("heading", { name: /secure this device/i });
    await userEvent.type(screen.getByLabelText(/device code/i), "2468");
    await userEvent.type(screen.getByLabelText(/confirm code/i), "2468");
    const biometricToggle = screen.queryByLabelText(/use device unlock when available/i);
    if (biometricToggle) {
      await userEvent.click(biometricToggle);
    }
    await userEvent.click(screen.getByRole("button", { name: /save device code/i }));

    await screen.findByRole("heading", { name: /^settings$/i });
    await userEvent.click(screen.getByLabelText(/require unlock on open/i));
    await userEvent.click(screen.getByRole("button", { name: /lock now/i }));
    await screen.findByRole("heading", { name: /unlock case access/i });
    const unlockButton = screen.queryByRole("button", { name: /use device unlock/i });
    if (unlockButton) {
      await userEvent.click(unlockButton);
      await screen.findByRole("heading", { name: /^settings$/i });
      expect((await db.settings.get("device_biometric_enabled"))?.value).toBe(true);
      expect((await db.settings.get("device_biometric_credential_id"))?.value).toBe("device-credential");
      expect(deviceUnlock.createCredential).toHaveBeenCalled();
      expect(deviceUnlock.authenticate).toHaveBeenCalled();
    } else {
      await userEvent.type(screen.getByLabelText(/device code/i), "2468");
      await userEvent.click(screen.getByRole("button", { name: /unlock/i }));
      await screen.findByRole("heading", { name: /^settings$/i });
      expect(deviceUnlock.authenticate).not.toHaveBeenCalled();
    }
    await db.delete();
  });

  it("stores a local audio capture with a hash and custody log entry", async () => {
    const db = new DossierDatabase(`frontend-capture-${crypto.randomUUID()}`);

    renderApp(createServices(db));
    await enterApp();
    await createCapture();

    const incidents = await db.incidents.toArray();
    const evidence = await db.evidence_items.toArray();
    const logEntries = await db.custody_log.toArray();

    expect(incidents).toHaveLength(1);
    expect(evidence).toHaveLength(1);
    expect(logEntries).toHaveLength(1);
    expect(evidence[0]?.integrity_status).toBe("verified");
    expect(evidence[0]?.sha256).toHaveLength(64);
    expect(logEntries[0]?.action).toBe("evidence_created");
    await db.delete();
  });

  it("shows quick teaching on first open and keeps settings focused on device controls", async () => {
    const db = new DossierDatabase(`frontend-quick-guide-${crypto.randomUUID()}`);

    renderApp(createServices(db));
    await screen.findByRole("heading", { name: /^cases$/i });
    await screen.findByText(/start a case once to create a dossier with the original audio and its verified hash\./i);
    await userEvent.click(screen.getByRole("button", { name: /hide guide/i }));
    await waitFor(() => expect(screen.queryByText(/start a case once to create a dossier/i)).not.toBeInTheDocument());

    await userEvent.click(screen.getByRole("link", { name: /^settings$/i }));
    await screen.findByRole("heading", { name: /^settings$/i });
    expect(screen.getByText(/^quickstart guide$/i)).toBeInTheDocument();
    expect(screen.getByText(/the guide is currently hidden across the app\./i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /show guide on all pages/i })).toBeInTheDocument();
    expect(screen.getByText(/manage privacy, the quickstart guide, and device access\./i)).toBeInTheDocument();

    await db.delete();
  });

  it("builds a local transcript from the saved capture and shows transcript segments", async () => {
    const db = new DossierDatabase(`frontend-transcript-${crypto.randomUUID()}`);

    renderApp(createServices(db));
    await enterApp();
    await createCapture();

    await clickAndSettle(await screen.findByRole("button", { name: /create transcript/i }));
    await screen.findByRole("heading", { name: /^review transcript$/i, level: 1 });
    await screen.findByText(/Xenova\/whisper-tiny\.en/i);
    expect(screen.getAllByText(/desert market/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/speaker 1/i)).toHaveLength(2);

    const transcriptRows = await db.transcripts.toArray();
    const segmentRows = await db.transcript_segments.toArray();
    const logEntries = await db.custody_log.toArray();

    expect(transcriptRows).toHaveLength(1);
    expect(segmentRows).toHaveLength(2);
    expect(logEntries.some((entry) => entry.action === "transcript_created")).toBe(true);
    await db.delete();
  });

  it("builds facts, confirms them, then stores and displays route recommendations in locked order", async () => {
    const db = new DossierDatabase(`frontend-routes-${crypto.randomUUID()}`);

    renderApp(createServices(db));
    await enterApp();
    await createCapture();

    await clickAndSettle(await screen.findByRole("button", { name: /create transcript/i }));
    await screen.findByRole("heading", { name: /^review transcript$/i, level: 1 });
    await userEvent.click(screen.getByRole("button", { name: /review details|check details/i }));

    await screen.findByRole("heading", { name: /^check case details$/i, level: 1 });
    await screen.findByText(/these details were pulled from the transcript\. edit only if something is wrong or missing\./i);
    await clickAndSettle(screen.getByRole("button", { name: /save details/i }));
    await screen.findByText(/saved and added to the case history/i);

    await userEvent.click(screen.getByRole("link", { name: /find reporting options|choose where to report/i }));
    await screen.findByRole("heading", { name: /choose where to report/i });
    await clickAndSettle(screen.getByRole("button", { name: /find reporting options/i }));

    expect((await screen.findAllByRole("heading", { name: /desert market public contact/i })).length).toBeGreaterThan(0);
    expect((await screen.findAllByRole("heading", { name: /arizona consumer complaint/i })).length).toBeGreaterThan(0);
    expect((await screen.findAllByRole("heading", { name: /better business bureau complaint/i })).length).toBeGreaterThan(0);

    const businessRouteHeading = (await screen.findAllByRole("heading", { name: /desert market public contact/i })).at(-1);
    const businessRouteCard = businessRouteHeading?.closest("section");
    if (!businessRouteCard) {
      throw new Error("Business route card not found");
    }
    expect(within(businessRouteCard).getByRole("button", { name: /^write report$/i })).toBeInTheDocument();

    const routeCards = await db.route_recommendations.toArray();
    const routeGroups = routeCards
      .slice()
      .sort((left, right) => routeRank(left.route_group) - routeRank(right.route_group))
      .map((route) => route.route_group);
    expect(routeGroups).toEqual(expect.arrayContaining(["Business", "State", "Federal", "Other"]));
    expect(routeGroups.length).toBeGreaterThanOrEqual(4);

    const arizonaRouteHeading = screen.getAllByRole("heading", { name: /arizona consumer complaint/i }).at(-1);
    const arizonaRouteCard = arizonaRouteHeading?.closest("section");
    if (!arizonaRouteCard) {
      throw new Error("Arizona route card not found");
    }
    await clickAndSettle(within(arizonaRouteCard).getByRole("button", { name: /make current/i }));

    const updatedRoutes = (await db.route_recommendations.toArray()).sort((left, right) =>
      left.route_group.localeCompare(right.route_group),
    );
    const selectedRoute = updatedRoutes.find((route) => route.selected);
    const logs = await db.custody_log.toArray();

    expect(selectedRoute).toBeTruthy();
    expect(logs.some((entry) => entry.action === "route_selected")).toBe(true);
    await db.delete();
  });

  it("prepares a draft, records share and proof actions, and exports the case file", async () => {
    const db = new DossierDatabase(`frontend-case-flow-${crypto.randomUUID()}`);
    const share = vi.fn().mockResolvedValue(true);
    const downloadFile = vi.fn().mockResolvedValue(undefined);
    const clipboardWriteText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: clipboardWriteText,
      },
    });

    renderApp(
      createServices(db, {
        share,
        downloadFile,
      }),
    );

    await enterApp();
    await createCapture();

    await clickAndSettle(await screen.findByRole("button", { name: /create transcript/i }));
    await screen.findByRole("heading", { name: /^review transcript$/i, level: 1 });
    await userEvent.click(screen.getByRole("button", { name: /review details|check details/i }));

    await screen.findByRole("heading", { name: /^check case details$/i, level: 1 });
    await screen.findByText(/these details were pulled from the transcript\. edit only if something is wrong or missing\./i);
    await clickAndSettle(screen.getByRole("button", { name: /save details/i }));
    await screen.findByText(/saved and added to the case history/i);

    await userEvent.click(screen.getByRole("link", { name: /find reporting options|choose where to report/i }));
    await screen.findByRole("heading", { name: /choose where to report/i });
    await clickAndSettle(screen.getByRole("button", { name: /find reporting options/i }));
    expect((await screen.findAllByRole("heading", { name: /arizona consumer complaint/i })).length).toBeGreaterThan(0);

    const arizonaRouteHeading = screen.getAllByRole("heading", { name: /arizona consumer complaint/i }).at(-1);
    const arizonaRouteCard = arizonaRouteHeading?.closest("section");
    if (!arizonaRouteCard) {
      throw new Error("Arizona route card not found");
    }
    await clickAndSettle(within(arizonaRouteCard).getByRole("button", { name: /write report/i }));

    await screen.findByRole("heading", { name: /^write report$/i, level: 1 });
    await screen.findByDisplayValue(/Consumer billing:\s*desert market/i);
    await clickAndSettle(screen.getByRole("button", { name: /approve brief/i }));
    await screen.findByRole("heading", { name: /^send report$/i, level: 1 });
    await screen.findByRole("button", { name: /share packet/i });
    await clickAndSettle(screen.getByRole("button", { name: /copy report text/i }));
    await waitFor(() => expect(clipboardWriteText).toHaveBeenCalled());
    expect(String(clipboardWriteText.mock.calls[0]?.[0] ?? "")).toMatch(/Destination:\s*Arizona Consumer Complaint/i);
    await clickAndSettle(screen.getByRole("button", { name: /share packet/i }));
    await userEvent.click(screen.getByRole("link", { name: /save confirmation|save receipt/i }));
    await screen.findByRole("heading", { name: /^save confirmation$/i, level: 1 });
    await typeAndSettle(await screen.findByLabelText(/confirmation number/i), "ABC-123");
    await typeAndSettle(screen.getByLabelText(/proof note/i), "Shared with the route packet.");
    await clickAndSettle(screen.getByRole("button", { name: /save receipt/i }));

    await screen.findByRole("heading", { name: /^dossier$/i, level: 1 });
    expect(screen.getAllByText(/Consumer billing/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/arizona consumer complaint/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ABC-123/i).length).toBeGreaterThan(0);

    await userEvent.click(screen.getByRole("link", { name: /^export packet$/i }));
    await screen.findByRole("heading", { name: /^download case packet$/i, level: 1 });
    await clickAndSettle(screen.getByRole("button", { name: /download zip/i }));

    await waitFor(() => expect(downloadFile).toHaveBeenCalled());
    expect(share).toHaveBeenCalledTimes(1);

    const draftPackets = await db.draft_packets.toArray();
    const proofs = await db.submission_proofs.toArray();
    const evidence = await db.evidence_items.toArray();
    const logs = await db.custody_log.toArray();

    expect(draftPackets).toHaveLength(1);
    expect(draftPackets[0]?.approved).toBe(true);
    expect(proofs).toHaveLength(1);
    expect(proofs[0]?.confirmation_number).toBe("ABC-123");
    expect(evidence.some((entry) => entry.type === "export")).toBe(true);
    expect(evidence.some((entry) => entry.type === "proof")).toBe(true);
    expect(logs.some((entry) => entry.action === "draft_approved")).toBe(true);
    expect(logs.some((entry) => entry.action === "send_action_recorded")).toBe(true);
    expect(logs.some((entry) => entry.action === "share_completed")).toBe(true);
    expect(logs.some((entry) => entry.action === "proof_saved")).toBe(true);
    expect(logs.filter((entry) => entry.action === "export_created").length).toBeGreaterThanOrEqual(2);
    await db.delete();
  });
});

function createFakeTranscriber(): LocalTranscriber {
  return {
    async prepare(input = {}) {
      input.onProgress?.({
        stage: "download",
        label: "Downloading offline speech tools.",
        progress: 60,
        loaded_bytes: 600,
        total_bytes: 1000,
        file: "model.onnx",
        model: "Xenova/whisper-tiny.en",
      });
      input.onProgress?.({
        stage: "ready",
        label: "Offline speech tools are ready on this device.",
        progress: 100,
        loaded_bytes: 1000,
        total_bytes: 1000,
        file: "model.onnx",
        model: "Xenova/whisper-tiny.en",
      });
      return {
        model: "Xenova/whisper-tiny.en",
        prepared_at: new Date().toISOString(),
        cached: false,
        warnings: [],
      };
    },

    async transcribe(input) {
      input.onProgress?.({
        stage: "transcribe",
        label: "Transcribing the saved capture on this device.",
        progress: null,
        loaded_bytes: null,
        total_bytes: null,
        file: null,
        model: "Xenova/whisper-tiny.en",
      });
      return {
        text: "I was charged twice at Desert Market and the manager refused a refund. The charge is still unresolved.",
        language: input.languageHint ?? "en",
        segments: [
          {
            start_ms: 0,
            end_ms: 2400,
            speaker_label: "Speaker 1",
            text: "I was charged twice at Desert Market and the manager refused a refund.",
            confidence: 0.88,
          },
          {
            start_ms: 2400,
            end_ms: 4800,
            speaker_label: "Speaker 1",
            text: "The charge is still unresolved.",
            confidence: 0.86,
          },
        ],
        warnings: [],
        model: "Xenova/whisper-tiny.en",
      };
    },
  };
}

function routeRank(group: string) {
  switch (group) {
    case "Business":
      return 0;
    case "Local":
      return 1;
    case "State":
      return 2;
    case "Federal":
      return 3;
    case "Other":
      return 4;
    default:
      return 99;
  }
}
