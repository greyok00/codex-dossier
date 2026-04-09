import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../src/app.js";
import { createPool } from "../src/db/pool.js";
import type { GoogleTokenVerifier } from "../src/services/auth/types.js";
import type { AttachmentReference, DestinationDto, RouteRecommendation } from "../src/services/contracts.js";
import { countTable, resetTestDatabase } from "./helpers/test-db.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  test("submission integration tests require TEST_DATABASE_URL", { skip: true }, () => {});
} else {
  test.describe("submission integration", { concurrency: false }, () => {
    const compiledBundlePath = "/home/grey/codex-dossier/generated/routing-registry/routing_registry_compiled_bundle.json";
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
    const app = buildApp(pool, {
      googleTokenVerifier: fakeGoogleTokenVerifier,
      internalRegistryApiKey: "test-internal-key",
    });
    const internalHeaders = {
      "x-internal-registry-key": "test-internal-key",
    };

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

    async function importCompiledRegistry() {
      const response = await app.inject({
        method: "POST",
        url: "/internal/registry/import",
        headers: internalHeaders,
        payload: {
          compiled_bundle_path: compiledBundlePath,
        },
      });
      assert.equal(response.statusCode, 200);
    }

    async function getDestination(sessionToken: string, destinationId: string) {
      const response = await app.inject({
        method: "GET",
        url: `/v1/routes/${destinationId}`,
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
      });
      assert.equal(response.statusCode, 200);
      return response.json().data.destination as DestinationDto;
    }

    function buildSelectedRoute(destination: DestinationDto, overrides: Partial<RouteRecommendation> = {}): RouteRecommendation {
      return {
        destination_id: destination.destination_id,
        destination_name_snapshot: destination.destination_name,
        destination_type_snapshot: destination.destination_type,
        route_category: "Federal",
        rank: 1,
        reason: "This route fits a federal privacy complaint backed by an official source.",
        source_label: new URL(destination.source_url).hostname.replace(/^www\./, ""),
        source_url: destination.source_url,
        last_verified_date: destination.last_verified_date,
        trust_level: destination.trust_level,
        intake_methods_snapshot: destination.intake_methods,
        required_documents_snapshot: destination.notes_required_documents,
        available_actions: [
          "open_form",
          "email",
          "call",
          "share_packet",
          "export_packet",
          "save_for_later",
        ],
        destination,
        ...overrides,
      };
    }

    function attachment(): AttachmentReference {
      return {
        evidence_id: "13b9b028-6304-490b-a006-6826d8237863",
        label: "Original audio",
        mime_type: "audio/mp4",
        sha256: "abc123",
      };
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

    test("POST /v1/submission/email-preview builds a registry-backed email preview", async () => {
      const sessionToken = await login();
      await importCompiledRegistry();
      const destination = await getDestination(sessionToken, "0cc39a18-847d-5493-ad8b-80c07a8bdd06");
      const selectedRoute = buildSelectedRoute(destination, {
        destination: null,
      });

      const response = await app.inject({
        method: "POST",
        url: "/v1/submission/email-preview",
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          incident_id: "6b2c31e0-d43b-4997-bf2f-e88df1f4c198",
          selected_route: selectedRoute,
          draft_packet: {
            draft_packet_id: "d037e863-ef3c-46b0-90aa-59f1f93f25c0",
            incident_id: "6b2c31e0-d43b-4997-bf2f-e88df1f4c198",
            destination_id: destination.destination_id,
            subject: "Privacy complaint",
            body: "I am reporting a privacy issue and attaching the case packet.",
            attachments: [attachment()],
            version: 1,
            approved: true,
          },
        },
      });

      assert.equal(response.statusCode, 200);
      const payload = response.json();
      assert.deepEqual(payload.data.email_preview.to, ["ocrmail@hhs.gov"]);
      assert.deepEqual(payload.data.email_preview.cc, []);
      assert.equal(payload.data.email_preview.subject, "Privacy complaint");
      assert.equal(payload.data.email_preview.destination_name_snapshot, destination.destination_name);
      assert.equal(payload.data.email_preview.source_url, destination.source_url);
      assert.equal(payload.data.email_preview.trust_level, "official");
    });

    test("POST /v1/submission/record-action writes submission_action_record and returns source metadata", async () => {
      const sessionToken = await login();
      await importCompiledRegistry();
      const destination = await getDestination(sessionToken, "0cc39a18-847d-5493-ad8b-80c07a8bdd06");
      const selectedRoute = buildSelectedRoute(destination);

      const response = await app.inject({
        method: "POST",
        url: "/v1/submission/record-action",
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          submission_proof: {
            submission_proof_id: "2e674def-341e-4ad3-b9f4-c441ed12d842",
            incident_id: "4d257cf8-0fc3-4d99-a6b2-5166d54d8450",
            destination_id: destination.destination_id,
            method: "email",
            status: "sent",
            confirmation_number: "EMAIL-12345",
            external_reference_url: "https://mail.example/thread/12345",
            notes: "Sent to the listed address.",
            attachments: [attachment()],
            created_at: "2026-04-08T03:45:00Z",
          },
          selected_route: selectedRoute,
          custody_event: {
            action: "send_action_recorded",
            actor: "user",
            details_json: {
              event: "send_action_recorded",
              submission_proof_id: "2e674def-341e-4ad3-b9f4-c441ed12d842",
              destination_id: destination.destination_id,
              method: "email",
              status: "sent",
              target_label: destination.destination_name,
              external_reference_url: "https://mail.example/thread/12345",
            },
          },
        },
      });

      assert.equal(response.statusCode, 200);
      const payload = response.json();
      assert.equal(payload.data.destination_source.destination_id, destination.destination_id);
      assert.equal(payload.data.destination_source.source_url, destination.source_url);
      assert.equal(payload.data.destination_source.trust_level, "official");
      assert.match(payload.data.server_reference_id, /^[0-9a-f-]{36}$/);
      assert.equal(await countTable(pool, "dossier_backend.submission_action_record"), 1);

      const rowResult = await pool.query<{
        destination_id: string | null;
        destination_name_snapshot: string;
        trust_level: string;
        method: string;
        status: string;
        attachments_json: Array<{ evidence_id: string }>;
        custody_event_json: {
          action: string;
          actor: string;
          details_json: { event: string; target_label: string };
        };
      }>(`
        SELECT
          destination_id::text,
          destination_name_snapshot,
          trust_level,
          method,
          status,
          attachments_json,
          custody_event_json
        FROM dossier_backend.submission_action_record
        LIMIT 1
      `);

      assert.equal(rowResult.rows[0]?.destination_id, destination.destination_id);
      assert.equal(rowResult.rows[0]?.destination_name_snapshot, destination.destination_name);
      assert.equal(rowResult.rows[0]?.trust_level, "official");
      assert.equal(rowResult.rows[0]?.method, "email");
      assert.equal(rowResult.rows[0]?.status, "sent");
      assert.equal(rowResult.rows[0]?.attachments_json.length, 1);
      assert.equal(rowResult.rows[0]?.custody_event_json.action, "send_action_recorded");
      assert.equal(rowResult.rows[0]?.custody_event_json.details_json.event, "send_action_recorded");
      assert.equal(rowResult.rows[0]?.custody_event_json.details_json.target_label, destination.destination_name);
    });

    test("POST /v1/submission/record-action rejects mismatched route and proof destinations", async () => {
      const sessionToken = await login();
      await importCompiledRegistry();
      const destination = await getDestination(sessionToken, "0cc39a18-847d-5493-ad8b-80c07a8bdd06");
      const selectedRoute = buildSelectedRoute(destination);

      const response = await app.inject({
        method: "POST",
        url: "/v1/submission/record-action",
        headers: {
          authorization: `Bearer ${sessionToken}`,
        },
        payload: {
          submission_proof: {
            submission_proof_id: "0ac30b97-9eaf-42b0-8fb5-34f41cfa49f5",
            incident_id: "624f9720-49ad-4ca0-975f-85e0fccf7e18",
            destination_id: "a89b52a7-5261-59d4-8280-b89369ddd9e3",
            method: "email",
            status: "sent",
            confirmation_number: null,
            external_reference_url: null,
            notes: null,
            attachments: [],
            created_at: "2026-04-08T04:00:00Z",
          },
          selected_route: selectedRoute,
          custody_event: {
            action: "send_action_recorded",
            actor: "user",
            details_json: {
              event: "send_action_recorded",
              submission_proof_id: "0ac30b97-9eaf-42b0-8fb5-34f41cfa49f5",
              destination_id: destination.destination_id,
              method: "email",
              status: "sent",
              target_label: destination.destination_name,
              external_reference_url: null,
            },
          },
        },
      });

      assert.equal(response.statusCode, 422);
      assert.equal(await countTable(pool, "dossier_backend.submission_action_record"), 0);
    });
  });
}
