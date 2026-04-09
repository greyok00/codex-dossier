import assert from "node:assert/strict";
import test from "node:test";

import { buildApp } from "../src/app.js";
import { createPool } from "../src/db/pool.js";
import type { RouteReasoningService } from "../src/services/routing/service.js";
import type { GoogleTokenVerifier } from "../src/services/auth/types.js";
import type { ModelMetadata, VenueMatch } from "../src/services/contracts.js";
import type { PlaceProvider } from "../src/services/venue/provider.js";
import { countTable, resetTestDatabase } from "./helpers/test-db.js";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  test("venue and routing integration tests require TEST_DATABASE_URL", { skip: true }, () => {});
} else {
  test.describe("venue and routing integration", { concurrency: false }, () => {
    const compiledBundlePath = "/home/grey/codex-dossier/generated/routing-registry/routing_registry_compiled_bundle.json";
    const jsonExamplePath = "/home/grey/codex-dossier/docs/routing-seed-pack/routing_registry_import_example.json";
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

    const fakePlaceProvider: PlaceProvider = {
      async search() {
        return [
          {
            provider: "test_places",
            place_id: "place-acme-market",
            business_name: "Acme Market",
            address: "123 Main St, Phoenix, AZ 85004",
            phone: "+1-602-555-0100",
            website: "https://acmemarket.example/contact",
            lat: 33.4484,
            lng: -112.074,
            source_label: "Test Places",
            source_url: "https://places.example/acme-market",
            trust_level: "directory",
            provider_confidence: 0.62,
            captured_at: "2026-04-08T02:15:00Z",
          },
          {
            provider: "test_places",
            place_id: "place-acme-plaza",
            business_name: "Acme Plaza",
            address: "125 Main St, Phoenix, AZ 85004",
            phone: "+1-602-555-0199",
            website: "https://acmeplaza.example",
            lat: 33.4485,
            lng: -112.0741,
            source_label: "Test Places",
            source_url: "https://places.example/acme-plaza",
            trust_level: "directory",
            provider_confidence: 0.71,
            captured_at: "2026-04-08T02:15:00Z",
          },
        ];
      },
    };

    const fakeRouteReasoner: RouteReasoningService = {
      async rankCandidates(input) {
        const ranked = [...input.candidates].sort((left, right) => {
          if (left.route.route_category !== right.route.route_category) {
            return left.route.route_category.localeCompare(right.route.route_category);
          }
          return right.score - left.score;
        });

        return {
          ranked,
          model_metadata: {
            provider: "openai",
            model: "gpt-5.1-mini",
            purpose: "route_reasoning",
            requested_at: "2026-04-08T02:20:00Z",
            completed_at: "2026-04-08T02:20:00Z",
            latency_ms: 0,
            input_characters: JSON.stringify(input.fact_set).length,
            input_tokens: null,
            output_tokens: null,
          } satisfies ModelMetadata,
        };
      },
    };

    const app = buildApp(pool, {
      googleTokenVerifier: fakeGoogleTokenVerifier,
      internalRegistryApiKey: "test-internal-key",
      placeProvider: fakePlaceProvider,
      routeReasoner: fakeRouteReasoner,
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

    test("POST /v1/venue/match ranks matches and writes venue_match_cache", async () => {
    const sessionToken = await login();

    const response = await app.inject({
      method: "POST",
      url: "/v1/venue/match",
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
      payload: {
        incident_id: "0dcb4f79-a7b1-49b2-b407-83557afb1d07",
        location: {
          lat: 33.4484,
          lng: -112.074,
          address: "123 Main St, Phoenix, AZ 85004",
        },
        transcript_excerpt: "I am inside Acme Market and need to report a billing problem.",
        business_hints: ["Acme Market"],
      },
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json();
    assert.equal(payload.data.matches.length, 2);
    assert.equal(payload.data.matches[0].business_name, "Acme Market");
    assert.equal(payload.data.matches[0].source_label, "Test Places");
    assert.equal(payload.data.matches[0].trust_level, "directory");
    assert.ok(payload.data.matches[0].match_confidence > payload.data.matches[1].match_confidence);
    assert.equal(await countTable(pool, "dossier_backend.venue_match_cache"), 2);

    const cacheResult = await pool.query<{ provider: string; place_id: string; source_url: string; trust_level: string }>(`
      SELECT provider, place_id, source_url, trust_level
      FROM dossier_backend.venue_match_cache
      ORDER BY place_id
    `);
    assert.equal(cacheResult.rows.length, 2);
    assert.equal(cacheResult.rows[0]?.provider, "test_places");
    assert.equal(cacheResult.rows[0]?.trust_level, "directory");
    });

    test("POST /v1/routes/recommend returns ordered route groups with source-backed route data", async () => {
    const sessionToken = await login();
    await importCompiledRegistry();

    const confirmedPlace: VenueMatch = {
      provider: "test_places",
      place_id: "place-acme-market",
      business_name: "Acme Market",
      address: "123 Main St, Phoenix, AZ 85004",
      phone: "+1-602-555-0100",
      website: "https://acmemarket.example/contact",
      lat: 33.4484,
      lng: -112.074,
      match_confidence: 0.97,
      source_label: "Test Places",
      source_url: "https://places.example/acme-market",
      trust_level: "directory",
      captured_at: "2026-04-08T02:15:00Z",
    };

    const response = await app.inject({
      method: "POST",
      url: "/v1/routes/recommend",
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
      payload: {
        incident_id: "c768f75b-f764-4863-9228-db79a80c5d89",
        fact_set: {
          fact_set_id: "e8b65333-e0a9-41b2-9d6c-612bd53812c8",
          incident_type: "consumer_billing",
          people: [],
          places: ["Phoenix, AZ"],
          businesses: ["Acme Market"],
          phones: [],
          dates: ["2026-04-08"],
          amounts: ["42.17"],
          timeline: [
            {
              time_label: "8:14 PM",
              description: "The business charged twice for one purchase.",
            },
          ],
          key_facts: ["A duplicate charge was posted after a retail transaction."],
          reviewed_by_user: true,
        },
        confirmed_place: confirmedPlace,
        location_context: {
          state: "AZ",
          city: "Phoenix",
          address: "123 Main St, Phoenix, AZ 85004",
        },
      },
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json();
    const routeGroups = payload.data.route_groups as Array<{ route_category: string; routes: Array<Record<string, unknown>> }>;
    assert.deepEqual(
      routeGroups.map((group) => group.route_category),
      ["Business", "Local", "State", "Federal", "Other verified routes"],
    );
    assert.equal(payload.data.registry_version, "2026.04.07.60");
    assert.equal(payload.data.model_metadata.model, "gpt-5.1-mini");
    assert.equal(routeGroups[0]?.routes[0]?.destination_name_snapshot, "Acme Market");
    assert.equal(routeGroups[2]?.routes[0]?.destination_name_snapshot, "Arizona Consumer Complaint");
    assert.equal(routeGroups[2]?.routes[0]?.source_label, "azag.gov");
    assert.equal(routeGroups[2]?.routes[0]?.trust_level, "official");
    assert.equal(routeGroups[3]?.routes[0]?.destination_name_snapshot, "FTC ReportFraud Portal");
    assert.equal(routeGroups[3]?.routes[0]?.source_label, "reportfraud.ftc.gov");
    });

    test("GET /v1/routes/:destinationId returns aggregated destination detail", async () => {
    const sessionToken = await login();
    const importResponse = await app.inject({
      method: "POST",
      url: "/internal/registry/import",
      headers: internalHeaders,
      payload: {
        seed_inputs: [jsonExamplePath],
      },
    });
    assert.equal(importResponse.statusCode, 200);

    const destinationRow = await pool.query<{ id: string }>(`
      SELECT id
      FROM dossier_backend.destination
      LIMIT 1
    `);
    const destinationId = destinationRow.rows[0]?.id;
    assert.ok(destinationId);

    const response = await app.inject({
      method: "GET",
      url: `/v1/routes/${destinationId}`,
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json();
    assert.equal(payload.data.destination.destination_name, "Arizona Attorney General Consumer Complaint");
    assert.deepEqual(payload.data.destination.intake_methods, ["web_form", "phone"]);
    assert.equal(payload.data.destination.trust_level, "official");
    assert.equal(payload.data.destination.source_url, "https://www.azag.gov/complaints/consumer");
    assert.equal(payload.data.destination.complaint_url, "https://consumer-complaint.azag.gov/");
    assert.equal(payload.data.destination.phone, "+1-602-542-5763");
    });

    test("GET /v1/routes/:destinationId returns 404 for unknown destinations", async () => {
    const sessionToken = await login();
    await importCompiledRegistry();

    const response = await app.inject({
      method: "GET",
      url: "/v1/routes/4f8f59f4-0e71-4c48-b308-2747a603e0d4",
      headers: {
        authorization: `Bearer ${sessionToken}`,
      },
    });

    assert.equal(response.statusCode, 404);
    });
  });
}
