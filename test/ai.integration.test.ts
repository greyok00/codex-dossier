import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../src/app.js";
import { createPool } from "../src/db/pool.js";
import { ServiceUnavailableError } from "../src/lib/errors.js";
import type { GoogleTokenVerifier } from "../src/services/auth/types.js";
import type { AIProvider, AudioUploadResolver, ResolvedAudioUpload } from "../src/services/ai/types.js";
import type { AudioUpload, DraftPacket, FactSet, ModelMetadata, TranscriptDocument } from "../src/services/contracts.js";
import { countTable, resetTestDatabase } from "./helpers/test-db.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  test("ai integration tests require TEST_DATABASE_URL", { skip: true }, () => {});
} else {
  test.describe("ai integration", { concurrency: false }, () => {
    const pool = createPool({ connectionString: testDatabaseUrl });
    const fakeGoogleTokenVerifier: GoogleTokenVerifier = {
      async verifyFirebaseIdToken(firebaseIdToken) {
        if (firebaseIdToken !== "test-firebase-id-token") {
          throw new Error("unexpected test token");
        }
        return {
          google_sub: "google-sub-test",
          email: "reviewer@example.com",
          email_verified: true,
          display_name: "Alex Grey",
          photo_url: "https://example.com/photo.jpg",
        };
      },
    };

    const fakeAudioResolver: AudioUploadResolver = {
      async resolve(upload: AudioUpload): Promise<ResolvedAudioUpload> {
        if (upload.upload_mode === "inline_base64") {
          return {
            filename: upload.filename,
            mime_type: upload.mime_type,
            size_bytes: upload.size_bytes,
            content: Buffer.from(upload.content_base64, "base64"),
          };
        }

        return {
          filename: upload.filename,
          mime_type: upload.mime_type,
          size_bytes: upload.size_bytes,
          content: Buffer.from(`object:${upload.object_key}`),
        };
      },
    };

    const fakeAIProvider: AIProvider = {
      async transcribe(input) {
        const transcript: TranscriptDocument = {
          full_text: `Transcript for ${input.audio.filename}`,
          language: input.language_hint ?? "en",
          segment_count: 2,
          segments: [
            {
              start_ms: 0,
              end_ms: 1500,
              speaker_label: null,
              text: "Caller described the incident.",
              confidence: 0.98,
            },
            {
              start_ms: 1500,
              end_ms: 3000,
              speaker_label: null,
              text: "Caller named the business and the charge amount.",
              confidence: 0.97,
            },
          ],
        };

        return {
          transcript,
          model_metadata: metadata("transcribe", "gpt-4o-transcribe", {
            input_audio_seconds: 3,
            output_tokens: 120,
          }),
          warnings: [],
        };
      },

      async extract(input) {
        if (input.transcript.full_text.includes("FAIL_EXTRACT")) {
          throw new Error("extract_failed");
        }

        return {
          fact_set: {
            incident_type: "consumer_billing",
            people: ["Store manager"],
            places: [input.context.location_address ?? "Phoenix, AZ"],
            businesses: [input.context.confirmed_place_name ?? "Acme Market"],
            phones: [input.context.confirmed_place_phone ?? "+1-602-555-0100"],
            dates: ["2026-04-08"],
            amounts: ["42.17"],
            timeline: [
              {
                time_label: "8:14 PM",
                description: "A duplicate charge appeared after the purchase.",
              },
            ],
            key_facts: ["The same transaction was charged twice."],
          },
          model_metadata: metadata("extract", "gpt-5.1-mini", {
            input_characters: input.transcript.full_text.length,
            input_tokens: 210,
            output_tokens: 92,
          }),
          warnings: [],
        };
      },

      async draft(input) {
        const draftPacket: Omit<DraftPacket, "draft_packet_id" | "incident_id" | "destination_id" | "version" | "approved"> = {
          subject: `Report for ${input.selected_route.destination_name_snapshot}`,
          body: `I am reporting ${input.fact_set.incident_type ?? "the incident"} involving ${input.selected_route.destination_name_snapshot}.`,
          attachments: [],
        };

        return {
          draft_packet: draftPacket,
          model_metadata: metadata("draft", "gpt-5.1-mini", {
            input_characters: JSON.stringify(input.fact_set).length,
            input_tokens: 180,
            output_tokens: 140,
          }),
          warnings: [],
        };
      },
    };

    const app = buildApp(pool, {
      googleTokenVerifier: fakeGoogleTokenVerifier,
      aiProvider: fakeAIProvider,
      audioUploadResolver: fakeAudioResolver,
    });

    async function login() {
      const response = await app.inject({
        method: "POST",
        url: "/v1/auth/google",
        payload: {
          firebase_id_token: "test-firebase-id-token",
          device: {
            install_id: "4f6f39e0-c365-4c9e-9a19-18cd29d3d9a0",
            platform: "ios",
            app_version: "0.1.0",
            user_agent: "integration-test",
          },
        },
      });
      assert.equal(response.statusCode, 200);
      return response.json().data.session.session_token as string;
    }

    test.before(async () => {
      await app.ready();
    });

    test.after(async () => {
      await app.close();
      await pool.end();
    });

    test.beforeEach(async () => {
      await resetTestDatabase(pool);
    });

    test("POST /v1/ai/transcribe accepts inline audio and writes ai_request_log", async () => {
      const sessionToken = await login();
      const response = await app.inject({
        method: "POST",
        url: "/v1/ai/transcribe",
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          incident_id: "dd4d2ddd-5294-4e41-aa15-0b5992f70627",
          source_evidence_id: "6c3980b7-5cea-489a-879e-b5c6e93ec726",
          source_evidence_sha256: "abc123",
          upload: {
            upload_mode: "inline_base64",
            filename: "capture.m4a",
            mime_type: "audio/mp4",
            size_bytes: 12,
            content_base64: Buffer.from("hello world!").toString("base64"),
          },
          language_hint: "en",
          include_timestamps: true,
        },
      });

      assert.equal(response.statusCode, 200);
      const payload = response.json();
      assert.equal(payload.data.transcript.full_text, "Transcript for capture.m4a");
      assert.equal(payload.data.model_metadata.model, "gpt-4o-transcribe");
      assert.equal(payload.data.transcript.segment_count, 2);
      assert.equal(await countTable(pool, "dossier_backend.ai_request_log"), 1);

      const logRow = await pool.query<{ purpose: string; model: string; status: string }>(`
        SELECT purpose, model, status
        FROM dossier_backend.ai_request_log
        LIMIT 1
      `);
      assert.equal(logRow.rows[0]?.purpose, "transcribe");
      assert.equal(logRow.rows[0]?.model, "gpt-4o-transcribe");
      assert.equal(logRow.rows[0]?.status, "completed");
    });

    test("POST /v1/ai/transcribe returns 503 when the AI provider is unavailable", async () => {
      const unavailableApp = buildApp(pool, {
        googleTokenVerifier: fakeGoogleTokenVerifier,
        aiProvider: {
          async transcribe() {
            throw new ServiceUnavailableError("OpenAI is not configured.");
          },
          async extract() {
            throw new ServiceUnavailableError("OpenAI is not configured.");
          },
          async draft() {
            throw new ServiceUnavailableError("OpenAI is not configured.");
          },
        },
        audioUploadResolver: fakeAudioResolver,
      });

      await unavailableApp.ready();

      try {
        const response = await unavailableApp.inject({
          method: "POST",
          url: "/v1/ai/transcribe",
          payload: {
            incident_id: "b60a9ce1-9a8b-4f56-a8ce-c458221a854f",
            source_evidence_id: "437f5d8c-177f-4911-a8c0-86a6503ef88b",
            source_evidence_sha256: "abc123",
            upload: {
              upload_mode: "inline_base64",
              filename: "capture.m4a",
              mime_type: "audio/mp4",
              size_bytes: 12,
              content_base64: Buffer.from("hello world!").toString("base64"),
            },
            include_timestamps: true,
          },
        });

        assert.equal(response.statusCode, 503);
        assert.equal(response.json().error.code, "SERVICE_UNAVAILABLE");
      } finally {
        await unavailableApp.close();
      }
    });

    test("POST /v1/ai/transcribe accepts object storage audio references", async () => {
      const sessionToken = await login();
      const response = await app.inject({
        method: "POST",
        url: "/v1/ai/transcribe",
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          incident_id: "482e95bd-cd44-4574-821a-b1d0cefd5ccb",
          source_evidence_id: "12f2c4b6-819b-4350-8a5f-978388711ce4",
          source_evidence_sha256: "def456",
          upload: {
            upload_mode: "object_storage_reference",
            filename: "capture.wav",
            mime_type: "audio/wav",
            size_bytes: 18,
            object_key: "uploads/capture.wav",
          },
        },
      });

      assert.equal(response.statusCode, 200);
      assert.equal(response.json().data.transcript.full_text, "Transcript for capture.wav");
    });

    test("POST /v1/ai/extract returns a fact set and writes ai_request_log", async () => {
      const sessionToken = await login();
      const response = await app.inject({
        method: "POST",
        url: "/v1/ai/extract",
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          incident_id: "6dc99fc3-a827-46e8-a7c6-54c30434dcc6",
          transcript_evidence_id: "ac8d61ea-b89c-4fd7-b65d-b1bcaf2e02d3",
          transcript: {
            full_text: "I was charged twice at Acme Market.",
            language: "en",
            segment_count: 1,
            segments: [
              {
                start_ms: 0,
                end_ms: 1000,
                speaker_label: null,
                text: "I was charged twice at Acme Market.",
                confidence: 0.99,
              },
            ],
          },
          context: {
            location_address: "123 Main St, Phoenix, AZ 85004",
            confirmed_place_id: "place-acme-market",
            confirmed_place_name: "Acme Market",
            confirmed_place_phone: "+1-602-555-0100",
          },
        },
      });

      assert.equal(response.statusCode, 200);
      const payload = response.json();
      assert.equal(payload.data.fact_set.incident_type, "consumer_billing");
      assert.equal(payload.data.model_metadata.model, "gpt-5.1-mini");

      const logRow = await pool.query<{ purpose: string; status: string }>(`
        SELECT purpose, status
        FROM dossier_backend.ai_request_log
        ORDER BY requested_at DESC
        LIMIT 1
      `);
      assert.equal(logRow.rows[0]?.purpose, "extract");
      assert.equal(logRow.rows[0]?.status, "completed");
    });

    test("POST /v1/ai/draft returns a draft packet and writes ai_request_log", async () => {
      const sessionToken = await login();
      const response = await app.inject({
        method: "POST",
        url: "/v1/ai/draft",
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          incident_id: "df49a20d-bde3-4826-a6cc-a1970284b7be",
          fact_set: sampleFactSet(),
          selected_route: sampleRoute(),
          transcript_excerpt: "I was charged twice at Acme Market.",
          desired_tone: "plain_serious",
        },
      });

      assert.equal(response.statusCode, 200);
      const payload = response.json();
      assert.equal(payload.data.draft_packet.subject, "Report for Arizona Consumer Complaint");
      assert.equal(payload.data.draft_packet.destination_id, sampleRoute().destination_id);
      assert.equal(payload.data.model_metadata.model, "gpt-5.1-mini");

      const logRow = await pool.query<{ purpose: string; status: string }>(`
        SELECT purpose, status
        FROM dossier_backend.ai_request_log
        ORDER BY requested_at DESC
        LIMIT 1
      `);
      assert.equal(logRow.rows[0]?.purpose, "draft");
      assert.equal(logRow.rows[0]?.status, "completed");
    });

    test("failed AI extraction marks ai_request_log as failed", async () => {
      const sessionToken = await login();
      const response = await app.inject({
        method: "POST",
        url: "/v1/ai/extract",
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          incident_id: "d2460f7f-36af-4eba-8d31-57647f77f657",
          transcript_evidence_id: "0d5196a1-893f-4cbb-a688-4f967f8bfd90",
          transcript: {
            full_text: "FAIL_EXTRACT",
            language: "en",
            segment_count: 1,
            segments: [
              {
                start_ms: 0,
                end_ms: 1000,
                speaker_label: null,
                text: "FAIL_EXTRACT",
                confidence: 1,
              },
            ],
          },
          context: {
            location_address: null,
            confirmed_place_id: null,
            confirmed_place_name: null,
            confirmed_place_phone: null,
          },
        },
      });

      assert.equal(response.statusCode, 500);
      const logRow = await pool.query<{ purpose: string; status: string; error_code: string | null }>(`
        SELECT purpose, status, error_code
        FROM dossier_backend.ai_request_log
        ORDER BY requested_at DESC
        LIMIT 1
      `);
      assert.equal(logRow.rows[0]?.purpose, "extract");
      assert.equal(logRow.rows[0]?.status, "failed");
      assert.equal(logRow.rows[0]?.error_code, "Error");
    });
  });
}

function metadata(
  purpose: ModelMetadata["purpose"],
  model: string,
  extras: Partial<Pick<ModelMetadata, "input_audio_seconds" | "input_characters" | "input_tokens" | "output_tokens">> = {},
): ModelMetadata {
  return {
    provider: "openai",
    model,
    purpose,
    requested_at: "2026-04-08T04:00:00Z",
    completed_at: "2026-04-08T04:00:01Z",
    latency_ms: 1000,
    input_audio_seconds: extras.input_audio_seconds ?? null,
    input_characters: extras.input_characters ?? null,
    input_tokens: extras.input_tokens ?? null,
    output_tokens: extras.output_tokens ?? null,
  };
}

function sampleFactSet(): FactSet {
  return {
    fact_set_id: "090af2bb-65e8-49c2-b21e-b8bd6ee76c1e",
    incident_type: "consumer_billing",
    people: ["Store manager"],
    places: ["Phoenix, AZ"],
    businesses: ["Acme Market"],
    phones: ["+1-602-555-0100"],
    dates: ["2026-04-08"],
    amounts: ["42.17"],
    timeline: [
      {
        time_label: "8:14 PM",
        description: "A duplicate charge appeared after the purchase.",
      },
    ],
    key_facts: ["The same transaction was charged twice."],
    reviewed_by_user: true,
  };
}

function sampleRoute() {
  return {
    destination_id: "3bd52fb5-22e8-52c5-8ba5-cb9f8300a77e",
    destination_name_snapshot: "Arizona Consumer Complaint",
    destination_type_snapshot: "state_agency",
    route_category: "State" as const,
    rank: 1,
    reason: "This route fits a consumer complaint about goods or services in Arizona.",
    source_label: "azag.gov",
    source_url: "https://www.azag.gov/complaints/consumer",
    last_verified_date: "2026-04-07",
    trust_level: "official" as const,
    intake_methods_snapshot: ["web_form", "phone"] as const,
    required_documents_snapshot: ["receipts", "screenshots"],
    available_actions: ["open_form", "call", "share_packet", "export_packet", "save_for_later"] as const,
    destination: {
      destination_id: "3bd52fb5-22e8-52c5-8ba5-cb9f8300a77e",
      destination_name: "Arizona Consumer Complaint",
      destination_type: "state_agency" as const,
      jurisdiction: {
        country: "US" as const,
        state: "AZ",
        county: null,
        city: null,
      },
      categories_handled: ["consumer_billing"],
      intake_methods: ["web_form", "phone"] as const,
      complaint_url: "https://consumer-complaint.azag.gov/",
      email: null,
      phone: "+1-602-542-5763",
      mailing_address: null,
      source_url: "https://www.azag.gov/complaints/consumer",
      last_verified_date: "2026-04-07",
      trust_level: "official" as const,
      notes_required_fields: ["business_name"],
      notes_required_documents: ["receipts"],
    },
  };
}
