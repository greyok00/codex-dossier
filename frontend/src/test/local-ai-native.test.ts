import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: () => true,
  },
}));

describe("local AI native fallbacks", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("", {
          status: 404,
        }),
      ),
    );
  });

  it("skips enhanced draft preparation on native when the writing model is not bundled", async () => {
    const { createLocalApiClient } = await import("../lib/local-ai");
    const client = createLocalApiClient({
      transcriber: {
        prepare: async () => ({
          model: "Xenova/whisper-tiny.en",
          prepared_at: "2026-04-15T00:00:00.000Z",
          cached: true,
          warnings: [],
        }),
        transcribe: vi.fn(),
      },
    });

    const prepared = await client.prepareLocalAi();

    expect(prepared.warnings).toContain(
      "Enhanced local writing is not bundled in this app build. Using standard local draft mode.",
    );
  });

  it("falls back to the template draft on native when the writing model is not bundled", async () => {
    const { createLocalApiClient } = await import("../lib/local-ai");
    const client = createLocalApiClient({
      transcriber: {
        prepare: async () => ({
          model: "Xenova/whisper-tiny.en",
          prepared_at: "2026-04-15T00:00:00.000Z",
          cached: true,
          warnings: [],
        }),
        transcribe: vi.fn(),
      },
    });

    const drafted = await client.draft({
      incident_id: crypto.randomUUID(),
      route_recommendation_id: crypto.randomUUID(),
      fact_set: {
        fact_set_id: crypto.randomUUID(),
        incident_type: "consumer_billing",
        people: ["Manager"],
        places: ["Phoenix, AZ 85004"],
        businesses: ["Desert Market"],
        phones: [],
        dates: ["April 8, 2026"],
        amounts: ["$42.17"],
        timeline: [
          {
            time_label: "00:00",
            description: "The customer reported a duplicate charge.",
          },
        ],
        key_facts: ["The customer reported a duplicate charge.", "The manager refused a refund."],
        reviewed_by_user: true,
      },
      route: {
        destination_id: null,
        destination_name_snapshot: "Arizona Consumer Complaint",
        destination_type_snapshot: "State consumer complaint",
        route_group: "State",
        rank: 1,
        reason: "This route fits a consumer complaint about goods or services in Arizona.",
        source_label: "azag.gov",
        source_url: "https://consumer-complaint.azag.gov/",
        trust_level: "official",
        last_verified_date: null,
        intake_methods_snapshot: ["web_form"],
        required_documents_snapshot: [],
        available_actions: ["open_url"],
      },
    });

    expect(drafted.model_metadata.model).toBe("template-draft-v1");
    expect(drafted.warnings).toContain(
      "Enhanced local writing is not bundled in this app build. Using standard local draft mode.",
    );
  });

  it("does not instantiate the whisper pipeline during native setup", async () => {
    const pipeline = vi.fn();
    vi.doMock("@huggingface/transformers", () => ({
      env: {
        useBrowserCache: true,
        allowLocalModels: true,
        allowRemoteModels: false,
        localModelPath: "/models/",
      },
      pipeline,
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/models/Xenova/whisper-tiny.en/config.json")) {
          return Promise.resolve(new Response("", { status: 200 }));
        }
        return Promise.resolve(new Response("", { status: 404 }));
      }),
    );

    const { createWhisperTinyTranscriber } = await import("../lib/local-ai");
    const transcriber = createWhisperTinyTranscriber();
    if (typeof transcriber.prepare !== "function") {
      throw new Error("Expected native transcriber prepare() to exist.");
    }
    const prepared = await transcriber.prepare();

    expect(prepared.model).toBe("Xenova/whisper-tiny.en");
    expect(pipeline).not.toHaveBeenCalled();
  });

  it("keeps bundled native writing deferred until the first draft", async () => {
    const pipeline = vi.fn();
    vi.doMock("@huggingface/transformers", () => ({
      env: {
        useBrowserCache: true,
        allowLocalModels: true,
        allowRemoteModels: false,
        localModelPath: "/models/",
      },
      pipeline,
    }));

    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (
          url.includes("/models/Xenova/whisper-tiny.en/config.json") ||
          url.includes("/models/Qwen/Qwen2.5-0.5B-Instruct/config.json")
        ) {
          return Promise.resolve(new Response("", { status: 200 }));
        }
        return Promise.resolve(new Response("", { status: 404 }));
      }),
    );

    const { createLocalApiClient } = await import("../lib/local-ai");
    const client = createLocalApiClient();
    const prepared = await client.prepareLocalAi();

    expect(prepared.model).toBe("Xenova/whisper-tiny.en");
    expect(prepared.warnings).toEqual([]);
    expect(pipeline).not.toHaveBeenCalled();
  });
});
